"use client";

import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { ClientState } from "./types";

let supa: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!supa) {
    supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { realtime: { params: { eventsPerSecond: 20 } } }
    );
  }
  return supa;
}

export function roomChannel(roomId: string, playerId: string): RealtimeChannel {
  return supabase().channel(`room:${roomId}`, {
    config: {
      broadcast: { self: false },
      presence: { key: playerId },
    },
  });
}

export async function api<T = { state: ClientState }>(
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`/api/rooms${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

/** Char-merge two masks of the same word: a letter once revealed stays revealed. */
export function mergeMasks(prev: string | null | undefined, next: string | null): string | null {
  if (!next) return next;
  if (!prev || prev.length !== next.length) return next;
  return [...next]
    .map((c, i) => (c === "_" && prev[i] !== "_" ? prev[i] : c))
    .join("");
}

// --- local identity ------------------------------------------------------

export function getSavedName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("dd_name") ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem("dd_name", name);
  } catch {}
}

// per-tab identity: each browser tab is its own player; a reload in the
// same tab rejoins as the same player
export function getSavedAvatar(): string {
  try {
    const a = localStorage.getItem("dd_avatar");
    if (a && /^a\d+$/.test(a)) return a;
  } catch {}
  return `a${Math.floor(Math.random() * 20)}`;
}

export function saveAvatar(token: string) {
  try {
    localStorage.setItem("dd_avatar", token);
  } catch {}
}

export function getPlayerId(roomId: string): string | null {
  try {
    return sessionStorage.getItem(`dd_pid:${roomId}`);
  } catch {
    return null;
  }
}

export function savePlayerId(roomId: string, playerId: string) {
  try {
    if (playerId) sessionStorage.setItem(`dd_pid:${roomId}`, playerId);
    else sessionStorage.removeItem(`dd_pid:${roomId}`);
  } catch {}
}

// --- tiny synth for game sounds -----------------------------------------

let ctx: AudioContext | null = null;
let muted = false;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("dd_muted", m ? "1" : "");
  } catch {}
}
export function getMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem("dd_muted");
  } catch {
    return false;
  }
}

/**
 * Browsers start an AudioContext suspended until the page has been touched.
 * Call this from a real user gesture so later game sounds actually play.
 */
export function unlockAudio() {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {}
}

function beep(freq: number, at: number, dur = 0.12, gain = 0.16, type: OscillatorType = "sine") {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur + 0.02);
}

/** Short buzz on supported devices (Android); iOS gets the key click instead. */
export function haptic(ms = 9) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

export function sound(
  kind: "correct" | "othercorrect" | "tick" | "start" | "over" | "pop" | "key"
) {
  if (muted || typeof window === "undefined") return;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    switch (kind) {
      case "correct":
        beep(523, 0, 0.1, 0.2);
        beep(659, 0.09, 0.1, 0.2);
        beep(784, 0.18, 0.22, 0.22);
        break;
      case "othercorrect":
        beep(660, 0, 0.08, 0.12);
        beep(880, 0.07, 0.1, 0.12);
        break;
      case "tick":
        beep(880, 0, 0.06, 0.1, "square");
        break;
      case "start":
        beep(440, 0, 0.1, 0.18);
        beep(554, 0.1, 0.1, 0.18);
        beep(659, 0.2, 0.18, 0.2);
        break;
      case "over":
        beep(523, 0, 0.15, 0.2);
        beep(659, 0.15, 0.15, 0.2);
        beep(784, 0.3, 0.15, 0.2);
        beep(1047, 0.45, 0.35, 0.24);
        break;
      case "pop":
        beep(300, 0, 0.07, 0.14, "triangle");
        break;
      case "key":
        beep(1250, 0, 0.025, 0.05, "square");
        break;
    }
  } catch {}
}
