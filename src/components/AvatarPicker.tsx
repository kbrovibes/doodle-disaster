"use client";

import { useState } from "react";
import { AVATARS_BY_SEX, PlayerAvatar } from "./avatars";
import { IconReplay } from "./icons";

export default function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"boy" | "girl">("boy");
  const ids = AVATARS_BY_SEX[tab];
  const all = [...AVATARS_BY_SEX.boy, ...AVATARS_BY_SEX.girl];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title="Choose your face"
          className="rounded-full border-2 border-ink bg-white p-1.5 shadow-doodle transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <PlayerAvatar token={value} size={54} />
        </button>
        <button
          type="button"
          onClick={() =>
            onChange(`a${all[Math.floor(Math.random() * all.length)]}`)
          }
          title="Surprise me"
          className="rounded-xl border-2 border-ink/20 bg-white p-1.5 transition-transform active:rotate-180"
        >
          <IconReplay size={17} />
        </button>
      </div>

      {open && (
        <div className="rounded-xl border-2 border-ink/15 bg-white p-2 shadow-doodle">
          <div className="mb-2 flex gap-1">
            {([
              { key: "boy", face: "a0" },
              { key: "girl", face: "a1" },
            ] as const).map((t) => (
              <button
                type="button"
                key={t.key}
                aria-label={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-1 items-center justify-center rounded-lg border-2 py-1 transition-all ${
                  tab === t.key
                    ? "border-ink bg-sun"
                    : "border-ink/15 bg-paper opacity-55"
                }`}
              >
                <PlayerAvatar token={t.face} size={26} />
              </button>
            ))}
          </div>
          <div className="grid max-h-[190px] grid-cols-5 gap-1 overflow-y-auto">
            {ids.map((i) => {
              const t = `a${i}`;
              return (
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
                  <PlayerAvatar token={t} size={34} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
