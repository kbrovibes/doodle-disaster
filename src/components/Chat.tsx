"use client";

import { useCallback, useEffect, useRef, useState, memo } from "react";
import { ChatMsg } from "@/lib/types";
import { IconParty, IconWhisper, PlayerAvatar } from "./icons";

interface Props {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  /** touch devices type on the guess bar under the board instead */
  hideInput?: boolean;
}

/** How far off the bottom still counts as "watching the live feed". */
const STICK_PX = 40;

/**
 * The room's running commentary.
 *
 * It is a FLEX ITEM, not a fixed box: it fills whatever height its parent
 * gives it and scrolls inside. That is load-bearing — the old version asked
 * for `h-full` inside an `items-end` row, where a percentage height has
 * nothing to resolve against, so the card silently grew to fit every message
 * and spilled up over the board.
 */
function Chat({ messages, onSend, disabled, placeholder, hideInput }: Props) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  /** false once you scroll up to read — then new arrivals must not yank you */
  const stuck = useRef(true);
  const [behind, setBehind] = useState(false);

  const toBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stuck.current = true;
    setBehind(false);
  }, []);

  useEffect(() => {
    if (stuck.current) toBottom();
    else if (messages.length) setBehind(true);
  }, [messages, toBottom]);

  // the panel changes height a lot (keyboard up, keyboard down, rotation);
  // whoever was pinned to the bottom stays pinned to the bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_PX;
    stuck.current = atEnd;
    if (atEnd) setBehind(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    onSend(t);
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-doodle">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2.5 py-1.5 text-[13px] leading-snug"
        >
          {messages.length === 0 && (
            <p className="flex h-full items-center justify-center px-4 text-center text-xs text-ink/40">
              Guesses and chatter land here.
            </p>
          )}
          {messages.slice(-120).map((m) => (
            <div key={m.id} className="break-words">
              {m.kind === "system" ? (
                <span className="italic text-ink/50">{m.text}</span>
              ) : m.kind === "correct" ? (
                <span className="font-bold text-green-700">
                  <PlayerAvatar token={m.avatar} size={18} /> {m.name} guessed
                  it! <IconParty size={15} />
                </span>
              ) : m.kind === "close" ? (
                <span className="text-amber-600">{m.text}</span>
              ) : m.kind === "whisper" ? (
                <span className="italic text-ink/60">
                  <IconWhisper size={14} />{" "}
                  <span className="font-bold">{m.name}:</span> {m.text}
                </span>
              ) : (
                <span>
                  <span className="font-bold">{m.name}:</span>{" "}
                  <span className="text-ink/80">{m.text}</span>
                </span>
              )}
            </div>
          ))}
        </div>
        {behind && (
          <button
            type="button"
            onClick={toBottom}
            className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-full border-2 border-ink bg-sun px-2.5 py-0.5 text-[11px] font-bold shadow-doodle"
          >
            new messages ↓
          </button>
        )}
      </div>
      {hideInput ? null : (
        <form onSubmit={submit} className="shrink-0 border-t-2 border-ink/10 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            maxLength={100}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            className="w-full rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-xs outline-none focus:border-ink disabled:opacity-50"
          />
        </form>
      )}
    </div>
  );
}

export default memo(Chat);
