"use client";

/**
 * Local record of rooms you've joined, so closing the tab (or the whole
 * browser) is never destructive: your seat, name and score are waiting when
 * you come back. Purely client-side — no accounts involved.
 */
export interface SavedGame {
  roomId: string;
  playerId: string;
  name: string;
  avatar: string;
  joinedAt: number;
  lastSeenAt: number;
  finished?: boolean;
}

/** What the server currently thinks of a saved room. */
export interface GameStatus {
  roomId: string;
  exists: boolean;
  phase?: string;
  players?: number;
  round?: number;
  totalRounds?: number;
  /** is my saved seat still in that room? */
  mine?: boolean;
  /** still worth rejoining (not finished, not stale) */
  live?: boolean;
}

const KEY = "dd_games";
const MAX = 12;

function read(): SavedGame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as SavedGame[]) : [];
  } catch {
    return [];
  }
}

function write(list: SavedGame[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
}

export function listGames(): SavedGame[] {
  return read().sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function recordGame(g: Omit<SavedGame, "joinedAt" | "lastSeenAt">) {
  const list = read();
  const now = Date.now();
  const existing = list.find((x) => x.roomId === g.roomId);
  if (existing) {
    Object.assign(existing, g, { lastSeenAt: now });
  } else {
    list.unshift({ ...g, joinedAt: now, lastSeenAt: now });
  }
  write(list.sort((a, b) => b.lastSeenAt - a.lastSeenAt));
}

export function touchGame(roomId: string, patch: Partial<SavedGame> = {}) {
  const list = read();
  const g = list.find((x) => x.roomId === roomId);
  if (!g) return;
  Object.assign(g, patch, { lastSeenAt: Date.now() });
  write(list);
}

export function removeGame(roomId: string) {
  write(read().filter((g) => g.roomId !== roomId));
}

/** Drop everything that isn't still worth rejoining. */
export function clearFinished(liveIds: string[]) {
  const keep = new Set(liveIds);
  write(read().filter((g) => keep.has(g.roomId)));
}

export async function fetchStatuses(games: SavedGame[]): Promise<GameStatus[]> {
  if (games.length === 0) return [];
  const q = games.map((g) => `${g.roomId}:${g.playerId}`).join(",");
  try {
    const res = await fetch(`/api/rooms?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.rooms ?? []) as GameStatus[];
  } catch {
    return [];
  }
}
