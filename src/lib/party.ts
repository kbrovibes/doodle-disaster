"use client";

import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./client";
import { randomSalt, type Difficulty } from "./words";

/**
 * Party mode: one telly, one host iPad, and a phone in every pocket.
 *
 *   STAGE  — the device casting to the TV. Owns the game (roster, teams,
 *            scores, turn, phase) and the clock, and is the ONLY place state
 *            is mutated, so two people jabbing the same button on two phones
 *            can never double-score or double-advance. The host also does
 *            team matching here.
 *   REMOTE — everybody's phone. What it shows depends on which team you're on:
 *            the giving team picks the word together, everyone else waits.
 *
 * A turn, as played in an actual living room:
 *
 *   team A (the givers) roll/type words on THEIR phones until they agree
 *     → they call over someone from team B and show them the phone
 *       → that person draws on the iPad while team B shouts
 *         → team A judges, taps "they got it", and the turn flips
 *
 * Secrecy is wiring, not discipline. There is one channel per team:
 *
 *   party:CODE      stage + everyone — roster, scores, clock, commands
 *   party:CODE:tN   team N only      — the word they are choosing
 *
 * The stage subscribes to NO team channel, and a phone subscribes only to its
 * own team's, so team B literally cannot receive team A's word — not in the
 * UI, not in memory, not in devtools. The stage learns the word exactly once,
 * in the `reveal` command, at the moment it is meant to go up on the telly.
 */

export const MAX_TEAMS = 4;

// no O/0/I/1 — this gets read off a TV across the room
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPartyCode(): string {
  let s = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function partyChannel(code: string): RealtimeChannel {
  return supabase().channel(`party:${code.toUpperCase()}`, {
    config: { broadcast: { self: false } },
  });
}

/** One team's private channel. The stage must never subscribe to any of these. */
export function teamChannel(code: string, team: number): RealtimeChannel {
  return supabase().channel(`party:${code.toUpperCase()}:t${team}`, {
    config: { broadcast: { self: false } },
  });
}

export type PartyPhase =
  | "lobby"
  | "picking"
  | "ready"
  | "drawing"
  | "result"
  | "gameover";

export interface PartyTeam {
  name: string;
  score: number;
  /** round-robin pointer so the same loudmouth doesn't draw every time */
  drawIdx: number;
}

export interface PartyPlayer {
  id: string;
  name: string;
  team: number; // -1 while the host hasn't placed them
  at: number;
  /** the face this phone already picked for online games ("a7") */
  avatar?: string;
}

/** The whole game, owned by the stage. Never contains an unplayed word. */
export interface PartyState {
  players: PartyPlayer[];
  teams: PartyTeam[];
  turn: number; // the team that DRAWS this turn
  round: number;
  seconds: number;
  source: "teams" | "bank";
  difficulty: Difficulty;
  phase: PartyPhase;
  used: string[];
  offered: string[];
  /** the group's shuffle of the bank, and how far round it we are */
  wordSalt: number;
  cursor: Record<string, number>;
  themePacks?: string[] | null;
  drawerId?: string;
  /** set only for the reveal — the stage is told the word nowhere else */
  word?: string;
  scored?: boolean;
}

export type Cmd =
  | {
      cmd: "setup";
      patch: Partial<
        Pick<
          PartyState,
          "teams" | "seconds" | "source" | "difficulty" | "themePacks"
        >
      >;
    }
  | { cmd: "join"; id: string; name: string; avatar?: string }
  | { cmd: "assign"; id: string; team: number }
  | { cmd: "kick"; id: string }
  | { cmd: "shuffle" }
  | { cmd: "phase"; phase: PartyPhase }
  | { cmd: "drawer"; id: string }
  | { cmd: "locked" } // the giving team agreed on a word (we're not told which)
  | { cmd: "start" }
  | { cmd: "pause" }
  | { cmd: "resume" }
  | { cmd: "reveal"; word: string; scored: boolean; offered?: string[] }
  | { cmd: "score"; team: number; delta: number }
  | { cmd: "next" }
  | { cmd: "end" }
  | { cmd: "again" }
  | { cmd: "cursor"; cursor: Record<string, number> }
  | { cmd: "clear" };

export type PartyMsg =
  | { t: "hello"; from: "stage" }
  | { t: "hello"; from: "remote"; id: string }
  | {
      t: "state";
      s: PartyState;
      endsAt: number;
      frozen: number | null;
      now: number;
      since: number;
      sid: string;
    }
  | { t: "clock"; endsAt: number; frozen: number | null; now: number }
  | { t: "timeup" }
  | ({ t: "cmd" } & Cmd);

/** Only ever seen on a team's own channel. */
export type TeamMsg =
  | { t: "cand"; word: string; by: string }
  | { t: "need" };

export function send(ch: RealtimeChannel | null, msg: PartyMsg) {
  ch?.send({ type: "broadcast", event: "p", payload: msg });
}

export function sendTeam(ch: RealtimeChannel | null, msg: TeamMsg) {
  ch?.send({ type: "broadcast", event: "s", payload: msg });
}

export const TEAM_NAMES = [
  "Team Doodle",
  "Team Disaster",
  "Team Squiggle",
  "Team Scribble",
];

export const TEAM_TINT = ["#ffd93d", "#a5e6c0", "#bcd7ff", "#ffc2d8"];

export function newTeam(i: number): PartyTeam {
  return { name: TEAM_NAMES[i], score: 0, drawIdx: 0 };
}

export function newState(): PartyState {
  return {
    players: [],
    teams: [newTeam(0), newTeam(1)],
    turn: 0,
    round: 1,
    seconds: 90,
    source: "teams",
    difficulty: "medium",
    phase: "lobby",
    used: [],
    offered: [],
    wordSalt: randomSalt(),
    cursor: {},
    themePacks: null,
  };
}

export function loadState(code: string): PartyState {
  try {
    const raw = localStorage.getItem(`dd_party_stage:${code}`);
    if (!raw) return newState();
    const s = { ...newState(), ...(JSON.parse(raw) as PartyState) };
    // never resume mid-turn: the word lived on the phones, not here
    if (s.phase === "drawing" || s.phase === "ready" || s.phase === "picking")
      s.phase = "lobby";
    return s;
  } catch {
    return newState();
  }
}

export function saveState(code: string, s: PartyState) {
  try {
    localStorage.setItem(`dd_party_stage:${code}`, JSON.stringify(s));
  } catch {}
}

/** The team that thinks up the word: the one after the team drawing. */
export function giverOf(s: Pick<PartyState, "turn" | "teams">): number {
  return (s.turn + 1) % Math.max(1, s.teams.length);
}

export function membersOf(s: PartyState, team: number): PartyPlayer[] {
  return s.players.filter((p) => p.team === team).sort((a, b) => a.at - b.at);
}

/** Whose turn it is to hold the pen, rotating within the drawing team. */
export function pickDrawer(s: PartyState): string | undefined {
  const squad = membersOf(s, s.turn);
  if (!squad.length) return undefined;
  return squad[s.teams[s.turn].drawIdx % squad.length].id;
}

// --- this phone's identity ------------------------------------------------

export function myId(code: string): string {
  const k = `dd_party_me:${code}`;
  try {
    const v = localStorage.getItem(k);
    if (v) return v;
    const id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(k, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function myName(): string {
  try {
    return localStorage.getItem("dd_name") ?? "";
  } catch {
    return "";
  }
}

export function saveMyName(n: string) {
  try {
    localStorage.setItem("dd_name", n);
  } catch {}
}

// --- the invite -----------------------------------------------------------

/**
 * The address a PHONE joins on — never the /screen one. Read off a television
 * across the room, so it stays as short as the app can make it.
 */
export function joinUrl(code: string): string {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/party/${code.toUpperCase()}`;
}

/** The same thing without the scheme, for printing on the telly. */
export function joinHost(code: string): string {
  if (typeof window === "undefined") return `/party/${code.toUpperCase()}`;
  return `${window.location.host}/party/${code.toUpperCase()}`;
}
