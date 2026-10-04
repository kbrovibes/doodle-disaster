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

/**
 * Side channel for people still on the join screen. Separate from the room
 * channel on purpose: supabase-js hands back an existing channel for a topic
 * it already knows, and the join screen's channel is still closing when the
 * room's own one opens.
 */
export function joiningChannel(roomId: string, key: string): RealtimeChannel {
  return supabase().channel(`joining:${roomId}`, {
    config: { presence: { key } },
  });
}

export interface Joiner {
  key: string;
  joining: true;
  name: string;
  avatar: string;
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
  return `a${Math.floor(Math.random() * 40)}`;
}

export function saveAvatar(token: string) {
  try {
    localStorage.setItem("dd_avatar", token);
  } catch {}
}

/**
 * Your seat in a room. Kept in localStorage so closing the browser doesn't
 * cost you the game; sessionStorage acts as a per-tab override, which lets a
 * second tab deliberately sit down as a different player.
 */
export function getPlayerId(roomId: string): string | null {
  try {
    return (
      sessionStorage.getItem(`dd_pid:${roomId}`) ??
      localStorage.getItem(`dd_pid:${roomId}`)
    );
  } catch {
    return null;
  }
}

export function savePlayerId(roomId: string, playerId: string) {
  try {
    if (playerId) {
      sessionStorage.setItem(`dd_pid:${roomId}`, playerId);
      localStorage.setItem(`dd_pid:${roomId}`, playerId);
    } else {
      sessionStorage.removeItem(`dd_pid:${roomId}`);
      localStorage.removeItem(`dd_pid:${roomId}`);
    }
  } catch {}
}

// --- feedback -----------------------------------------------------------

/** Short buzz on supported devices (Android/Chrome). No-op elsewhere. */
export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}
