"use client";

import { useState } from "react";
import { AVATAR_COUNT, IconReplay, PlayerAvatar } from "./icons";

export default function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title="Choose your critter"
          className="rounded-full border-2 border-ink bg-white p-1.5 shadow-doodle transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <PlayerAvatar token={value} size={54} />
        </button>
        <button
          type="button"
          onClick={() => onChange(`a${Math.floor(Math.random() * AVATAR_COUNT)}`)}
          title="Random critter"
          className="rounded-xl border-2 border-ink/20 bg-white p-1.5 transition-transform active:rotate-180"
        >
          <IconReplay size={17} />
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-5 gap-1 rounded-xl border-2 border-ink/15 bg-white p-2 shadow-doodle">
          {Array.from({ length: AVATAR_COUNT }, (_, i) => `a${i}`).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={`rounded-lg p-1 transition-transform hover:scale-110 ${
                t === value ? "bg-sun ring-2 ring-ink" : "hover:bg-paper"
              }`}
            >
              <PlayerAvatar token={t} size={32} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
