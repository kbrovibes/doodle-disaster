"use client";

import { useEffect, useState } from "react";

/**
 * The two numbers at the bottom of the home screen.
 *
 * Deliberately quiet: it renders nothing at all until the fetch lands, so the
 * footer never flashes a zero or shifts the page, and it says nothing when the
 * server has nothing to say. A live count of zero is simply left out rather
 * than announced — "0 playing now" is a worse look than no line at all.
 */
export default function Tally() {
  const [stats, setStats] = useState<{ played: number; live: number } | null>(
    null
  );

  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && typeof j.played === "number") setStats(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!stats || stats.played < 1) return null;

  return (
    <p className="mt-2 text-center text-xs text-ink/40">
      <span className="tabular-nums">{stats.played.toLocaleString()}</span> games
      doodled
      {stats.live > 0 && (
        <>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-600" />
            </span>
            <span className="tabular-nums">{stats.live}</span> playing now
          </span>
        </>
      )}
    </p>
  );
}
