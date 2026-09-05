"use client";

import { useEffect } from "react";

/**
 * Kill the browser's edge-swipe "back" gesture inside the game.
 *
 * Drawing along the left side of the board kept sliding people out of the app
 * and back to the previous page. `touch-action: none` doesn't help — Safari
 * decides on the swipe from the raw touch stream — but a non-passive
 * touchstart that calls preventDefault() inside the edge band does.
 *
 * Two rules keep this from eating anything it shouldn't:
 *   - only touches that BEGIN within the edge band are cancelled (a stroke
 *     that starts mid-board and runs off the side is never a back gesture)
 *   - anything you can press is left alone, because a cancelled touchstart
 *     also swallows the click that iOS would synthesise from it
 */
const BAND = 32; // px from either edge — a bit wider than the system's own
const PRESSABLE = "button, a, input, textarea, select, label, [role='button']";

export function useEdgeSwipeGuard(active = true): void {
  useEffect(() => {
    if (!active) return;
    const onStart = (e: TouchEvent) => {
      if (!e.cancelable || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      if (x > BAND && x < window.innerWidth - BAND) return;
      const el = e.target as Element | null;
      if (el?.closest?.(PRESSABLE)) return;
      e.preventDefault();
    };
    document.addEventListener("touchstart", onStart, { passive: false });
    return () => document.removeEventListener("touchstart", onStart);
  }, [active]);
}
