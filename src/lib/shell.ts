"use client";

import { useEffect, useState } from "react";

/**
 * A percentage of the *visible* shell height.
 *
 * `dvh` measures the viewport minus browser chrome — but not minus the device
 * keyboard, which on iOS doesn't resize the layout viewport at all. So the game
 * sizes itself against `--sh` (published by useShellMetrics from the visual
 * viewport) and falls back to dvh before hydration.
 */
export function sh(pct: number): string {
  return `calc(var(--sh, 100dvh) * ${(pct / 100).toFixed(4)})`;
}

/**
 * Publishes the visible height as --sh and reports whether the device keyboard
 * is currently covering part of the screen.
 *
 * iOS doesn't shrink the layout viewport for the keyboard, it just slides the
 * visual viewport up and lets the page scroll under it — which is exactly the
 * "my drawing ran away" problem the in-app keyboard was built to dodge. Pinning
 * the shell to visualViewport.height (and undoing any scroll iOS sneaks in)
 * keeps the whole game parked above the keyboard instead.
 */
export function useShellMetrics(): boolean {
  const [kbOpen, setKbOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    // The tallest viewport we have seen at this width. Comparing against
    // window.innerHeight does NOT work: in an installed iOS PWA the layout
    // viewport shrinks along with the keyboard, so the difference stayed ~0
    // and we never noticed the keyboard was up.
    let base = 0;
    let atWidth = 0;

    const apply = () => {
      const h = Math.round(vv ? vv.height : window.innerHeight);
      const w = Math.round(vv ? vv.width : window.innerWidth);
      if (w !== atWidth) {
        atWidth = w; // rotated, or the window was resized — start again
        base = 0;
      }
      if (h > base) base = h;
      root.style.setProperty("--sh", `${h}px`);
      const covered = base - h > 120;
      setKbOpen(covered);
      // iOS scrolls the document to reveal the focused field; the game shell
      // is already sized to fit above the keyboard, so put it straight back.
      // ONLY there: this listener also fires on ordinary scrolling, and doing
      // it unconditionally made scrollable pages (lobby, final scores) yank
      // themselves back to the top the moment you tried to read them.
      if (covered && document.querySelector(".dd-game") && window.scrollY !== 0)
        window.scrollTo(0, 0);
    };

    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      root.style.removeProperty("--sh");
    };
  }, []);

  return kbOpen;
}

export type KeyboardMode = "app" | "device";

/**
 * The phone's own keyboard is the default everywhere; the in-app pad is an
 * opt-in. It only became viable once the shell was pinned to the visual
 * viewport, so the board shrinks above the keyboard instead of scrolling away
 * underneath it.
 */
export function readKeyboardMode(): KeyboardMode {
  try {
    return localStorage.getItem("dd_kbmode") === "app" ? "app" : "device";
  } catch {
    return "device";
  }
}

export function writeKeyboardMode(m: KeyboardMode): void {
  try {
    localStorage.setItem("dd_kbmode", m);
  } catch {}
}
