"use client";

import { useEffect, useState } from "react";

/**
 * Phones only, browser tab only: nudge people to install to the home screen
 * so the game runs full-screen with no browser chrome eating the canvas.
 */
export default function InstallTip() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("dd_installtip") === "off") return;
    } catch {}
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const phone = window.matchMedia("(pointer: coarse)").matches;
    if (phone && !standalone) {
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-2xl border-2 border-dashed border-ink/25 bg-white/70 px-3 py-2 text-left">
      <span className="mt-0.5 shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="6" y="2.5" width="12" height="19" rx="2.6" fill="var(--sun, #ffd93d)" />
          <path d="M10.6 5.4h2.8" />
          <path d="M12 11v6M9 14h6" />
        </svg>
      </span>
      <p className="min-w-0 text-xs leading-snug text-ink/70">
        <b>Play it like an app:</b>{" "}
        {ios ? (
          <>tap <b>Share</b> then <b>Add to Home Screen</b>.</>
        ) : (
          <>open the browser menu and tap <b>Install app</b> / <b>Add to Home screen</b>.</>
        )}{" "}
        Full screen, no address bar.
      </p>
      <button
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem("dd_installtip", "off");
          } catch {}
          setShow(false);
        }}
        className="shrink-0 rounded-md px-1 text-ink/40 hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
