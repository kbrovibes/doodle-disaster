"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ChatMsg } from "@/lib/types";
import { PlayerAvatar } from "./avatars";
import { IconCheck } from "./icons";

/**
 * The one-line news feed for when the keyboard is up.
 *
 * With the device keyboard open there is no room for the full guess strip, but
 * you still have to know that somebody just got it — otherwise you sit there
 * typing into a round that is already over. So the important messages float
 * over the bottom of the board instead of taking layout height: zero cost to
 * the drawing, and they evaporate on their own.
 */
interface Item extends ChatMsg {
  born: number;
}

const LIFE = 6000;
const MAX = 4;

function Ticker({ messages }: { messages: ChatMsg[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef(-1);

  useEffect(() => {
    if (seen.current < 0) {
      seen.current = messages.length; // don't replay the backlog on mount
      return;
    }
    if (messages.length <= seen.current) {
      if (messages.length < seen.current) seen.current = messages.length;
      return;
    }
    // Everything the normal feed would show. msgs is ALREADY filtered for
    // privacy upstream (canSeeGuess drops rival guesses while you're still
    // solving), so re-filtering here only loses messages — which is exactly
    // what went wrong: post-answer banter arrives as "whisper" and reveal
    // chatter as "guess", and both were being thrown away.
    const fresh = messages.slice(seen.current);
    seen.current = messages.length;
    if (fresh.length === 0) return;
    const now = Date.now();
    setItems((prev) =>
      [...prev, ...fresh.map((m) => ({ ...m, born: now }))].slice(-MAX)
    );
  }, [messages]);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setInterval(
      () => setItems((prev) => prev.filter((i) => Date.now() - i.born < LIFE)),
      500
    );
    return () => clearInterval(t);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-1 bottom-1 z-10 flex flex-col items-center gap-1">
      {items.map((m) => (
        <span
          key={m.id}
          className={`dd-cloud flex max-w-full items-center gap-1 rounded-full border-2 px-2 py-0.5 text-[11px] font-bold shadow-doodle ${
            m.kind === "correct"
              ? "border-green-700 bg-green-100 text-green-900"
              : m.kind === "close"
              ? "border-ink bg-sun"
              : m.kind === "system"
              ? "border-ink/25 bg-white/95 text-ink/60"
              : m.kind === "whisper"
              ? "border-green-600/50 bg-green-50/95"
              : "border-ink/25 bg-white/95"
          }`}
        >
          {m.kind === "correct" ? (
            <>
              <PlayerAvatar token={m.avatar} size={16} />
              <span className="truncate">{m.name} got it!</span>
              <IconCheck size={12} />
            </>
          ) : m.kind === "system" ? (
            <span className="truncate">{m.text}</span>
          ) : (
            <>
              <PlayerAvatar token={m.avatar} size={16} />
              <span className="max-w-[60px] shrink-0 truncate text-ink/45">
                {m.name}
              </span>
              <span className="truncate font-bold">{m.text}</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

export default memo(Ticker);
