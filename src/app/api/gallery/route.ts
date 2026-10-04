import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server";
import { GalleryRow, publicUrl } from "@/lib/gallery";

const PAGE = 40;

/**
 * The archive, newest first, filtered and paged.
 *   ?offset=&player=&difficulty=&mode=&room=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=word
 *   ?facets=1 — the player / difficulty / mode lists the filter bar offers
 *
 * When GALLERY_KEY is set, callers must send it as `x-gallery-key`.
 */
export async function GET(req: NextRequest) {
  const key = process.env.GALLERY_KEY;
  if (key && req.headers.get("x-gallery-key") !== key)
    return NextResponse.json({ error: "locked" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  try {
    if (sp.get("facets")) return NextResponse.json(await facets());

    const offset = Math.max(0, Number(sp.get("offset")) || 0);
    let q = db
      .from("doodle_gallery")
      .select(
        "id, room_id, turn, round, word, drawer_id, drawer_name, drawer_avatar, difficulty, mode, theme, path, drawn_at",
        { count: "exact" }
      )
      .order("drawn_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE - 1);

    const player = sp.get("player");
    if (player === "__unknown") q = q.is("drawer_name", null);
    else if (player) q = q.ilike("drawer_name", escapeLike(player));
    const difficulty = sp.get("difficulty");
    if (difficulty) q = q.eq("difficulty", difficulty);
    const room = sp.get("room");
    if (room) q = q.eq("room_id", room.toLowerCase());
    const mode = sp.get("mode");
    if (mode) q = q.eq("mode", mode);
    const word = sp.get("q")?.trim();
    if (word) q = q.ilike("word", `%${escapeLike(word)}%`);
    const tz = Number(sp.get("tz")) || 0; // client's getTimezoneOffset()
    const from = dayStart(sp.get("from"), tz);
    if (from) q = q.gte("drawn_at", from.toISOString());
    const to = dayStart(sp.get("to"), tz);
    if (to) q = q.lt("drawn_at", new Date(to.getTime() + 86400_000).toISOString());

    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    const items = ((data ?? []) as GalleryRow[]).map((r) => ({
      id: r.id,
      url: publicUrl(r.path),
      word: r.word,
      drawerName: r.drawer_name,
      drawerAvatar: r.drawer_avatar,
      difficulty: r.difficulty,
      mode: r.mode,
      theme: r.theme,
      roomId: r.room_id,
      round: r.round,
      drawnAt: r.drawn_at,
    }));
    return NextResponse.json({
      items,
      total: count ?? items.length,
      nextOffset: items.length === PAGE ? offset + PAGE : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function facets() {
  const { data, error } = await db
    .from("doodle_gallery")
    .select("drawer_name, drawer_avatar, difficulty, mode, drawn_at")
    .order("drawn_at", { ascending: false })
    .limit(20000);
  if (error) throw new Error(error.message);
  const players = new Map<string, { name: string; avatar: string | null; count: number }>();
  const difficulties: Record<string, number> = {};
  const modes: Record<string, number> = {};
  let unknown = 0;
  for (const r of data ?? []) {
    const name = (r.drawer_name as string | null)?.trim();
    if (name) {
      // the same person across games, however they capitalised it that night
      const k = name.toLowerCase();
      const p = players.get(k) ?? { name, avatar: r.drawer_avatar as string | null, count: 0 };
      p.count++;
      players.set(k, p);
    } else unknown++;
    const d = (r.difficulty as string | null) ?? "unknown";
    difficulties[d] = (difficulties[d] ?? 0) + 1;
    const m = (r.mode as string | null) ?? "classic";
    modes[m] = (modes[m] ?? 0) + 1;
  }
  return {
    total: data?.length ?? 0,
    players: [...players.values()].sort((a, b) => b.count - a.count),
    unknownPlayers: unknown,
    difficulties,
    modes,
    oldest: data?.length ? data[data.length - 1].drawn_at : null,
  };
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** local midnight of a YYYY-MM-DD in the viewer's timezone */
function dayStart(v: string | null, tzOffsetMin: number): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return new Date(d.getTime() + tzOffsetMin * 60_000);
}
