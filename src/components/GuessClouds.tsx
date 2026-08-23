"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMsg } from "@/lib/types";
import { PlayerAvatar } from "./avatars";
import { IconCheck } from "./icons";

/**
 * Small-room mode: guesses pop in as speech bubbles and evaporate.
 * Lives in its own strip beside/below the canvas — never on top of the
 * drawing, which people are trying to look at.
 */
interface Cloud extends ChatMsg {
  born: number;
}

const LIFE = 4200;
const MAX = 6;

export default function GuessClouds({
  messages,
  className,
}: {
  messages: ChatMsg[];
  className?: string;
}) {
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const seen = useRef(-1);

  useEffect(() => {
    if (seen.current < 0) {
      seen.current = messages.length; // don't replay backlog on mount
      return;
    }
    if (messages.length <= seen.current) {
      if (messages.length < seen.current) seen.current = messages.length;
      return;
    }
    const fresh = messages.slice(seen.current);
    seen.current = messages.length;
    setClouds((prev) =>
      [...prev, ...fresh.map((m) => ({ ...m, born: Date.now() }))].slice(-MAX)
    );
  }, [messages]);

  useEffect(() => {
    if (clouds.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setClouds((prev) => prev.filter((c) => now - c.born < LIFE));
    }, 400);
    return () => clearInterval(t);
  }, [clouds.length]);

  return (
    <div
      className={`flex min-h-0 flex-col justify-end gap-1 overflow-hidden ${className ?? ""}`}
    >
      {clouds.map((c) => (
        <div
          key={c.id}
          className={`dd-cloud w-fit max-w-full shrink-0 rounded-2xl rounded-bl-md border-2 px-2.5 py-1 text-sm shadow-doodle ${
            c.kind === "correct"
              ? "border-green-600 bg-green-50 font-bold text-green-800"
              : c.kind === "system"
              ? "border-ink/15 bg-white/85 italic text-ink/55"
              : c.kind === "close"
              ? "border-amber-400 bg-amber-50 text-amber-700"
              : "border-ink bg-white"
          }`}
        >
          {c.kind === "system" ? (
            <span className="line-clamp-1">{c.text}</span>
          ) : c.kind === "correct" ? (
            <span className="flex items-center gap-1.5">
              <PlayerAvatar token={c.avatar} size={20} /> {c.name} got it!{" "}
              <IconCheck size={15} />
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <PlayerAvatar token={c.avatar} size={20} />
              <b className="shrink-0 text-ink/60">{c.name}</b>
              <span className="min-w-0 truncate">{c.text}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
