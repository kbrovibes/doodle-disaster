"use client";

import { useEffect, useRef, useState, memo } from "react";
import { ChatMsg } from "@/lib/types";
import { IconParty, IconWhisper, PlayerAvatar } from "./icons";

interface Props {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  /** touch devices type on the in-app keyboard instead */
  hideInput?: boolean;
}

function Chat({
  messages,
  onSend,
  disabled,
  placeholder,
  hideInput,
}: Props) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    onSend(t);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border-2 border-ink bg-white shadow-doodle">
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-xs"
      >
        {messages.slice(-120).map((m) => (
          <div key={m.id} className="leading-snug break-words">
            {m.kind === "system" ? (
              <span className="italic text-ink/50">{m.text}</span>
            ) : m.kind === "correct" ? (
              <span className="font-bold text-green-700">
                <PlayerAvatar token={m.avatar} size={18} /> {m.name} guessed it!{" "}
                <IconParty size={15} />
              </span>
            ) : m.kind === "close" ? (
              <span className="text-amber-600">{m.text}</span>
            ) : m.kind === "whisper" ? (
              <span className="italic text-ink/60">
                <IconWhisper size={14} /> <span className="font-bold">{m.name}:</span>{" "}
                {m.text}
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
      {hideInput ? null : (
      <form onSubmit={submit} className="border-t-2 border-ink/10 p-2">
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
