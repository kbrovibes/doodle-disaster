"use client";

import type { Cursor } from "./words";

/**
 * Where the word ring is remembered BETWEEN games.
 *
 * A room's cursor used to start at zero every time, so a fresh game with the
 * same friends dealt the same opening words as the last one — which is exactly
 * the "we got that word twice today" complaint. Now every device keeps the
 * group's salt and cursor, hands them to the next room it creates, and adopts
 * whatever the room reports back. So the group keeps walking one long ring all
 * night instead of restarting it every game.
 */
const KEY = "dd_ring";

export interface Ring {
  salt: number;
  cursor: Cursor;
}

export function loadRing(): Ring | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Ring;
    if (typeof r?.salt !== "number" || !r.cursor) return null;
    return r;
  } catch {
    return null;
  }
}

export function saveRing(r: Ring): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {}
}

/** Adopt whatever the room is using, so every device stays on one ring. */
export function syncRing(salt?: number, cursor?: Cursor): void {
  if (typeof salt !== "number" || !cursor) return;
  const mine = loadRing();
  // a different group/ring wins outright; the same ring only moves forward
  if (!mine || mine.salt !== salt) return saveRing({ salt, cursor });
  const merged: Cursor = { ...mine.cursor };
  for (const [k, v] of Object.entries(cursor)) {
    const prev = merged[k as keyof Cursor] ?? 0;
    if (typeof v === "number" && v !== prev) merged[k as keyof Cursor] = v;
  }
  saveRing({ salt, cursor: merged });
}
