"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RealtimeChannel } from "@supabase/supabase-js";
import Canvas, { CanvasHandle } from "../Canvas";
import { InvitePanel, InviteOverlay } from "./Invite";
import { PlayerAvatar, avatarToken } from "../avatars";
import { IconQr, Wordmark } from "../icons";
import { useEdgeSwipeGuard } from "@/lib/edgeguard";
import { sh, useShellMetrics } from "@/lib/shell";
import { recordPartyGame } from "@/lib/partygames";
import {
  MAX_TEAMS,
  TEAM_TINT,
  giverOf,
  loadState,
  membersOf,
  newTeam,
  partyChannel,
  pickDrawer,
  saveState,
  send,
  type Cmd,
  type PartyMsg,
  type PartyPlayer,
  type PartyState,
  type PartyTeam,
} from "@/lib/party";

/**
 * THE STAGE — the host iPad, cast to the telly.
 *
 * Owns the game and the clock. Every mutation goes through the one reducer
 * below, whether it arrived from a phone or from the host's own finger, so a
 * dozen remotes can drive it at once without fighting. It subscribes to no
 * team channel and therefore cannot learn a word before the reveal.
 */
export default function Stage({ code }: { code: string }) {
  useShellMetrics();
  useEdgeSwipeGuard();

  const [state, setState] = useState<PartyState | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [frozen, setFrozen] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [endAsk, setEndAsk] = useState(false);
  const [invite, setInvite] = useState(false);
  const [, setTick] = useState(0);

  const chRef = useRef<RealtimeChannel | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const stateRef = useRef<PartyState | null>(null);
  const clockRef = useRef({ endsAt: 0, frozen: null as number | null });
  const firedTimeUp = useRef(false);
  const bootAt = useRef(Date.now());
  const sid = useRef(Math.random().toString(36).slice(2, 10));
  const yielded = useRef(false);
  const applyRef = useRef<(c: Cmd) => void>(() => {});

  stateRef.current = state;
  clockRef.current = { endsAt, frozen };

  useEffect(() => {
    const s = loadState(code);
    setState(s);
    recordPartyGame(code, "screen", {
      phase: s.phase,
      players: s.players.length,
      teams: s.teams.length,
    });
  }, [code]);

  useEffect(() => {
    const ch = partyChannel(code);
    chRef.current = ch;

    const clockMsg = () => ({
      endsAt: clockRef.current.endsAt,
      frozen: clockRef.current.frozen,
      now: Date.now(),
      since: bootAt.current,
      sid: sid.current,
    });

    const push = () => {
      const s = stateRef.current;
      if (!s || yielded.current) return;
      send(ch, { t: "state", s, ...clockMsg() });
    };

    const commit = (next: PartyState) => {
      stateRef.current = next;
      setState(next);
      saveState(code, next);
      // leave a breadcrumb on the home screen: this device is the one that
      // can resume the game, and the state it resumes is the one just saved
      recordPartyGame(code, "screen", {
        phase: next.phase,
        players: next.players.length,
        teams: next.teams.length,
        top: next.teams.reduce((n, t) => Math.max(n, t.score), 0),
      });
      push();
    };

    // the ONE place the game changes
    const apply = (m: Cmd) => {
      const s = stateRef.current;
      if (!s) return;

      switch (m.cmd) {
        case "setup":
          return commit({ ...s, ...m.patch });

        case "join": {
          const name = m.name.trim().slice(0, 20) || "Someone";
          const avatar = /^a\d+$/.test(m.avatar ?? "") ? m.avatar : undefined;
          const known = s.players.some((p) => p.id === m.id);
          return commit({
            ...s,
            players: known
              ? s.players.map((p) =>
                  p.id === m.id ? { ...p, name, avatar: avatar ?? p.avatar } : p
                )
              : [
                  ...s.players,
                  { id: m.id, name, avatar, team: -1, at: Date.now() },
                ].slice(-24),
          });
        }
        case "assign":
          return commit({
            ...s,
            players: s.players.map((p) =>
              p.id === m.id ? { ...p, team: m.team } : p
            ),
          });
        case "kick":
          return commit({
            ...s,
            players: s.players.filter((p) => p.id !== m.id),
          });
        case "shuffle": {
          const pool = [...s.players];
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          return commit({
            ...s,
            players: s.players.map((p) => ({
              ...p,
              team: pool.findIndex((q) => q.id === p.id) % s.teams.length,
            })),
          });
        }

        case "phase": {
          const next: PartyState = { ...s, phase: m.phase };
          if (m.phase === "picking") {
            next.word = undefined;
            next.scored = false;
            next.drawerId = pickDrawer(next);
            canvasRef.current?.reset();
            firedTimeUp.current = false;
          }
          return commit(next);
        }
        case "drawer":
          return commit({ ...s, drawerId: m.id });
        case "locked":
          // the givers agreed on something; we are deliberately not told what
          if (s.phase !== "picking") return;
          return commit({
            ...s,
            phase: "ready",
            drawerId: s.drawerId ?? pickDrawer(s),
          });

        case "cursor":
          return commit({ ...s, cursor: m.cursor });

        case "clear":
          canvasRef.current?.reset();
          return;

        case "score":
          return commit({
            ...s,
            teams: s.teams.map((t, i) =>
              i === m.team ? { ...t, score: Math.max(0, t.score + m.delta) } : t
            ),
          });

        case "start": {
          if (s.phase !== "ready") return; // a second tap can't restart it
          canvasRef.current?.reset();
          firedTimeUp.current = false;
          clockRef.current = {
            endsAt: Date.now() + s.seconds * 1000,
            frozen: null,
          };
          setEndsAt(clockRef.current.endsAt);
          setFrozen(null);
          return commit({ ...s, phase: "drawing" });
        }
        case "pause": {
          if (clockRef.current.frozen !== null) return;
          const left = Math.max(0, clockRef.current.endsAt - Date.now());
          clockRef.current = { ...clockRef.current, frozen: left };
          setFrozen(left);
          send(ch, { t: "clock", ...clockMsg() });
          return;
        }
        case "resume": {
          if (clockRef.current.frozen === null) return;
          const at = Date.now() + clockRef.current.frozen;
          clockRef.current = { endsAt: at, frozen: null };
          setEndsAt(at);
          setFrozen(null);
          send(ch, { t: "clock", ...clockMsg() });
          return;
        }

        case "reveal": {
          // the serialisation point: first tap wins, later ones are no-ops.
          // also accepted just after time-up, when we're still waiting to be
          // told what the word actually was.
          const ok = s.phase === "drawing" || (s.phase === "result" && !s.word);
          if (!ok) return;
          const alreadyScored = s.phase === "result" && !!s.scored;
          const teams =
            m.scored && !alreadyScored
              ? s.teams.map((t, i) =>
                  i === s.turn ? { ...t, score: t.score + 1 } : t
                )
              : s.teams;
          clockRef.current = { endsAt: 0, frozen: null };
          setEndsAt(0);
          setFrozen(null);
          return commit({
            ...s,
            teams,
            phase: "result",
            word: m.word,
            scored: m.scored || alreadyScored,
            used: [...s.used, m.word.toLowerCase()].filter(Boolean).slice(-800),
            offered: [
              ...s.offered,
              ...(m.offered ?? []).map((w) => w.toLowerCase()),
            ].slice(-800),
          });
        }

        case "next": {
          if (s.phase !== "result") return;
          canvasRef.current?.reset();
          firedTimeUp.current = false;
          const turn = (s.turn + 1) % s.teams.length;
          const next: PartyState = {
            ...s,
            // the team that just drew moves its pen along to the next member
            teams: s.teams.map((t, i) =>
              i === s.turn ? { ...t, drawIdx: t.drawIdx + 1 } : t
            ),
            turn,
            round: turn === 0 ? s.round + 1 : s.round,
            phase: "picking",
            word: undefined,
            scored: false,
          };
          next.drawerId = pickDrawer(next);
          return commit(next);
        }

        case "end":
          clockRef.current = { endsAt: 0, frozen: null };
          setEndsAt(0);
          setFrozen(null);
          return commit({ ...s, phase: "gameover" });
        case "again":
          return commit({
            ...s,
            phase: "lobby",
            turn: 0,
            round: 1,
            word: undefined,
            scored: false,
            drawerId: undefined,
            teams: s.teams.map((t) => ({ ...t, score: 0, drawIdx: 0 })),
          });
      }
    };
    applyRef.current = apply;

    ch.on("broadcast", { event: "p" }, ({ payload }) => {
      const m = payload as PartyMsg;

      // two devices casting the same code: the one that booted later stands
      // down, so an in-progress game is never hijacked mid-turn
      if (m.t === "state") {
        if (m.sid !== sid.current) {
          const iAmNewer =
            bootAt.current > m.since ||
            (bootAt.current === m.since && sid.current > m.sid);
          if (iAmNewer) {
            yielded.current = true;
            setConflict(true);
          }
        }
        return;
      }
      if (m.t === "hello" && m.from === "stage") return;
      if (m.t === "hello" && m.from === "remote") {
        send(ch, { t: "hello", from: "stage" });
        push();
        return;
      }
      if (m.t === "cmd") {
        const { t: _t, ...cmd } = m;
        apply(cmd as Cmd);
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        send(ch, { t: "hello", from: "stage" });
        push();
      }
    });

    const beat = setInterval(() => {
      send(ch, { t: "clock", ...clockMsg() });
      push();
    }, 3000);
    const paint = setInterval(() => setTick((n) => n + 1), 250);
    return () => {
      clearInterval(beat);
      clearInterval(paint);
      ch.unsubscribe();
      chRef.current = null;
    };
  }, [code]);

  // the host taps on this very device, so run it straight through the reducer
  const host = useCallback((c: Cmd) => applyRef.current(c), []);

  const leftMs = frozen ?? Math.max(0, endsAt - Date.now());
  const running = endsAt > 0 && state?.phase === "drawing";

  useEffect(() => {
    if (!running || frozen !== null || leftMs > 0 || firedTimeUp.current) return;
    firedTimeUp.current = true;
    // move to the reveal with NO word — a giver's phone fills it in
    const s = stateRef.current;
    if (s) {
      const next = { ...s, phase: "result" as const, word: undefined, scored: false };
      stateRef.current = next;
      setState(next);
      saveState(code, next);
    }
    setEndsAt(0);
    send(chRef.current, { t: "timeup" });
  }, [running, frozen, leftMs, code]);

  const left = Math.ceil(leftMs / 1000);
  const teams = state?.teams ?? [];
  const drawTeam = teams[state?.turn ?? 0];
  const giveTeam = state ? teams[giverOf(state)] : undefined;
  const drawer = state?.players.find((p) => p.id === state.drawerId);
  const joined = state?.players.length ?? 0;

  const huge = { fontSize: `clamp(34px, ${sh(11)}, 132px)` };
  const big = { fontSize: `clamp(24px, ${sh(6.5)}, 72px)` };
  const mid = { fontSize: `clamp(14px, ${sh(3)}, 30px)` };

  if (conflict) {
    return (
      <main className="mx-auto flex min-h-[80dvh] w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <span className="text-5xl">📺</span>
        <h1 className="font-display text-2xl font-black">
          {code} already has a screen
        </h1>
        <p className="text-ink/60">
          Only one device casts. Join as a remote instead — you can have as many
          of those as you like.
        </p>
        <Link
          href={`/party/${code}`}
          className="rounded-2xl border-2 border-ink bg-coral px-6 py-3 font-display font-black text-white shadow-doodle"
        >
          Be a remote
        </Link>
        <button
          onClick={() => {
            yielded.current = false;
            bootAt.current = 0; // oldest wins, so claim seniority
            setConflict(false);
          }}
          className="text-sm font-bold text-ink/40 underline"
        >
          take over the screen anyway
        </button>
      </main>
    );
  }

  /**
   * The running score. The colour is a rail down the side rather than a wash
   * across the whole tile: four flat pastel slabs side by side was the thing
   * that made this row read as clutter from the sofa.
   */
  const scoreboard = state && state.phase !== "lobby" && teams.length > 0 && (
    <div className="flex shrink-0 items-stretch gap-2">
      {teams.map((t, i) => {
        const drawing = i === state.turn;
        const gives = i === giverOf(state) && state.phase !== "gameover";
        const squad = membersOf(state, i).length;
        return (
          <div
            key={i}
            className={`flex flex-1 items-center gap-2.5 overflow-hidden rounded-2xl border-2 bg-white px-3 py-1.5 transition-all ${
              drawing ? "border-ink shadow-doodle" : "border-ink/12"
            }`}
          >
            <span
              className="w-1.5 shrink-0 self-stretch rounded-full"
              style={{ background: TEAM_TINT[i], opacity: drawing ? 1 : 0.45 }}
            />
            <span className="min-w-0 flex-1">
              <span
                className="block truncate font-display font-bold leading-tight"
                style={{ fontSize: `clamp(12px, ${sh(2.3)}, 26px)` }}
              >
                {t.name}
              </span>
              <span
                className="block truncate font-bold uppercase tracking-wide text-ink/50"
                style={{ fontSize: `clamp(9px, ${sh(1.5)}, 15px)` }}
              >
                {drawing
                  ? "drawing now"
                  : gives
                  ? "gives the word"
                  : `${squad} player${squad === 1 ? "" : "s"}`}
              </span>
            </span>
            <span
              className="font-display font-black tabular-nums"
              style={{ fontSize: `clamp(18px, ${sh(3.8)}, 44px)` }}
            >
              {t.score}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="dd-game dd-nosel mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
      {invite && <InviteOverlay code={code} onClose={() => setInvite(false)} />}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <a
          href="/"
          className="leading-none"
          style={{ fontSize: `clamp(14px, ${sh(2.6)}, 28px)` }}
        >
          <Wordmark />
        </a>
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              joined > 0 ? "bg-mint" : "bg-coral"
            }`}
          />
          <span
            className="font-bold text-ink/50"
            style={{ fontSize: `clamp(11px, ${sh(2)}, 20px)` }}
          >
            {joined} in
          </span>
          <button
            onClick={() => setInvite(true)}
            title="Show the join code and QR"
            className="flex items-center gap-1.5 rounded-lg border-2 border-ink/15 px-2 py-1 font-mono font-bold tracking-[0.25em] text-ink/60 transition-colors hover:border-ink hover:text-ink"
            style={{ fontSize: `clamp(12px, ${sh(2.2)}, 22px)` }}
          >
            <IconQr size={14} />
            {code}
          </button>
          {state && state.phase !== "lobby" && state.phase !== "gameover" && (
            endAsk ? (
              <span className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEndAsk(false);
                    host({ cmd: "end" });
                  }}
                  className="rounded-lg border-2 border-ink bg-coral px-2 py-1 text-[11px] font-bold text-white"
                >
                  end · show scores
                </button>
                <button
                  onClick={() => setEndAsk(false)}
                  className="text-[11px] font-bold text-ink/40 underline"
                >
                  no
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEndAsk(true)}
                className="rounded-lg border-2 border-dashed border-ink/25 px-2 py-1 text-[11px] font-bold text-ink/45 hover:border-ink hover:text-ink"
              >
                🏁 end
              </button>
            )
          )}
        </span>
      </div>

      {scoreboard}

      {state?.phase === "lobby" && (
        <StageLobby
          state={state}
          code={code}
          picked={picked}
          setPicked={setPicked}
          onCmd={host}
        />
      )}

      {state?.phase === "picking" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="text-6xl">🤫</span>
          <h2 className="font-display font-black leading-none" style={big}>
            {giveTeam?.name} are picking a word
          </h2>
          <p className="text-ink/60" style={mid}>
            Huddle up on your phones. {drawTeam?.name} — no looking.
          </p>
        </div>
      )}

      {state?.phase === "ready" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          <span
            className="font-bold uppercase tracking-widest text-ink/40"
            style={mid}
          >
            Round {state.round} · {drawTeam?.name} draws
          </span>
          <h2 className="font-display font-black leading-none" style={huge}>
            {drawer?.name ?? drawTeam?.name}
          </h2>
          <p className="max-w-3xl text-ink/70" style={mid}>
            Go read the word off a <b>{giveTeam?.name}</b> phone, come back, and
            they&apos;ll hit START.
          </p>
        </div>
      )}

      {state?.phase === "drawing" && (
        <>
          <div className="relative h-auto shrink-0 overflow-hidden rounded-2xl border-2 border-ink bg-white">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-200"
              style={{
                width: `${Math.max(0, Math.min(100, (leftMs / (state.seconds * 1000)) * 100))}%`,
                background:
                  left > state.seconds * 0.4
                    ? "rgba(255,217,61,0.55)"
                    : left > state.seconds * 0.15
                    ? "rgba(245,134,44,0.5)"
                    : "rgba(255,107,107,0.55)",
              }}
            />
            <div
              className="relative flex items-center justify-center gap-4 py-1 font-display font-black tabular-nums"
              style={{ fontSize: `clamp(22px, ${sh(5)}, 56px)` }}
            >
              {frozen !== null && <span className="text-ink/40">❚❚</span>}
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              <span
                className="font-sans font-bold text-ink/45"
                style={{ fontSize: `clamp(11px, ${sh(2.2)}, 22px)` }}
              >
                {drawer?.name ?? drawTeam?.name}
              </span>
            </div>
          </div>
          <section className="flex min-h-0 flex-1 flex-col">
            <Canvas
              ref={canvasRef}
              channel={null}
              canDraw
              overlay={
                frozen !== null ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/70 backdrop-blur-md">
                    <span className="font-display font-black" style={big}>
                      Paused
                    </span>
                  </div>
                ) : null
              }
            />
          </section>
        </>
      )}

      {state?.phase === "result" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          <span
            className="font-bold uppercase tracking-widest text-ink/40"
            style={mid}
          >
            The word was
          </span>
          <h2 className="font-display font-black leading-none" style={huge}>
            {state.word ?? "…"}
          </h2>
          <span
            className={`rounded-2xl border-2 border-ink px-6 py-2 font-display font-black ${
              state.scored ? "bg-mint" : "bg-white text-ink/50"
            }`}
            style={big}
          >
            {state.scored ? `${drawTeam?.name} +1` : "Nobody got it"}
          </span>
        </div>
      )}

      {state?.phase === "gameover" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto py-2 text-center">
          <h2 className="font-display font-black leading-none" style={big}>
            Final scores
          </h2>
          <div className="flex w-full max-w-3xl flex-col gap-2">
            {teams
              .map((t, i) => ({ ...t, i }))
              .sort((a, b) => b.score - a.score)
              .map((t, rank, all) => (
                <div
                  key={t.i}
                  className={`flex items-center justify-between gap-3 rounded-2xl border-2 px-5 py-2 ${
                    rank === 0 && t.score > 0
                      ? "border-ink shadow-doodle"
                      : "border-ink/15"
                  }`}
                  style={{
                    background:
                      rank === 0 && t.score > 0 ? TEAM_TINT[t.i] : "#fff",
                  }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span style={mid}>
                      {rank === 0 && t.score > 0 && t.score !== all[1]?.score
                        ? "🏆"
                        : `${rank + 1}.`}
                    </span>
                    <span
                      className="truncate font-display font-black"
                      style={{ fontSize: `clamp(16px, ${sh(3.6)}, 40px)` }}
                    >
                      {t.name}
                    </span>
                  </span>
                  <span
                    className="font-display font-black tabular-nums"
                    style={{ fontSize: `clamp(20px, ${sh(4.4)}, 48px)` }}
                  >
                    {t.score}
                  </span>
                </div>
              ))}
          </div>
          <button
            onClick={() => host({ cmd: "again" })}
            className="mt-1 rounded-2xl border-2 border-ink bg-coral px-8 py-3 font-display font-black text-white shadow-doodle active:translate-y-[2px] active:shadow-none"
            style={mid}
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The lobby, as seen from the sofa.
 *
 * Three bands, in the order somebody actually needs them: how to get in, who
 * has got in but isn't placed yet, and the teams themselves. Team matching is
 * still tap-a-person-then-tap-a-team; what changed is that a team is now a
 * white card with a colour rail and a wrapping row of faces, instead of a tall
 * flat slab of pastel with a stack of thin white bars down it. Twelve people
 * fit without the columns turning into a spreadsheet.
 */
function StageLobby({
  state,
  code,
  picked,
  setPicked,
  onCmd,
}: {
  state: PartyState;
  code: string;
  picked: string | null;
  setPicked: (v: string | null) => void;
  onCmd: (c: Cmd) => void;
}) {
  const waiting = state.players.filter((p) => p.team < 0);
  const everyoneIn = state.players.length > 0 && waiting.length === 0;
  const chip = { fontSize: `clamp(12px, ${sh(2.2)}, 24px)` };
  const label = { fontSize: `clamp(9px, ${sh(1.6)}, 16px)` };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <InvitePanel
        code={code}
        qrSize={sh(20)}
        codeSize={`clamp(26px, ${sh(6.5)}, 74px)`}
      />

      {/* the bench: everybody who has joined but has no team yet */}
      <div className="flex shrink-0 items-start gap-3 rounded-2xl border-2 border-dashed border-ink/25 px-3 py-2">
        <span
          className="mt-1 shrink-0 font-bold uppercase tracking-[0.14em] text-ink/50"
          style={label}
        >
          {state.players.length === 0
            ? "waiting for phones…"
            : waiting.length
            ? picked
              ? "now tap a team"
              : "tap a name, then a team"
            : "everyone is placed"}
        </span>

        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-y-auto"
          style={{ maxHeight: sh(14) }}
        >
          {waiting.map((p) => (
            <button
              key={p.id}
              onClick={() => setPicked(picked === p.id ? null : p.id)}
              className={`flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1 font-display font-bold transition-transform ${
                picked === p.id
                  ? "-translate-y-0.5 border-ink bg-coral text-white shadow-doodle"
                  : "border-ink/20 bg-white"
              }`}
              style={chip}
            >
              <PlayerAvatar
                token={avatarToken(p.id, p.avatar)}
                size={22}
                className="shrink-0"
              />
              {p.name}
            </button>
          ))}
          {state.players.length === 0 && (
            <span className="text-ink/40" style={chip}>
              scan the square above
            </span>
          )}
        </div>

        {state.players.length > 1 && (
          <button
            onClick={() => {
              setPicked(null);
              onCmd({ cmd: "shuffle" });
            }}
            className="mt-0.5 shrink-0 rounded-xl border-2 border-ink/20 bg-white px-3 py-1 font-bold transition-transform active:scale-95"
            style={label}
          >
            🎲 shuffle everyone
          </button>
        )}
      </div>

      {/* the draft board */}
      <div className="flex min-h-0 flex-1 items-stretch gap-2">
        {state.teams.map((t, i) => (
          <Fragment key={i}>
            {i > 0 && state.teams.length === 2 && (
              <span
                className="flex shrink-0 items-center font-display font-black italic text-ink/25"
                style={{ fontSize: `clamp(14px, ${sh(3.4)}, 34px)` }}
              >
                vs
              </span>
            )}
            <TeamCard
              team={t}
              index={i}
              members={membersOf(state, i)}
              armed={!!picked}
              onDrop={() => {
                if (!picked) return;
                onCmd({ cmd: "assign", id: picked, team: i });
                setPicked(null);
              }}
              onRemove={(id) => onCmd({ cmd: "assign", id, team: -1 })}
            />
          </Fragment>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1">
          {[2, 3, 4]
            .filter((n) => n <= MAX_TEAMS)
            .map((n) => (
              <button
                key={n}
                onClick={() =>
                  onCmd({
                    cmd: "setup",
                    patch: {
                      teams: Array.from(
                        { length: n },
                        (_, i) => state.teams[i] ?? newTeam(i)
                      ),
                    },
                  })
                }
                className={`h-10 w-10 rounded-xl border-2 font-display font-black transition-transform active:scale-95 ${
                  state.teams.length === n
                    ? "border-ink bg-sun shadow-doodle"
                    : "border-ink/20 bg-white"
                }`}
              >
                {n}
              </button>
            ))}
          <span className="ml-1 font-bold text-ink/50" style={label}>
            teams
          </span>
        </div>
        <button
          onClick={() => onCmd({ cmd: "phase", phase: "picking" })}
          disabled={!everyoneIn}
          className="ml-auto rounded-2xl border-2 border-ink bg-coral px-8 py-3 font-display font-black text-white shadow-doodle transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-40"
          style={{ fontSize: `clamp(16px, ${sh(3.4)}, 34px)` }}
        >
          {state.players.length === 0
            ? "waiting for phones…"
            : everyoneIn
            ? "Start the game"
            : `place ${waiting.length} more`}
        </button>
      </div>
    </div>
  );
}

/**
 * One team. The whole card is the drop target — while a name is picked it
 * lifts and grows a ghost slot, so from across the room it is obvious where
 * the next tap goes.
 */
function TeamCard({
  team,
  index,
  members,
  armed,
  onDrop,
  onRemove,
}: {
  team: PartyTeam;
  index: number;
  members: PartyPlayer[];
  armed: boolean;
  onDrop: () => void;
  onRemove: (id: string) => void;
}) {
  const tint = TEAM_TINT[index];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onDrop}
      onKeyDown={(e) => e.key === "Enter" && onDrop()}
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border-2 bg-white shadow-doodle transition-all ${
        armed ? "-translate-y-0.5 border-ink" : "border-ink/12"
      }`}
    >
      <span className="h-2 shrink-0" style={{ background: tint }} />

      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2">
        <span
          className="min-w-0 truncate font-display font-black leading-none"
          style={{ fontSize: `clamp(13px, ${sh(2.9)}, 32px)` }}
        >
          {team.name}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-bold"
          style={{
            background: tint,
            fontSize: `clamp(9px, ${sh(1.6)}, 16px)`,
          }}
        >
          {members.length} in
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto p-3">
        {members.map((p) => (
          <button
            key={p.id}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(p.id);
            }}
            title={`Take ${p.name} off this team`}
            className="flex max-w-full items-center gap-1.5 rounded-xl border-2 border-ink/10 bg-paper px-2.5 py-1 font-bold transition-transform active:scale-95"
            style={{ fontSize: `clamp(12px, ${sh(2.2)}, 24px)` }}
          >
            <PlayerAvatar
              token={avatarToken(p.id, p.avatar)}
              size={22}
              className="shrink-0"
            />
            <span className="truncate">{p.name}</span>
          </button>
        ))}

        {armed && (
          <span
            className="flex items-center rounded-xl border-2 border-dashed border-ink/30 px-3 py-1 font-bold text-ink/45"
            style={{ fontSize: `clamp(12px, ${sh(2.2)}, 24px)` }}
          >
            drop here
          </span>
        )}

        {members.length === 0 && !armed && (
          <span
            className="text-ink/40"
            style={{ fontSize: `clamp(11px, ${sh(2)}, 20px)` }}
          >
            nobody yet
          </span>
        )}
      </div>
    </div>
  );
}
