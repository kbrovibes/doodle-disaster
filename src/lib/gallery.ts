import { db } from "./server";
import { RoomState } from "./types";

export const GALLERY_BUCKET = "doodles";

export interface GalleryRow {
  id: string;
  room_id: string;
  turn: number;
  round: number | null;
  word: string;
  drawer_id: string | null;
  drawer_name: string | null;
  drawer_avatar: string | null;
  difficulty: string | null;
  mode: string | null;
  theme: string | null;
  path: string;
  drawn_at: string;
}

export function publicUrl(path: string): string {
  return db.storage.from(GALLERY_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Copy finished drawings out of doodle_shots (base64 in a text column, wiped
 * on "Play again" and when a room is pruned) into real image files in Storage,
 * with a row in doodle_gallery that remembers who drew what, at which
 * difficulty, in which kind of game.
 *
 * Only ever called from after() or the cron route — never on the path of a
 * game request. Idempotent: a shot is marked archived only once its file and
 * row both exist, and re-running simply overwrites the same file and row.
 */
export async function archiveShots({
  roomId,
  limit = 50,
}: { roomId?: string; limit?: number } = {}): Promise<{
  archived: number;
  failed: number;
  remaining: boolean;
}> {
  let q = db
    .from("doodle_shots")
    .select("room_id, turn, word, drawer_id, image, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (roomId) q = q.eq("room_id", roomId);
  const { data: shots, error } = await q;
  if (error) throw new Error(error.message);
  if (!shots?.length) return { archived: 0, failed: 0, remaining: false };

  const roomIds = [...new Set(shots.map((s) => s.room_id as string))];
  const { data: rooms } = await db
    .from("doodle_rooms")
    .select("id, state")
    .in("id", roomIds);
  const stateOf = new Map(
    (rooms ?? []).map((r) => [r.id as string, r.state as RoomState])
  );

  let archived = 0;
  let failed = 0;
  for (const s of shots) {
    try {
      const room = s.room_id as string;
      const turn = s.turn as number;
      const drawnAt = new Date(s.created_at as string);
      const m = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(s.image as string);
      if (!m) {
        // nothing usable to keep; mark it so the job stops tripping over it
        await markArchived(room, turn);
        continue;
      }
      const [, mime, b64] = m;
      const bytes = Buffer.from(b64, "base64");
      const ext = mime === "image/png" ? "png" : "jpg";
      const stamp = drawnAt.getTime();
      const yyyy = drawnAt.getUTCFullYear();
      const mm = String(drawnAt.getUTCMonth() + 1).padStart(2, "0");
      const path = `${yyyy}/${mm}/${room}-${turn}-${stamp}.${ext}`;

      const up = await db.storage
        .from(GALLERY_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);

      const state = stateOf.get(room);
      const drawer = state?.players.find((p) => p.id === s.drawer_id);
      const row = {
        source_key: `${room}:${turn}:${stamp}`,
        room_id: room,
        turn,
        round: Math.floor(turn / 1000) || null,
        word: s.word as string,
        drawer_id: (s.drawer_id as string) ?? null,
        drawer_name: drawer?.name ?? null,
        drawer_avatar: drawer?.avatar ?? null,
        difficulty: state?.settings.difficulty ?? null,
        mode: state ? state.settings.mode ?? "classic" : null,
        theme: state?.customWords?.theme ?? state?.settings.themePacks?.join(",") ?? null,
        path,
        bytes: bytes.length,
        drawn_at: drawnAt.toISOString(),
      };
      const ins = await db
        .from("doodle_gallery")
        .upsert(row, { onConflict: "source_key" });
      if (ins.error) throw new Error(ins.error.message);

      await markArchived(room, turn);
      archived++;
    } catch (e) {
      failed++;
      console.error("archive shot failed", s.room_id, s.turn, (e as Error).message);
    }
  }
  return { archived, failed, remaining: shots.length === limit };
}

async function markArchived(roomId: string, turn: number) {
  await db
    .from("doodle_shots")
    .update({ archived_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("turn", turn);
}
