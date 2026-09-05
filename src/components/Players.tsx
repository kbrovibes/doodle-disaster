"use client";

import { memo } from "react";

import { ClientState } from "@/lib/types";
import {
  IconBrush,
  IconPen,
  IconCheck,
  IconCrown,
  IconMedal,
  IconX,
  PlayerAvatar,
} from "./icons";

interface Props {
  state: ClientState;
  meId: string;
  /** "list" = roomy vertical rail, "wrap" = compact chips,
   *  "mini" = avatar + score only, for when the board needs the pixels */
  variant?: "list" | "wrap" | "mini";
  onKick?: (targetId: string, name: string) => void;
}

function Players({ state, meId, variant = "list", onKick }: Props) {
  const iAmHost = state.hostId === meId;
  const ranked = [...state.players].sort((a, b) => b.score - a.score);

  // who draws after the current drawer (skipping disconnected players)
  let nextDrawerId: string | null = null;
  if (state.order.length > 0 && state.drawerId) {
    for (let hop = 1; hop <= state.order.length; hop++) {
      const id = state.order[(state.turnIndex + hop) % state.order.length];
      const p = state.players.find((x) => x.id === id);
      if (p?.connected && id !== state.drawerId) {
        nextDrawerId = id;
        break;
      }
    }
  }

  // Names cost a surprising amount of width and the avatar already says who
  // is who — and the feed announces every correct guess by name anyway. One
  // line, never wrapping, so the board keeps its height.
  if (variant === "mini") {
    return (
      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto">
        {ranked.map((p) => {
          const isDrawer = p.id === state.drawerId;
          const isGiver = !!state.giverId && p.id === state.giverId;
          const guessed = state.guessedIds.includes(p.id);
          return (
            <span
              key={p.id}
              title={`${p.name} · ${p.score}`}
              className={`flex shrink-0 items-center gap-0.5 rounded-lg border-2 py-0.5 pl-0.5 pr-1 ${
                guessed
                  ? "border-green-600 bg-green-50"
                  : isDrawer
                  ? "border-ink bg-sun/60"
                  : p.id === meId
                  ? "border-ink/40 bg-well ring-2 ring-ink/25"
                  : "border-ink/15 bg-white"
              } ${!p.connected ? "opacity-40" : ""}`}
            >
              <PlayerAvatar
                token={p.avatar}
                size={20}
                className={guessed && state.phase === "drawing" ? "dd-hop" : undefined}
              />
              <span className="text-[11px] font-bold tabular-nums">
                {p.score}
              </span>
              {isDrawer && <IconBrush size={10} />}
              {isGiver && <IconPen size={10} />}
              {guessed && <IconCheck size={10} />}
            </span>
          );
        })}
      </div>
    );
  }

  if (variant === "wrap") {
    return (
      <div className="flex flex-wrap gap-1">
        {ranked.map((p) => {
          const isDrawer = p.id === state.drawerId;
          const isGiver = !!state.giverId && p.id === state.giverId;
          const guessed = state.guessedIds.includes(p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center gap-1 rounded-lg border-2 px-1 py-0.5 text-[11px] ${
                guessed
                  ? "border-green-600 bg-green-50"
                  : isDrawer
                  ? "border-ink bg-sun/50"
                  : "border-ink/15 bg-white"
              } ${!p.connected ? "opacity-40" : ""}`}
            >
              <PlayerAvatar
                token={p.avatar}
                size={22}
                className={guessed && state.phase === "drawing" ? "dd-hop" : undefined}
              />
              <span className="max-w-[64px] truncate text-[10px] font-bold">
                {p.id === meId ? "You" : p.name}
              </span>
              <span className="tabular-nums text-ink/50">{p.score}</span>
              {isDrawer && <IconBrush size={12} />}
              {isGiver && <IconPen size={12} />}
              {guessed && <IconCheck size={12} />}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ranked.map((p, i) => {
        const isDrawer = p.id === state.drawerId;
          const isGiver = !!state.giverId && p.id === state.giverId;
        const guessed = state.guessedIds.includes(p.id);
        const isLeader = i === 0 && p.score > 0;
        return (
          <div
            key={p.id}
            className={`flex shrink-0 items-center gap-2 rounded-xl border-2 px-2 py-1.5 transition-colors ${
              guessed
                ? "border-green-600 bg-green-50"
                : isDrawer
                ? "border-ink bg-sun/40"
                : "border-ink/15 bg-white"
            } ${!p.connected ? "opacity-40" : ""}`}
          >
            <PlayerAvatar
              token={p.avatar}
              size={32}
              className={guessed && state.phase === "drawing" ? "dd-hop" : undefined}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-[13px] font-bold leading-tight">
                <span className="max-w-[8rem] truncate">{p.name}</span>
                {p.isBot && (
                  <span className="rounded bg-ink/10 px-1 text-[9px] font-extrabold tracking-wide text-ink/50">
                    BOT
                  </span>
                )}
                {isGiver && (
                  <span
                    title="Set the word this turn — sitting it out"
                    className="flex items-center gap-0.5 rounded bg-coral/15 px-1 text-[9px] font-extrabold tracking-wide text-coral"
                  >
                    <IconPen size={9} /> WORD
                  </span>
                )}
                {p.id === meId && <span className="text-ink/40">(you)</span>}
                {isLeader && (
                  <span title="in the lead">
                    <IconMedal rank={1} size={15} />
                  </span>
                )}
                {isDrawer && (
                  <span title="drawing">
                    <IconBrush size={15} />
                  </span>
                )}
                {guessed && (
                  <span title="guessed it" className="pop-in inline-block">
                    <IconCheck size={15} />
                  </span>
                )}
                {p.id === state.hostId && (
                  <span title="host">
                    <IconCrown size={15} />
                  </span>
                )}
              </div>
              <div className="text-[11px] tabular-nums text-ink/60">
                #{i + 1} · {p.score} pts
                {p.id === nextDrawerId && (
                  <span className="font-bold text-ink/70"> · up next</span>
                )}
              </div>
            </div>
            {iAmHost && p.id !== meId && onKick && (
              <button
                title={`Remove ${p.name}`}
                aria-label={`Remove ${p.name}`}
                onClick={() => onKick(p.id, p.name)}
                className="ml-auto rounded-md p-0.5 opacity-30 transition-opacity hover:opacity-100"
              >
                <IconX size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default memo(Players);
