"use client";

import { useEffect, useRef, useState } from "react";
import VirtualKeyboard from "./VirtualKeyboard";
import { readKeyboardMode, writeKeyboardMode, sh, type KeyboardMode } from "@/lib/shell";
import { haptic } from "@/lib/client";

/**
 * Type a word. Uses the phone's own keyboard by default — the game shell is
 * pinned to the visual viewport, so it shrinks above the keyboard rather than
 * scrolling away under it — with the in-app pad as an opt-in for anyone who
 * prefers it.
 */
export default function WordEntry({
  onSubmit,
  placeholder,
  submitLabel = "ready",
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
  submitLabel?: string;
}) {
  const [mode, setMode] = useState<KeyboardMode>("device");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setMode(readKeyboardMode()), []);

  useEffect(() => {
    if (mode !== "device") return;
    const t = window.setTimeout(
      () => ref.current?.focus({ preventScroll: true }),
      120
    );
    return () => window.clearTimeout(t);
  }, [mode]);

  const toggle = (
    <button
      onClick={() => {
        const m: KeyboardMode = mode === "device" ? "app" : "device";
        setMode(m);
        writeKeyboardMode(m);
      }}
      className="mt-1 w-full text-center text-[11px] font-bold text-ink/35 underline"
    >
      {mode === "device" ? "use the in-app keyboard" : "use my phone's keyboard"}
    </button>
  );

  if (mode === "app") {
    return (
      <div>
        <VirtualKeyboard
          onSubmit={onSubmit}
          placeholder={placeholder}
          submitLabel={submitLabel}
        />
        {toggle}
      </div>
    );
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const el = ref.current;
          if (!el) return;
          const v = el.value.trim();
          if (!v) return;
          el.value = "";
          haptic(16);
          onSubmit(v);
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={ref}
          type="text"
          maxLength={40}
          placeholder={placeholder}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-white px-3 text-lg font-bold outline-none focus:border-ink/50"
          style={{ height: `clamp(46px, ${sh(7)}, 60px)` }}
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl border-2 border-ink bg-coral px-5 font-display font-bold text-white shadow-doodle active:translate-y-[2px] active:shadow-none"
          style={{ height: `clamp(46px, ${sh(7)}, 60px)` }}
        >
          {submitLabel}
        </button>
      </form>
      {toggle}
    </div>
  );
}
