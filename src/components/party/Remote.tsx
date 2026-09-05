"use client";

import { useEffect, useRef, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import WordEntry from "../WordEntry";
import { useEdgeSwipeGuard } from "@/lib/edgeguard";
import { sh, useShellMetrics } from "@/lib/shell";
import { getSavedAvatar, haptic, saveAvatar } from "@/lib/client";
import { recordPartyGame } from "@/lib/partygames";
import { pickWordChoices } from "@/lib/words";
import {
  TEAM_TINT,
  giverOf,
  membersOf,
  myId,
  myName,
  partyChannel,
  saveMyName,
  send,
  sendTeam,
  teamChannel,
  type Cmd,
  type PartyMsg,
  type PartyState,
  type TeamMsg,
} from "@/lib/party";

/**
 * A REMOTE — everybody's phone.
 *
 * What you see depends on which team you're on. The giving team picks the word
 * together (rolls and types are shared between their phones only), then calls
 * a drawer over from the other team and shows them the screen. Everyone else
 * gets a waiting screen with nothing on it worth peeking at — enforced by the
 * fact that this phone only subscribes to its OWN team's channel.
 */
export default function Remote({ code }: { code: string }) {
  useShellMetrics();
  useEdgeSwipeGuard();

  const [state, setState] = useState<PartyState | null>(null);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [cand, setCand] = useState(""); // the word our team is looking at
  const [clock, setClock] = useState({
    endsAt: 0,
    frozen: null as number | null,
    skew: 0,
  });
  const [stageAt, setStageAt] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [, setTick] = useState(0);

  const chRef = useRef<RealtimeChannel | null>(null);
  const teamRef = useRef<RealtimeChannel | null>(null);
  const me = useRef(myId(code));
  const candRef = useRef("");
  const seenWords = useRef<string[]>([]); // everything we looked at this turn
  const sentReveal = useRef("");

  candRef.current = cand;

  useEffect(() => {
    const n = myName();
    setName(n);
  }, []);

  // --- the shared channel -------------------------------------------------
  useEffect(() => {
    const ch = partyChannel(code);
    chRef.current = ch;

    ch.on("broadcast", { event: "p" }, ({ payload }) => {
      const m = payload as PartyMsg;
      if (m.t === "state") {
        setStageAt(Date.now());
        setState(m.s);
        setClock({ endsAt: m.endsAt, frozen: m.frozen, skew: Date.now() - m.now });
        return;
      }
      if (m.t === "clock") {
        setStageAt(Date.now());
        setClock({ endsAt: m.endsAt, frozen: m.frozen, skew: Date.now() - m.now });
        return;
      }
      if (m.t === "hello" && m.from === "stage") setStageAt(Date.now());
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED")
        send(ch, { t: "hello", from: "remote", id: me.current });
    });

    const beat = setInterval(
      () => send(ch, { t: "hello", from: "remote", id: me.current }),
      4000
    );
    const paint = setInterval(() => setTick((n) => n + 1), 250);
    return () => {
      clearInterval(beat);
      clearInterval(paint);
      ch.unsubscribe();
      chRef.current = null;
    };
  }, [code]);

  const meP = state?.players.find((p) => p.id === me.current);
  const myTeam = meP?.team ?? -1;

  // --- my team's private channel -----------------------------------------
  useEffect(() => {
    if (myTeam < 0) return;
    const tc = teamChannel(code, myTeam);
    teamRef.current = tc;
    tc.on("broadcast", { event: "s" }, ({ payload }) => {
      const m = payload as TeamMsg;
      if (m.t === "cand") {
        setCand(m.word);
        if (m.word) seenWords.current.push(m.word);
      }
      // a teammate just opened their phone mid-huddle
      if (m.t === "need" && candRef.current)
        sendTeam(tc, { t: "cand", word: candRef.current, by: me.current });
    });
    tc.subscribe((status) => {
      if (status === "SUBSCRIBED") sendTeam(tc, { t: "need" });
    });
    return () => {
      tc.unsubscribe();
      teamRef.current = null;
      setCand("");
    };
  }, [code, myTeam]);

  const cmd = (c: Cmd) => send(chRef.current, { t: "cmd", ...c } as PartyMsg);

  const shareCand = (w: string) => {
    setCand(w);
    seenWords.current.push(w);
    sendTeam(teamRef.current, { t: "cand", word: w, by: me.current });
  };

  const phase = state?.phase ?? "lobby";
  const teams = state?.teams ?? [];
  const giveTeam = state ? giverOf(state) : -1;
  const iGive = myTeam >= 0 && myTeam === giveTeam;
  const iDraw = state?.drawerId === me.current;
  const drawTeam = state?.turn ?? 0;
  const drawer = state?.players.find((p) => p.id === state.drawerId);
  const connected = Date.now() - stageAt < 12000;

  // keep this phone's home-screen row current — on phase changes only, not on
  // every three-second heartbeat, so we aren't writing localStorage all night
  useEffect(() => {
    if (!state || !meP) return;
    recordPartyGame(code, "remote", {
      name: meP.name,
      phase: state.phase,
      players: state.players.length,
      teams: state.teams.length,
      top: state.teams.reduce((n, t) => Math.max(n, t.score), 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state?.phase, meP?.name]);

  // a fresh turn wipes what our team was looking at
  useEffect(() => {
    if (phase === "picking" || phase === "lobby") {
      setCand("");
      seenWords.current = [];
      sentReveal.current = "";
    }
  }, [phase, state?.turn, state?.round]);

  // time ran out and the stage doesn't know the word — only we do
  useEffect(() => {
    if (
      phase === "result" &&
      state &&
      !state.word &&
      iGive &&
      cand &&
      sentReveal.current !== cand
    ) {
      sentReveal.current = cand;
      const t = window.setTimeout(
        () =>
          cmd({
            cmd: "reveal",
            word: cand,
            scored: false,
            offered: seenWords.current,
          }),
        250 + Math.random() * 400
      );
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, state?.word, iGive, cand]);

  function dealWord() {
    if (!state) return;
    // walk the same forward-only ring the online game uses, so a long party
    // night never comes back round to a word you have already had
    const { words, cursor } = pickWordChoices(state.cursor ?? {}, state.difficulty, {
      salt: state.wordSalt ?? 0,
      themes: state.themePacks ?? null,
    });
    cmd({ cmd: "cursor", cursor: cursor as Record<string, number> });
    shareCand(words[Math.floor(Math.random() * words.length)]);
    haptic(8);
  }

  const leftMs =
    clock.frozen ?? Math.max(0, clock.endsAt - (Date.now() - clock.skew));
  const left = Math.ceil(leftMs / 1000);

  const mid = { fontSize: `clamp(14px, ${sh(2.6)}, 22px)` };
  const big = { fontSize: `clamp(24px, ${sh(5.4)}, 50px)` };

  // ------------------------------------------------------------------ join
  if (!state || (!joined && !meP)) {
    return (
      <main className="dd-game mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-5">
        <h1 className="text-center font-display text-2xl font-black">
          Join {code}
        </h1>
        <p className="text-center text-ink/60">
          {state
            ? "The host will put you in a team."
            : `Looking for the screen showing ${code}…`}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim().slice(0, 20);
            if (!n) return;
            saveMyName(n);
            // the face is whatever this phone already uses online; pin it so
            // a phone that has never picked one keeps the same face all night
            const av = getSavedAvatar();
            saveAvatar(av);
            cmd({ cmd: "join", id: me.current, name: n, avatar: av });
            recordPartyGame(code, "remote", { name: n });
            setJoined(true);
            haptic(12);
          }}
          className="flex flex-col gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            maxLength={20}
            className="w-full rounded-2xl border-2 border-ink/20 bg-white px-4 py-3 text-center font-display text-lg font-bold outline-none focus:border-ink"
          />
          <button
            disabled={!name.trim() || !state}
            className="w-full rounded-2xl border-2 border-ink bg-coral py-4 font-display text-lg font-black text-white shadow-doodle disabled:opacity-40"
          >
            I&apos;m in
          </button>
        </form>
      </main>
    );
  }

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
            connected ? "bg-mint" : "bg-coral"
          }`}
        />
        <span className="truncate text-[11px] font-bold text-ink/55">
          {meP?.name}
          {myTeam >= 0 && (
            <span
              className="ml-1.5 rounded px-1.5 py-0.5 text-ink"
              style={{ background: TEAM_TINT[myTeam] }}
            >
              {teams[myTeam]?.name}
            </span>
          )}
        </span>
      </span>
      <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-ink/40">
        {code}
      </span>
    </div>
  );

  const endButton = phase !== "lobby" && phase !== "gameover" && (
    <div className="shrink-0 pt-1 text-center">
      {confirmEnd ? (
        <span className="flex items-center justify-center gap-2 text-[11px]">
          <span className="text-ink/50">End the game?</span>
          <button
            onClick={() => {
              setConfirmEnd(false);
              cmd({ cmd: "end" });
            }}
            className="rounded-lg border-2 border-ink bg-white px-2 py-0.5 font-bold"
          >
            yes, final scores
          </button>
          <button
            onClick={() => setConfirmEnd(false)}
            className="font-bold text-ink/40 underline"
          >
            no
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmEnd(true)}
          className="text-[11px] font-bold text-ink/30 underline"
        >
          end game
        </button>
      )}
    </div>
  );

  const scoreboard = phase !== "lobby" && (
    <div
      className="grid shrink-0 gap-1.5"
      style={{ gridTemplateColumns: `repeat(${teams.length}, minmax(0,1fr))` }}
    >
      {teams.map((t, i) => (
        <div
          key={i}
          className={`rounded-xl border-2 px-1.5 py-1 text-center ${
            i === drawTeam ? "border-ink" : "border-ink/15"
          }`}
          style={{ background: i === drawTeam ? TEAM_TINT[i] : "#fff" }}
        >
          <div className="truncate text-[11px] font-bold leading-tight">
            {t.name}
            {i === giveTeam && phase !== "gameover" && (
              <span className="ml-1 text-[9px] text-ink/45">WORD</span>
            )}
          </div>
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => cmd({ cmd: "score", team: i, delta: -1 })}
              className="text-[11px] font-bold text-ink/35"
              aria-label="minus"
            >
              −
            </button>
            <span className="font-display text-base font-black tabular-nums">
              {t.score}
            </span>
            <button
              onClick={() => cmd({ cmd: "score", team: i, delta: 1 })}
              className="text-[11px] font-bold text-ink/35"
              aria-label="plus"
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="dd-game dd-nosel mx-auto flex w-full max-w-2xl flex-col gap-2 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
      {header}
      {scoreboard}

      {/* ---------------------------------------------------------- lobby */}
      {phase === "lobby" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          {myTeam < 0 ? (
            <>
              <span className="text-5xl">🙋</span>
              <h2 className="font-display font-black" style={big}>
                You&apos;re in, {meP?.name}
              </h2>
              <p className="text-ink/60" style={mid}>
                Waiting for the host to put you in a team — watch the telly.
              </p>
            </>
          ) : (
            <>
              <span
                className="rounded-2xl border-2 border-ink px-5 py-2 font-display font-black"
                style={{ background: TEAM_TINT[myTeam], ...big }}
              >
                {teams[myTeam]?.name}
              </span>
              <p className="text-ink/60" style={mid}>
                with{" "}
                {membersOf(state, myTeam)
                  .filter((p) => p.id !== me.current)
                  .map((p) => p.name)
                  .join(", ") || "…nobody yet"}
              </p>
              <p className="text-[11px] text-ink/40">
                The host starts the game from the big screen.
              </p>
            </>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- picking */}
      {phase === "picking" && iGive && (
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
          <div className="text-center">
            <h2
              className="font-display font-black leading-tight"
              style={{ fontSize: `clamp(17px, ${sh(3.4)}, 30px)` }}
            >
              Your team picks the word
            </h2>
            <p className="text-ink/60" style={mid}>
              {drawer?.name ?? teams[drawTeam]?.name} will draw it. Agree on one,
              then lock it in.
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
            <div className="flex w-full flex-1 items-center justify-center rounded-3xl border-4 border-dashed border-ink/25 bg-white/70 px-4">
              <span
                className="text-center font-display font-black leading-none"
                style={{ fontSize: `clamp(26px, ${sh(7)}, 64px)` }}
              >
                {cand || (
                  <span className="text-sm font-bold text-ink/35">
                    {state.source === "bank"
                      ? "roll one below"
                      : "type one below"}
                  </span>
                )}
              </span>
            </div>
            {state.source === "bank" && (
              <button
                onClick={dealWord}
                className="w-full rounded-2xl border-2 border-ink bg-white py-3 font-display font-bold shadow-doodle active:translate-y-[2px] active:shadow-none"
                style={mid}
              >
                🎲 {cand ? "another one" : "roll a word"}
              </button>
            )}
          </div>

          {state.source === "teams" ? (
            <WordEntry
              onSubmit={(t) => shareCand(t)}
              placeholder="type a word…"
              submitLabel="show team"
            />
          ) : null}

          <button
            onClick={() => {
              if (!cand) return;
              haptic(16);
              cmd({ cmd: "locked" });
            }}
            disabled={!cand}
            className="w-full shrink-0 rounded-2xl border-2 border-ink bg-coral py-4 font-display font-black text-white shadow-doodle active:translate-y-[2px] active:shadow-none disabled:opacity-40"
            style={big}
          >
            Lock it in
          </button>
          {endButton}
        </div>
      )}

      {phase === "picking" && !iGive && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="text-5xl">🤫</span>
          <h2 className="font-display font-black" style={big}>
            {teams[giveTeam]?.name} are picking
          </h2>
          <p className="text-ink/60" style={mid}>
            {iDraw ? (
              <>
                <b>You&apos;re drawing this turn.</b> They&apos;ll call you over
                in a second.
              </>
            ) : (
              <>Nothing to see here. Get your guessing voice ready.</>
            )}
          </p>
          {endButton}
        </div>
      )}

      {/* ---------------------------------------------------------- ready */}
      {phase === "ready" && iGive && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
          <span
            className="font-bold uppercase tracking-widest text-ink/45"
            style={mid}
          >
            call {drawer?.name ?? teams[drawTeam]?.name} over — show them this
          </span>
          <div className="flex w-full flex-1 items-center justify-center rounded-3xl border-4 border-ink bg-white px-4">
            <span
              className="text-center font-display font-black leading-none"
              style={{ fontSize: `clamp(30px, ${sh(9)}, 80px)` }}
            >
              {cand || "…"}
            </span>
          </div>
          <div className="flex w-full shrink-0 gap-2">
            <button
              onClick={() => cmd({ cmd: "phase", phase: "picking" })}
              className="rounded-2xl border-2 border-ink/20 bg-white px-4 py-3 font-bold text-ink/50"
            >
              back
            </button>
            <button
              onClick={() => {
                const squad = membersOf(state, drawTeam);
                if (squad.length < 2) return;
                const at = squad.findIndex((p) => p.id === state.drawerId);
                cmd({ cmd: "drawer", id: squad[(at + 1) % squad.length].id });
              }}
              className="rounded-2xl border-2 border-ink bg-white px-3 py-3 text-[11px] font-bold shadow-doodle"
            >
              someone
              <br />
              else
            </button>
            <button
              onClick={() => {
                haptic(16);
                cmd({ cmd: "start" });
              }}
              className="flex-1 rounded-2xl border-2 border-ink bg-coral py-4 font-display font-black text-white shadow-doodle active:translate-y-[2px] active:shadow-none"
              style={big}
            >
              START
            </button>
          </div>
          {endButton}
        </div>
      )}

      {phase === "ready" && !iGive && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="text-5xl">{iDraw ? "🎨" : "👀"}</span>
          <h2 className="font-display font-black" style={big}>
            {iDraw ? "You're up!" : `${drawer?.name ?? "Someone"} is drawing`}
          </h2>
          <p className="text-ink/60" style={mid}>
            {iDraw ? (
              <>
                Go read the word off a <b>{teams[giveTeam]?.name}</b> phone, then
                take the iPad.
              </>
            ) : (
              <>Get ready to shout.</>
            )}
          </p>
          {endButton}
        </div>
      )}

      {/* -------------------------------------------------------- drawing */}
      {phase === "drawing" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-between gap-2 py-1 text-center">
          <div>
            {iGive ? (
              <>
                <span className="text-ink/50" style={mid}>
                  they&apos;re drawing
                </span>
                <div className="font-display text-xl font-black">
                  {cand || "?"}
                </div>
              </>
            ) : (
              <>
                <span className="text-ink/50" style={mid}>
                  {drawer?.name ?? teams[drawTeam]?.name} is drawing
                </span>
                <div className="font-display text-lg font-black text-ink/45">
                  {iDraw ? "…that's you!" : "shout it out"}
                </div>
              </>
            )}
          </div>

          <div
            className="font-display font-black tabular-nums"
            style={{ fontSize: `clamp(44px, ${sh(13)}, 110px)` }}
          >
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </div>

          <div className="flex w-full flex-col gap-2">
            {iGive ? (
              <>
                <button
                  onClick={() => {
                    haptic(24);
                    cmd({
                      cmd: "reveal",
                      word: cand,
                      scored: true,
                      offered: seenWords.current,
                    });
                  }}
                  className="w-full rounded-2xl border-2 border-ink bg-mint py-5 font-display font-black shadow-doodle active:translate-y-[2px] active:shadow-none"
                  style={big}
                >
                  They got it! +1
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      cmd({ cmd: clock.frozen === null ? "pause" : "resume" });
                      haptic(12);
                    }}
                    className="flex-1 rounded-2xl border-2 border-ink bg-white py-3 font-display font-bold shadow-doodle active:translate-y-[2px] active:shadow-none"
                  >
                    {clock.frozen === null ? "❚❚ Pause" : "▶ Resume"}
                  </button>
                  <button
                    onClick={() => {
                      haptic(10);
                      cmd({
                        cmd: "reveal",
                        word: cand,
                        scored: false,
                        offered: seenWords.current,
                      });
                    }}
                    className="flex-1 rounded-2xl border-2 border-ink bg-white py-3 font-display font-bold text-ink/60 shadow-doodle active:translate-y-[2px] active:shadow-none"
                  >
                    ⏹ Time&apos;s up
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  cmd({ cmd: clock.frozen === null ? "pause" : "resume" });
                  haptic(12);
                }}
                className="w-full rounded-2xl border-2 border-ink bg-white py-3 font-display font-bold shadow-doodle active:translate-y-[2px] active:shadow-none"
              >
                {clock.frozen === null ? "❚❚ Pause" : "▶ Resume"}
              </button>
            )}
          </div>
          {endButton}
        </div>
      )}

      {/* --------------------------------------------------------- result */}
      {phase === "result" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          <div>
            <span
              className="font-bold uppercase tracking-widest text-ink/40"
              style={mid}
            >
              the word was
            </span>
            <h2 className="font-display font-black leading-none" style={big}>
              {state.word ?? cand ?? "…"}
            </h2>
          </div>
          {state.scored ? (
            <span className="rounded-2xl border-2 border-ink bg-mint px-5 py-2 font-display text-lg font-black">
              {teams[drawTeam]?.name} +1
            </span>
          ) : (
            <button
              onClick={() => cmd({ cmd: "score", team: drawTeam, delta: 1 })}
              className="w-full rounded-2xl border-2 border-ink bg-mint py-4 font-display text-base font-black shadow-doodle active:translate-y-[2px] active:shadow-none"
            >
              Actually, {teams[drawTeam]?.name} got it +1
            </button>
          )}
          <button
            onClick={() => {
              setCand("");
              cmd({ cmd: "next" });
            }}
            className="w-full rounded-2xl border-2 border-ink bg-coral py-5 font-display font-black text-white shadow-doodle active:translate-y-[2px] active:shadow-none"
            style={big}
          >
            Next: {teams[(drawTeam + 1) % teams.length]?.name} draw →
          </button>
          {endButton}
        </div>
      )}

      {/* ------------------------------------------------------- gameover */}
      {phase === "gameover" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
          <h2 className="font-display font-black" style={big}>
            Final scores
          </h2>
          <div className="flex w-full flex-col gap-1.5">
            {teams
              .map((t, i) => ({ ...t, i }))
              .sort((a, b) => b.score - a.score)
              .map((t, rank) => (
                <div
                  key={t.i}
                  className="flex items-center justify-between rounded-xl border-2 border-ink/15 px-4 py-2"
                  style={{ background: rank === 0 ? TEAM_TINT[t.i] : "#fff" }}
                >
                  <span className="font-display font-bold">
                    {rank === 0 ? "🏆 " : `${rank + 1}. `}
                    {t.name}
                  </span>
                  <span className="font-display text-lg font-black tabular-nums">
                    {t.score}
                  </span>
                </div>
              ))}
          </div>
          <button
            onClick={() => cmd({ cmd: "again" })}
            className="mt-1 w-full rounded-2xl border-2 border-ink bg-coral py-4 font-display font-black text-white shadow-doodle active:translate-y-[2px] active:shadow-none"
            style={mid}
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
