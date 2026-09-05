"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { haptic } from "@/lib/client";
import { sh } from "@/lib/shell";

/**
 * In-app keyboard for touch devices — the native keyboard never opens, so the
 * drawing never gets shoved off screen mid-guess.
 *
 * Everything here is built for input latency, because a guessing game lives or
 * dies on it:
 *
 *  - ONE native, non-passive listener on the pad, not 40 React handlers.
 *    React's synthetic events add a dispatch hop per press and re-allocate
 *    every handler on each render; a delegated DOM listener is the shortest
 *    path from finger to letter.
 *  - The draft lives in a ref and is written straight to the DOM inside that
 *    listener, so the letter is on screen before the handler returns. No
 *    state, no render, nothing queued behind React.
 *  - The pressed look is applied imperatively too, instead of waiting for
 *    :active to survive a busy main thread.
 *  - Backspace repeats while held, accelerating, and there's a ✕ to wipe the
 *    whole draft — deleting a bad guess used to mean 15 separate taps.
 */
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
// tokens rather than raw characters: they ride in a data- attribute
const BACK = "bs";
const ENTER = "ent";
const SPACE = "spc";
const CLEAR = "clr";
const PEEK = "pek";

function VirtualKeyboard({
  onSubmit,
  disabled,
  placeholder,
  compact,
  mask,
  submitLabel,
  onUseDeviceKeyboard,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder: string;
  compact?: boolean;
  /** party mode: the word is typed on the screen everyone can see, so show
   *  dots and let the typist hold the eye to check their spelling */
  mask?: boolean;
  submitLabel?: string;
  /** shown as a link under the pad — on a tablet the row of chrome that used
   *  to hold this control can scroll out of reach, and then you are stuck */
  onUseDeviceKeyboard?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const val = useRef("");
  const textRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const peeking = useRef(false);

  // props the DOM listener needs, without re-binding the listener on each change
  const live = useRef({ onSubmit, disabled, placeholder, mask });
  live.current = { onSubmit, disabled, placeholder, mask };

  const paint = useCallback(() => {
    const v = val.current;
    const empty = !v.trim();
    const hide = live.current.mask && !peeking.current;
    const t = textRef.current;
    if (t) {
      t.textContent = (hide ? "\u25cf".repeat(v.length) : v) || live.current.placeholder;
      t.style.fontWeight = v ? "800" : "400";
      t.style.color = v ? "" : "rgba(38,35,46,0.35)";
    }
    if (caretRef.current) caretRef.current.style.display = v ? "" : "none";
    if (clearRef.current) clearRef.current.style.display = v ? "" : "none";
    const b = enterRef.current;
    if (b) {
      b.style.backgroundColor = empty ? "#ffc9c9" : "#ff6b6b";
      b.style.color = empty ? "#6b3636" : "#ffffff";
    }
  }, []);

  useEffect(() => paint(), [paint, placeholder]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const repeat = { t: 0 };
    const stopRepeat = () => {
      if (repeat.t) window.clearTimeout(repeat.t);
      repeat.t = 0;
    };
    const release = () => {
      stopRepeat();
      if (peeking.current) {
        peeking.current = false;
        paint();
      }
    };

    const flash = (el: HTMLElement) => {
      // imperative press state: :active can lag behind a busy main thread
      el.style.transform = "translateY(2px) scale(0.94)";
      el.style.boxShadow = "none";
      window.setTimeout(() => {
        el.style.transform = "";
        el.style.boxShadow = "";
      }, 95);
    };

    const del = () => {
      if (!val.current) return false;
      val.current = val.current.slice(0, -1);
      paint();
      return true;
    };

    const act = (k: string) => {
      if (live.current.disabled) return;
      if (k === BACK) {
        if (del()) haptic(8);
        return;
      }
      if (k === ENTER) {
        const t = val.current.trim();
        if (!t) return;
        val.current = "";
        paint();
        haptic(16);
        live.current.onSubmit(t);
        return;
      }
      if (k === PEEK) {
        peeking.current = true;
        paint();
        return;
      }
      if (k === CLEAR) {
        if (!val.current) return;
        val.current = "";
        paint();
        haptic(12);
        return;
      }
      if (val.current.length < 40) {
        val.current += k === SPACE ? " " : k;
        paint(); // synchronous — on screen before this returns
        haptic(8);
      }
    };

    // hold to delete: a beat of grace, then faster and faster
    const startRepeat = () => {
      stopRepeat();
      let delay = 62;
      const step = () => {
        if (!del()) return stopRepeat();
        haptic(5);
        delay = Math.max(22, delay - 5);
        repeat.t = window.setTimeout(step, delay);
      };
      repeat.t = window.setTimeout(step, 340);
    };

    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(
        "[data-k]"
      ) as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      const k = el.dataset.k!;
      flash(el);
      act(k);
      if (k === BACK) startRepeat();
    };

    // the touch itself never needs a default: no scroll, no zoom, no gesture,
    // and crucially no synthesised click arriving 300ms later
    const swallow = (e: TouchEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-k]")) e.preventDefault();
    };

    root.addEventListener("pointerdown", onDown);
    root.addEventListener("touchstart", swallow, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("touchend", release);
    window.addEventListener("touchcancel", release);
    return () => {
      stopRepeat();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("touchstart", swallow);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("touchend", release);
      window.removeEventListener("touchcancel", release);
    };
  }, [paint]);

  // Sized against the visible shell (--sh), not the raw viewport: when the
  // device keyboard is up the shell shrinks and everything follows.
  const keyStyle = {
    height: compact
      ? `clamp(32px, ${sh(7.4)}, 58px)`
      : `clamp(46px, ${sh(7.6)}, 64px)`,
    fontSize: compact
      ? `clamp(15px, ${sh(3.2)}, 22px)`
      : `clamp(18px, ${sh(2.9)}, 24px)`,
    touchAction: "manipulation" as const,
    minWidth: 0,
  };
  const base = `flex touch-manipulation select-none items-center justify-center rounded-xl border font-bold shadow-[0_2px_0_rgba(38,35,46,0.18)]`;
  const key = `${base} border-ink/15 bg-white`;
  const gapPx = 4;
  // flex-basis 0 + grow: every row fills the width, so the shorter rows simply
  // get fatter keys — no fixed key width to overflow a phone or strand a
  // 430px keyboard in the middle of an iPad.
  const slot = (n: number) => ({ ...keyStyle, flex: `${n} 1 0%` });

  return (
    <div
      ref={rootRef}
      className="select-none"
      style={{ touchAction: "manipulation" }}
    >
      <div
        className="mb-1 flex items-center gap-1 rounded-xl border-2 border-ink/20 bg-white pl-3 pr-1"
        style={{
          height: compact
            ? `clamp(28px, ${sh(5.6)}, 44px)`
            : `clamp(32px, ${sh(4.6)}, 42px)`,
        }}
      >
        <span ref={textRef} className="min-w-0 flex-1 truncate text-lg" />
        <span ref={caretRef} className="dd-caret shrink-0 font-bold">
          |
        </span>
        {mask && (
          <button
            data-k={PEEK}
            aria-label="Hold to check spelling"
            className="shrink-0 rounded-lg px-2 text-base text-ink/45"
            style={{ touchAction: "manipulation" }}
          >
            👁
          </button>
        )}
        <button
          ref={clearRef}
          data-k={CLEAR}
          aria-label="Clear"
          className="ml-1 shrink-0 rounded-lg px-2 text-sm font-bold text-ink/45"
          style={{ display: "none", touchAction: "manipulation" }}
        >
          ✕
        </button>
      </div>

      <div
        className="mx-auto"
        style={{
          maxWidth: compact ? 720 : 620,
          display: "flex",
          flexDirection: "column",
          gap: gapPx,
        }}
      >
        {ROWS.map((row, ri) => (
          <div key={row} className="flex" style={{ gap: gapPx }}>
            {row.split("").map((k) => (
              <button key={k} data-k={k} className={key} style={slot(1)}>
                {k}
              </button>
            ))}
            {/* delete and send stack in the right column, thumb over thumb */}
            {ri === 1 && (
              <button
                data-k={BACK}
                className={key}
                style={slot(1.4)}
                aria-label="Backspace"
              >
                ⌫
              </button>
            )}
            {ri === 2 && (
              <button
                ref={enterRef}
                data-k={ENTER}
                className={`${base} border-ink`}
                style={slot(2.8)}
                aria-label="Send guess"
              >
                {submitLabel ?? "enter"}
              </button>
            )}
          </div>
        ))}
        <button
          data-k={SPACE}
          className={`${key} mx-auto`}
          style={{
            ...keyStyle,
            width: "56%",
            height: compact
              ? `clamp(26px, ${sh(5.2)}, 42px)`
              : `clamp(32px, ${sh(5.2)}, 46px)`,
          }}
          aria-label="Space"
        >
          space
        </button>
        {onUseDeviceKeyboard && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              onUseDeviceKeyboard();
            }}
            className="mx-auto pt-0.5 text-[11px] font-bold text-ink/35 underline"
            style={{ touchAction: "manipulation" }}
          >
            use my phone&apos;s keyboard
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(VirtualKeyboard);
