import { NextRequest, NextResponse } from "next/server";
import { newRoom, sanitize } from "@/lib/engine";
import { goofyRoomId, pickAvatar } from "@/lib/names";
import { THEMES } from "@/lib/wordbank/themes";
import { db, insertRoom, pruneStale, RoomError } from "@/lib/server";
import { Player, RoomState } from "@/lib/types";

/**
 * Read-only status for the rooms a client has saved locally.
 * ?q=room:playerId,room2:playerId2 — deliberately does no healing or writes.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const pairs = q
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((s) => {
        const [roomId, playerId] = s.split(":");
        return { roomId: (roomId ?? "").toLowerCase(), playerId: playerId ?? "" };
      })
      .filter((p) => p.roomId);
    if (pairs.length === 0) return NextResponse.json({ rooms: [] });

    const { data, error } = await db
      .from("doodle_rooms")
      .select("id, state, updated_at")
      .in(
        "id",
        pairs.map((p) => p.roomId)
      );
    if (error) throw new RoomError(error.message, 500);

    const STALE_MS = 12 * 60 * 60 * 1000;
    const rooms = pairs.map(({ roomId, playerId }) => {
      const row = data?.find((r) => r.id === roomId);
      if (!row) return { roomId, exists: false };
      const state = row.state as RoomState;
      const fresh =
        Date.now() - new Date(row.updated_at as string).getTime() < STALE_MS;
      return {
        roomId,
        exists: true,
        phase: state.phase,
        players: state.players.filter((p) => !p.isBot).length,
        round: state.round,
        totalRounds: state.settings.rounds,
        mine: state.players.some((p) => p.id === playerId),
        live: state.phase !== "gameover" && fresh,
      };
    });
    return NextResponse.json({ rooms });
  } catch (e) {
    const maybe = (e as { status?: number }).status;
    const status = typeof maybe === "number" ? maybe : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    // the collection route had no parse guard, so a malformed body 500'd and
    // leaked the raw V8 parser message
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const name = String(body.name ?? "").trim().slice(0, 20);
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const chosen = String(body.avatar ?? "");
    const player: Player = {
      id: crypto.randomUUID(),
      name,
      avatar: /^a([0-9]|[1-3][0-9])$/.test(chosen) ? chosen : pickAvatar([]),
      score: 0,
      connected: true,
      joinedAt: Date.now(),
    };
    // the creating device hands us where its group's word ring got to
    const salt = Number(body.seedSalt);
    const rawCursor = body.seedCursor as Record<string, unknown> | undefined;
    const cursor: Record<string, number> = {};
    if (rawCursor && typeof rawCursor === "object") {
      for (const k of ["kids", "normal", "chaos", "ultra"]) {
        const v = Number(rawCursor[k]);
        if (Number.isInteger(v) && v >= 0 && v < 100000) cursor[k] = v;
      }
    }
    const known = new Set(THEMES.map((t) => t.key));
    const themePacks = Array.isArray(body.themePacks)
      ? (body.themePacks as unknown[])
          .filter((k): k is string => typeof k === "string")
          .filter((k) => known.has(k))
          .slice(0, 12)
      : [];
    const state = newRoom(
      player,
      themePacks.length ? { themePacks } : undefined,
      { salt: Number.isFinite(salt) ? salt >>> 0 : undefined, cursor }
    );

    let roomId = goofyRoomId();
    for (let i = 0; i < 5; i++) {
      if (await insertRoom(roomId, state)) break;
      roomId = goofyRoomId();
      if (i === 4) throw new RoomError("Could not create room", 500);
    }

    // one room in twelve pays for the tidying, so abandoned games can't pile up
    if (Math.random() < 1 / 12) await pruneStale();

    return NextResponse.json({
      roomId,
      playerId: player.id,
      state: sanitize(state, player.id, Date.now()),
    });
  } catch (e) {
    const maybe = (e as { status?: number }).status;
    const status = typeof maybe === "number" ? maybe : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
