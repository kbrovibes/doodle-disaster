import { createClient } from "@supabase/supabase-js";
import { RoomState } from "./types";
import { sanitize } from "./engine";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const db = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export class RoomError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function loadRoom(
  id: string
): Promise<{ state: RoomState; version: number }> {
  const { data, error } = await db
    .from("doodle_rooms")
    .select("state, version")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new RoomError(error.message, 500);
  if (!data) throw new RoomError("Room not found", 404);
  return { state: data.state as RoomState, version: data.version };
}

export async function saveRoom(
  id: string,
  state: RoomState,
  expectedVersion: number
): Promise<boolean> {
  const { data, error } = await db
    .from("doodle_rooms")
    .update({
      state,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("version", expectedVersion)
    .select("id");
  if (error) throw new RoomError(error.message, 500);
  return (data?.length ?? 0) > 0;
}

export async function insertRoom(id: string, state: RoomState): Promise<boolean> {
  const { error } = await db
    .from("doodle_rooms")
    .insert({ id, state, version: 0 });
  if (error) {
    if (error.code === "23505") return false; // duplicate id
    throw new RoomError(error.message, 500);
  }
  return true;
}

/**
 * Housekeeping, run opportunistically when someone makes a room.
 *
 * Abandoned games used to sit at "drawing" forever, which is how 65 rooms ended
 * up permanently claiming to be live in everybody's Recent Games. Anything
 * untouched for half a day is closed out; anything untouched for a fortnight
 * goes, along with its drawings.
 */
export async function pruneStale(): Promise<void> {
  try {
    const cold = new Date(Date.now() - 12 * 3600_000).toISOString();
    const ancient = new Date(Date.now() - 14 * 86400_000).toISOString();

    const { data: dead } = await db
      .from("doodle_rooms")
      .select("id")
      .lt("updated_at", ancient)
      .limit(50);
    const ids = (dead ?? []).map((r) => r.id as string);
    if (ids.length) {
      // drawings not yet copied to the gallery are kept for the archive job,
      // which copes fine with their room being gone
      await db
        .from("doodle_shots")
        .delete()
        .in("room_id", ids)
        .not("archived_at", "is", null);
      await db.from("doodle_rooms").delete().in("id", ids);
    }

    const { data: stuck } = await db
      .from("doodle_rooms")
      .select("id, state, version")
      .lt("updated_at", cold)
      .limit(50);
    for (const row of stuck ?? []) {
      const state = row.state as RoomState;
      if (state.phase === "gameover") continue;
      state.phase = "gameover";
      state.drawerId = null;
      await db
        .from("doodle_rooms")
        .update({ state, version: (row.version as number) + 1 })
        .eq("id", row.id)
        .eq("version", row.version);
    }
  } catch {
    // housekeeping must never break the request that triggered it
  }
}

// --- the counter behind the home screen footer ---------------------------

/**
 * Games are counted when they START, not when they finish.
 *
 * Most games never reach a formal ending — people close the tab, and the room
 * gets tidied up hours later by pruneStale. Counting starts is one increment
 * per game actually played, it lands the moment it happens, and "Play again"
 * correctly counts as another game.
 */
export async function bumpGamesPlayed(): Promise<void> {
  try {
    await db.rpc("doodle_bump_stat", { k: "games_played", by: 1 });
  } catch {
    // a stat is never worth failing a request over
  }
}

export interface DoodleStats {
  played: number;
  live: number;
}

/**
 * How many games have ever been played, and how many are being played right
 * now. "Right now" means a room that is past the lobby and was touched in the
 * last few minutes — a tab someone left open in the drawing phase yesterday is
 * not a live game.
 */
export async function readStats(): Promise<DoodleStats> {
  const fresh = new Date(Date.now() - 6 * 60_000).toISOString();
  const [total, rooms] = await Promise.all([
    db.from("doodle_stats").select("n").eq("key", "games_played").maybeSingle(),
    db
      .from("doodle_rooms")
      .select("state")
      .gt("updated_at", fresh)
      .limit(200),
  ]);
  const live = (rooms.data ?? []).filter((r) => {
    const phase = (r.state as RoomState)?.phase;
    return phase && phase !== "lobby" && phase !== "gameover";
  }).length;
  return { played: Number(total.data?.n ?? 0), live };
}

/** Push sanitized (spectator-view) state to everyone in the room channel. */
export async function broadcastState(roomId: string, state: RoomState) {
  const now = Date.now();
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `room:${roomId}`,
            event: "state",
            payload: sanitize(state, null, now),
            private: false,
          },
        ],
      }),
    });
  } catch (e) {
    console.error("broadcast failed", e);
  }
}

/**
 * Load-mutate-save with optimistic concurrency retry.
 * mutate() may throw RoomError to abort. Return value bubbles out.
 */
export async function withRoom<T>(
  id: string,
  mutate: (state: RoomState, now: number) => T,
  {
    broadcast = true,
    saveIf,
  }: { broadcast?: boolean; saveIf?: (result: T) => boolean } = {}
): Promise<{ state: RoomState; result: T }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { state, version } = await loadRoom(id);
    const now = Date.now();
    const wasLobby = state.phase === "lobby";
    const result = mutate(state, now);
    if (saveIf && !saveIf(result)) return { state, result };
    const ok = await saveRoom(id, state, version);
    if (ok) {
      // lobby -> anything else happens in exactly one place, startGame, so
      // this is one increment per game without the engine knowing about a
      // database at all
      if (wasLobby && state.phase !== "lobby") void bumpGamesPlayed();
      if (broadcast) await broadcastState(id, state);
      return { state, result };
    }
  }
  throw new RoomError("Room is busy, try again", 409);
}
