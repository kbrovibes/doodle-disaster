"use client";

import { haptic, sound } from "@/lib/client";

/**
 * In-app keyboard for touch devices — the native keyboard never opens, so the
 * drawing never gets shoved off screen mid-guess.
 * Layout follows muscle memory: backspace bottom-right of the letters, a real
 * enter key, and space along the bottom.
 */
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export default function VirtualKeyboard({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder: string;
  compact?: boolean;
}) {
  const tap = () => {
    haptic(9);
    sound("key");
  };
  const press = (k: string) => {
    if (disabled) return;
    tap();
    if (value.length < 40) onChange(value + k);
  };
  const back = () => {
    if (disabled) return;
    tap();
    onChange(value.slice(0, -1));
  };
  const send = () => {
    if (disabled || !value.trim()) return;
    haptic(16);
    onSubmit();
  };

  const h = compact ? "h-8" : "h-11";
  const key = `flex items-center justify-center rounded-lg border-2 border-ink/15 bg-white font-bold shadow-[0_2px_0_rgba(38,35,46,0.18)] active:translate-y-[2px] active:shadow-none ${h} ${
    compact ? "text-[13px]" : "text-base"
  }`;
  const gap = compact ? "gap-1" : "gap-1.5";

  return (
    <div
      className="select-none rounded-2xl border-2 border-ink/10 bg-white/70 p-2"
      style={{ touchAction: "manipulation" }}
    >
      <div
        className={`mb-1.5 flex items-center rounded-xl border-2 border-ink bg-white px-3 ${
          compact ? "h-8" : "h-10"
        }`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${value ? "font-bold" : "text-ink/35"}`}
        >
          {value || placeholder}
          {value && <span className="dd-caret">|</span>}
        </span>
      </div>

      <div className={compact ? "space-y-1" : "space-y-1.5"}>
        {ROWS.map((row, ri) => (
          <div key={row} className={`flex justify-center ${gap}`}>
            {row.split("").map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className={`${key} flex-1`}
                style={{ maxWidth: compact ? 42 : 48 }}
              >
                {k}
              </button>
            ))}
            {ri === 2 && (
              <button
                onClick={back}
                className={`${key} shrink-0 px-3`}
                aria-label="Backspace"
              >
                ⌫
              </button>
            )}
          </div>
        ))}
        <div className={`flex justify-center ${gap}`}>
          <button
            onClick={() => press(" ")}
            className={`${key} flex-[3]`}
            aria-label="Space"
          >
            space
          </button>
          <button
            onClick={send}
            disabled={disabled || !value.trim()}
            className={`${key} flex-[2] border-ink bg-coral text-white disabled:border-ink/25 disabled:bg-coral/35`}
            aria-label="Send guess"
          >
            enter ⏎
          </button>
        </div>
      </div>
    </div>
  );
}
