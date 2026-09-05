"use client";

import { useEffect, useRef, useState } from "react";
import { getArchived, type ArchivedGame } from "@/lib/archive";
import { roomCode } from "@/lib/names";
import { PlayerAvatar } from "./avatars";
import { IconX } from "./icons";

/**
 * Flick back through a finished night. Served from this device's own copy, so
 * it opens instantly and works with the phone in flight mode.
 */
export default function Scrapbook({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose: () => void;
}) {
  const [game, setGame] = useState<ArchivedGame | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setGame(getArchived(roomId) ?? null);
  }, [roomId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((n) => n + 1);
      if (e.key === "ArrowLeft") setIdx((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shots = game?.shots ?? [];
  const at = Math.min(idx, Math.max(0, shots.length - 1));

  // A real sliding rail rather than a swap: the track is translated, so a
  // swipe drags the next photo in with your thumb instead of the picture
  // simply changing underneath it.
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef({ x: 0, y: 0, on: false, moved: false });
  const [dx, setDx] = useState(0);

  const go = (n: number) => setIdx(Math.max(0, Math.min(shots.length - 1, n)));

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, on: true, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const mx = e.clientX - drag.current.x;
    const my = e.clientY - drag.current.y;
    // let a mostly-vertical drag scroll the page instead
    if (!drag.current.moved && Math.abs(my) > Math.abs(mx)) {
      drag.current.on = false;
      return;
    }
    drag.current.moved = true;
    // rubber-band at the two ends so it feels like it has edges
    const over = (at === 0 && mx > 0) || (at === shots.length - 1 && mx < 0);
    setDx(over ? mx * 0.32 : mx);
  };
  const onUp = () => {
    if (!drag.current.on) return;
    const w = track.current?.clientWidth ?? 280;
    if (Math.abs(dx) > Math.min(70, w * 0.22)) go(at + (dx < 0 ? 1 : -1));
    drag.current.on = false;
    setDx(0);
  };

  return (
    <div
      className="dd-frost fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-lg rounded-2xl border-2 border-ink bg-paper p-4 shadow-doodle"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-black leading-tight">
              {roomCode(roomId)}
            </h2>
            {game && (
              <p className="text-[11px] text-ink/55">
                {new Date(game.endedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {game.shots.length} drawing
                {game.shots.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border-2 border-ink/20 p-1.5"
          >
            <IconX size={14} />
          </button>
        </div>

        {!game ? (
          <p className="mt-6 text-center text-xs text-ink/55">
            No drawings saved on this device for that game.
            <span className="mt-1 block text-[11px] text-ink/40">
              Only games you finished in this browser get scrapbooked.
            </span>
          </p>
        ) : (
          <>
            {shots.length > 0 ? (
              <div className="mt-3">
                <div
                  ref={track}
                  className="touch-pan-y select-none overflow-hidden"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onPointerLeave={onUp}
                >
                  <div
                    className="flex"
                    style={{
                      transform: `translateX(calc(${-at * 100}% + ${dx}px))`,
                      transition: drag.current.on
                        ? "none"
                        : "transform .32s cubic-bezier(.22,.9,.3,1)",
                    }}
                  >
                    {shots.map((sh) => (
                      <div key={sh.turn} className="w-full shrink-0 px-1">
                        <div className="dd-polaroid mx-auto max-w-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={sh.image}
                            alt={sh.word}
                            draggable={false}
                            className="pointer-events-none block w-full rounded-md border border-ink/10 bg-white"
                          />
                          <div className="pt-2 text-center">
                            <div className="font-display text-base font-black leading-tight">
                              {sh.word}
                            </div>
                            <div className="text-[11px] text-ink/55">
                              by {sh.drawerName}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {shots.length > 1 && (
                  <>
                    {/* jump straight to any drawing */}
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
                      {shots.map((sh, i) => (
                        <button
                          key={sh.turn}
                          onClick={() => go(i)}
                          title={sh.word}
                          className={`h-2.5 rounded-full transition-all ${
                            i === at
                              ? "w-6 bg-coral"
                              : "w-2.5 bg-ink/20 hover:bg-ink/40"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-3">
                      <button
                        onClick={() => go(at - 1)}
                        disabled={at <= 0}
                        className="rounded-lg border-2 border-ink bg-white px-3 py-1 font-bold shadow-doodle disabled:opacity-30 disabled:shadow-none"
                      >
                        ‹
                      </button>
                      <span className="text-[11px] font-bold tabular-nums text-ink/50">
                        {at + 1} / {shots.length}
                      </span>
                      <button
                        onClick={() => go(at + 1)}
                        disabled={at >= shots.length - 1}
                        className="rounded-lg border-2 border-ink bg-white px-3 py-1 font-bold shadow-doodle disabled:opacity-30 disabled:shadow-none"
                      >
                        ›
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-6 text-center text-xs text-ink/55">
                That game finished without any saved drawings.
              </p>
            )}

            <h3 className="mt-5 text-xs font-bold text-ink/60">Final scores</h3>
            <div className="mt-1.5 space-y-1">
              {game.scores.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1 ${
                    i === 0 ? "border-ink bg-sun" : "border-ink/15 bg-white"
                  }`}
                >
                  <span className="w-4 text-[11px] font-bold text-ink/45">
                    {i === 0 ? "🏆" : i + 1}
                  </span>
                  <PlayerAvatar token={p.avatar} size={22} />
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">
                    {p.name}
                  </span>
                  <span className="font-display font-black tabular-nums">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
