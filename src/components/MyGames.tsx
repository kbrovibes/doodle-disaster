"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roomCode } from "@/lib/names";
import {
  clearFinished,
  fetchStatuses,
  listGames,
  removeGame,
  type GameStatus,
  type SavedGame,
} from "@/lib/games";
import {
  clearPartyGames,
  forgetPartyGame,
  listPartyGames,
  partyHref,
  partySummary,
  type PartyGame,
} from "@/lib/partygames";
import { PlayerAvatar } from "./avatars";
import { IconX } from "./icons";
import Scrapbook from "./Scrapbook";
import { hasArchived } from "@/lib/archive";

type Row = SavedGame & { status?: GameStatus };

export default function MyGames() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [parties, setParties] = useState<PartyGame[]>([]);

  const load = useCallback(async () => {
    const games = listGames();
    setRows(games);
    if (games.length === 0) {
      setChecked(true);
      return;
    }
    const statuses = await fetchStatuses(games);
    setRows(
      games.map((g) => ({
        ...g,
        status: statuses.find((s) => s.roomId === g.roomId),
      }))
    );
    setChecked(true);
  }, []);

  useEffect(() => {
    load();
    // party games are entirely local — there is no server to ask about them
    setParties(listPartyGames());
  }, [load]);

  // which finished games have drawings on this device
  useEffect(() => {
    setSaved(new Set(rows.filter((r) => hasArchived(r.roomId)).map((r) => r.roomId)));
  }, [rows]);

  if (rows.length === 0 && parties.length === 0) return null;

  // a game is worth resuming only if the server still says it's running
  const live = rows.filter((r) => r.status?.exists && r.status.live);
  const done = rows.filter((r) => !r.status?.exists || !r.status.live);

  const summary = (r: Row) => {
    const s = r.status;
    if (!s?.exists) return "room expired";
    if (s.phase === "lobby") return `waiting to start · ${s.players} here`;
    if (s.phase === "gameover") return `finished · ${s.players} players`;
    return `round ${s.round}/${s.totalRounds} · ${s.players} playing`;
  };

  const Card = ({ r, resumable }: { r: Row; resumable: boolean }) => (
    <div
      className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 ${
        resumable ? "border-ink bg-white shadow-doodle" : "border-ink/15 bg-white/60"
      }`}
    >
      <PlayerAvatar token={r.avatar} size={26} />
      <button
        onClick={() => resumable && router.push(`/r/${r.roomId}`)}
        disabled={!resumable}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <div className="truncate font-display font-bold leading-tight">
          {roomCode(r.roomId)}
        </div>
        <div className="truncate text-[11px] text-ink/55">
          as {r.name} · {summary(r)}
          {r.status?.exists && r.status.mine === false && " · seat taken"}
        </div>
      </button>
      {resumable ? (
        <button
          onClick={() => router.push(`/r/${r.roomId}`)}
          className="shrink-0 rounded-lg border-2 border-ink bg-sun px-2.5 py-1 text-[11px] font-extrabold shadow-doodle transition-transform active:scale-95"
        >
          Rejoin
        </button>
      ) : (
        <>
          {saved.has(r.roomId) && (
            <button
              onClick={() => setOpen(r.roomId)}
              className="shrink-0 rounded-lg border-2 border-ink bg-white px-2.5 py-1 text-[11px] font-extrabold shadow-doodle transition-transform active:scale-95"
            >
              🖼 Drawings
            </button>
          )}
          <button
            aria-label={`Forget ${r.roomId}`}
            onClick={() => {
              removeGame(r.roomId);
              setRows((prev) => prev.filter((x) => x.roomId !== r.roomId));
            }}
            className="shrink-0 rounded-md p-1 opacity-35 transition-opacity hover:opacity-100"
          >
            <IconX size={13} />
          </button>
        </>
      )}
    </div>
  );

  const partySection = parties.length > 0 && (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-ink/60">Party mode</h2>
        <button
          onClick={() => {
            clearPartyGames();
            setParties([]);
          }}
          className="text-[11px] font-bold text-ink/45 underline decoration-dotted hover:text-ink"
        >
          Clear
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {parties.map((g) => (
          <div
            key={`${g.code}:${g.role}`}
            className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-white px-3 py-2 shadow-doodle"
          >
            <span className="text-lg">{g.role === "screen" ? "📺" : "📱"}</span>
            <button
              onClick={() => router.push(partyHref(g))}
              className="min-w-0 flex-1 text-left"
            >
              <div className="truncate font-display font-bold leading-tight tracking-[0.18em]">
                {g.code}
              </div>
              <div className="truncate text-[11px] text-ink/55">
                {partySummary(g)}
              </div>
            </button>
            <button
              onClick={() => router.push(partyHref(g))}
              className="shrink-0 rounded-lg border-2 border-ink bg-sun px-2.5 py-1 text-[11px] font-extrabold shadow-doodle transition-transform active:scale-95"
            >
              {g.role === "screen" ? "Back to screen" : "Rejoin"}
            </button>
            <button
              aria-label={`Forget party ${g.code}`}
              onClick={() => {
                forgetPartyGame(g.code, g.role);
                setParties((prev) =>
                  prev.filter((x) => !(x.code === g.code && x.role === g.role))
                );
              }}
              className="shrink-0 rounded-md p-1 opacity-35 transition-opacity hover:opacity-100"
            >
              <IconX size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="mt-6">
      {open && <Scrapbook roomId={open} onClose={() => setOpen(null)} />}
      {partySection}
      {live.length > 0 && (
        <section className={parties.length > 0 ? "mt-5" : ""}>
          <h2 className="text-xs font-bold text-ink/60">
            Still going — jump back in
          </h2>
          <div className="mt-2 space-y-2">
            {live.map((r) => (
              <Card key={r.roomId} r={r} resumable />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && checked && (
        <section
          className={live.length > 0 || parties.length > 0 ? "mt-5" : ""}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-ink/60">Recent games</h2>
            <button
              onClick={() => {
                clearFinished(live.map((r) => r.roomId));
                setRows(live);
              }}
              className="text-[11px] font-bold text-ink/45 underline decoration-dotted hover:text-ink"
            >
              Clear
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {done.map((r) => (
              <Card key={r.roomId} r={r} resumable={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
