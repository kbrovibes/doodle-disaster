"use client";

/**
 * The scrapbook: finished games kept on this device so you can flick back
 * through the night's drawings.
 *
 * The server already keeps every shot (doodle_shots) and the final room state,
 * so nothing is lost if a phone is wiped — but browsing is deliberately served
 * from here, which makes opening an old game instant and costs the free tier
 * nothing.
 *
 * Images are downscaled jpegs (~5KB each). We cap hard on both count and total
 * bytes because localStorage is a shared ~5MB budget and a full scrapbook must
 * never be the reason a game fails to save its player id.
 */
const KEY = "dd_archive";
const MAX_GAMES = 6;
const MAX_SHOTS = 24;
const MAX_BYTES = 2_200_000;

export interface ArchivedShot {
  turn: number;
  word: string;
  drawerName: string;
  image: string; // data url
}

export interface ArchivedGame {
  roomId: string;
  endedAt: number;
  rounds: number;
  scores: { name: string; avatar: string; score: number }[];
  shots: ArchivedShot[];
}

function read(): ArchivedGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as ArchivedGame[]) : [];
  } catch {
    return [];
  }
}

function write(list: ArchivedGame[]): void {
  // trim from the oldest end until it fits, so one huge game can't wedge the
  // whole scrapbook shut
  let keep = list.slice(0, MAX_GAMES);
  for (let guard = 0; guard < MAX_GAMES + 1; guard++) {
    const payload = JSON.stringify(keep);
    if (payload.length <= MAX_BYTES) {
      try {
        localStorage.setItem(KEY, payload);
        return;
      } catch {
        // quota blown anyway — drop the oldest and retry
      }
    }
    if (keep.length <= 1) {
      try {
        localStorage.setItem(KEY, JSON.stringify(keep.slice(0, 1)));
      } catch {
        try {
          localStorage.removeItem(KEY);
        } catch {}
      }
      return;
    }
    keep = keep.slice(0, keep.length - 1);
  }
}

export function listArchive(): ArchivedGame[] {
  return read().sort((a, b) => b.endedAt - a.endedAt);
}

export function getArchived(roomId: string): ArchivedGame | undefined {
  return read().find((g) => g.roomId === roomId);
}

export function hasArchived(roomId: string): boolean {
  return read().some((g) => g.roomId === roomId);
}

export function saveArchive(game: ArchivedGame): void {
  const trimmed: ArchivedGame = {
    ...game,
    shots: game.shots.slice(0, MAX_SHOTS),
  };
  const rest = read().filter((g) => g.roomId !== game.roomId);
  write([trimmed, ...rest].sort((a, b) => b.endedAt - a.endedAt));
}

export function clearArchive(roomId?: string): void {
  if (!roomId) {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    return;
  }
  write(read().filter((g) => g.roomId !== roomId));
}
