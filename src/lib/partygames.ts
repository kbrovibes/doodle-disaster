"use client";

/**
 * The party games this device has been in, so tapping the logo isn't a
 * one-way door.
 *
 * Online rooms live on the server and can be asked how they're doing (see
 * games.ts). A party has no server at all — the stage owns the state in its
 * own localStorage and the phones only ever hear it over a broadcast channel.
 * So there is nothing to poll: this is purely a list of doors this device
 * knows how to walk back through, plus whatever the stage last saw, written
 * down as it happened.
 *
 * Which door matters. The device that was casting comes back to /screen and
 * resumes the game it still holds; a phone comes back to /party/CODE as a
 * remote and re-announces itself. Sending either one to the other's URL is how
 * you end up with two screens fighting over one code.
 */

export type PartyRole = "screen" | "remote";

export interface PartyGame {
  code: string;
  role: PartyRole;
  /** the name this phone joined under (remotes only) */
  name?: string;
  startedAt: number;
  lastSeenAt: number;
  /** last thing the stage broadcast — a summary, for the card's subtitle */
  phase?: string;
  players?: number;
  teams?: number;
  /** highest score on the board, so a finished game reads like a result */
  top?: number;
}

const KEY = "dd_party_games";
const MAX = 8;
/** a party is an evening, not an account: forget them after a day */
const TTL_MS = 24 * 60 * 60 * 1000;

function read(): PartyGame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - TTL_MS;
    return (list as PartyGame[]).filter(
      (g) => g && typeof g.code === "string" && g.lastSeenAt > cutoff
    );
  } catch {
    return [];
  }
}

function write(list: PartyGame[]) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [...list].sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, MAX)
      )
    );
  } catch {}
}

export function listPartyGames(): PartyGame[] {
  return read().sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/**
 * Called on every state change, from both ends. Cheap on purpose: the stage
 * runs this a few times a minute, and all it does is keep one small row warm.
 */
export function recordPartyGame(
  code: string,
  role: PartyRole,
  patch: Partial<Omit<PartyGame, "code" | "role" | "startedAt">> = {}
) {
  const list = read();
  const now = Date.now();
  // one row per code per role: the same device can legitimately be the screen
  // on the telly and never a remote, or the other way round
  const existing = list.find((g) => g.code === code && g.role === role);
  if (existing) Object.assign(existing, patch, { lastSeenAt: now });
  else list.push({ code, role, startedAt: now, lastSeenAt: now, ...patch });
  write(list);
}

export function forgetPartyGame(code: string, role: PartyRole) {
  write(read().filter((g) => !(g.code === code && g.role === role)));
}

export function clearPartyGames() {
  write([]);
}

/** Where this device should walk back in. */
export function partyHref(g: PartyGame): string {
  return g.role === "screen" ? `/party/${g.code}/screen` : `/party/${g.code}`;
}

export function partySummary(g: PartyGame): string {
  const who = g.role === "screen" ? "on the telly" : `as ${g.name ?? "you"}`;
  if (g.phase === "gameover")
    return `${who} · finished${typeof g.top === "number" ? ` · top score ${g.top}` : ""}`;
  if (!g.phase || g.phase === "lobby")
    return `${who} · in the lobby${g.players ? ` · ${g.players} joined` : ""}`;
  return `${who} · ${g.players ?? 0} playing${g.teams ? ` in ${g.teams} teams` : ""}`;
}
