"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import Canvas, { CanvasHandle, Op } from "./Canvas";
import Chat from "./Chat";
import Players from "./Players";
import AvatarPicker from "./AvatarPicker";
import VirtualKeyboard from "./VirtualKeyboard";
import GuessClouds from "./GuessClouds";
import InstallTip from "./InstallTip";
import {
  api,
  getMuted,
  getPlayerId,
  getSavedAvatar,
  getSavedName,
  mergeMasks,
  saveAvatar,
  roomChannel,
  saveName,
  savePlayerId,
  setMuted,
  sound,
  unlockAudio,
} from "@/lib/client";
import { ChatMsg, ClientState, StrokeMsg } from "@/lib/types";
import type { PlanItem, PlanStroke } from "@/lib/botdraw";
import {
  IconBrush,
  IconCheck,
  IconCrayon,
  IconCrown,
  IconFlag,
  IconGallery,
  IconHeart,
  IconHint,
  IconHole,
  IconLink,
  IconLogo,
  IconMedal,
  IconParty,
  IconReplay,
  IconRocket,
  IconSkip,
  IconSoundOff,
  IconSoundOn,
  IconX,
  PlayerAvatar,
  Wordmark,
} from "./icons";

interface GalleryItem {
  word: string;
  drawerName: string;
  drawerAvatar: string;
  dataUrl: string;
  reactions: number;
}

export default function Room({ roomId }: { roomId: string }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<ClientState | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [now, setNow] = useState(Date.now());
  const [muted, setMutedState] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [draft, setDraft] = useState("");
  const [isTouch, setIsTouch] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [notFound, setNotFound] = useState(false);

  const canvasRef = useRef<CanvasHandle>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<ClientState | null>(null);
  stateRef.current = state;
  const playerIdRef = useRef<string | null>(null);
  playerIdRef.current = playerId;
  const offsetRef = useRef(0);
  const advanceLock = useRef(0);
  const reactionsThisTurn = useRef(0);
  const prevPhaseKey = useRef("");
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastTickSec = useRef(-1);

  useEffect(() => {
    setPlayerId(getPlayerId(roomId));
    setMutedState(getMuted());
  }, [roomId]);

  // device shape: touch phones/tablets get the in-app keyboard
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)");
    const land = window.matchMedia("(orientation: landscape)");
    // ?kb=1 forces the in-app keyboard (touchscreen laptops, testing)
    const forced = new URLSearchParams(window.location.search).get("kb") === "1";
    const upd = () => {
      setIsTouch(touch.matches || forced);
      setLandscape(land.matches);
    };
    upd();
    touch.addEventListener("change", upd);
    land.addEventListener("change", upd);
    return () => {
      touch.removeEventListener("change", upd);
      land.removeEventListener("change", upd);
    };
  }, []);

  // browsers keep audio muted until the page is touched
  useEffect(() => {
    const go = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", go);
    };
    window.addEventListener("pointerdown", go);
    return () => window.removeEventListener("pointerdown", go);
  }, []);

  const me = state?.players.find((p) => p.id === playerId);
  const isDrawer = !!state && state.drawerId === playerId;
  const hasGuessed = !!state && !!playerId && state.guessedIds.includes(playerId);
  const isHost = !!state && state.hostId === playerId;

  const applyState = useCallback((s: ClientState, keepPrivate = true) => {
    offsetRef.current = s.serverNow ? s.serverNow - Date.now() : offsetRef.current;
    setState((prev) => {
      if (!prev) return s;
      // hint tokens belong to the player, not the turn — broadcasts omit them,
      // so never let a state push blank them out
      const carried: ClientState = {
        ...s,
        yourHints: s.yourHints ?? prev.yourHints,
        yourHintProgress: s.yourHintProgress ?? prev.yourHintProgress,
      };
      if (
        keepPrivate &&
        prev.phase === s.phase &&
        prev.drawerId === s.drawerId
      ) {
        return {
          ...carried,
          mask: mergeMasks(prev.mask, s.mask),
          yourWord: s.yourWord ?? prev.yourWord,
          yourChoices: s.yourChoices ?? prev.yourChoices,
          yourChoiceTiers: s.yourChoiceTiers ?? prev.yourChoiceTiers,
        };
      }
      return carried;
    });
  }, []);

  const addMsg = useCallback((m: Omit<ChatMsg, "id" | "ts">) => {
    setMsgs((prev) => [
      ...prev,
      { ...m, id: `${Date.now()}-${Math.random()}`, ts: Date.now() },
    ]);
  }, []);

  const addSystem = useCallback(
    (text: string) => addMsg({ from: "", name: "", avatar: "", text, kind: "system" }),
    [addMsg]
  );

  // --- channel setup ------------------------------------------------------

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;

    (async () => {
      try {
        const { state: s } = await api<{ state: ClientState }>(`/${roomId}`, {
          type: "rejoin",
          playerId,
        });
        if (cancelled) return;
        applyState(s, false);
      } catch {
        if (!cancelled) {
          savePlayerId(roomId, "");
          setPlayerId(null);
        }
        return;
      }

      const ch = roomChannel(roomId, playerId);
      channelRef.current = ch;

      ch.on("broadcast", { event: "state" }, ({ payload }) => {
        applyState(payload as ClientState);
      });
      ch.on("broadcast", { event: "stroke" }, ({ payload }) => {
        canvasRef.current?.applyStroke(payload as StrokeMsg);
      });
      ch.on("broadcast", { event: "fill" }, ({ payload }) => {
        canvasRef.current?.applyFill(payload as { x: number; y: number; color: string });
      });
      ch.on("broadcast", { event: "undo" }, () => canvasRef.current?.applyUndo());
      ch.on("broadcast", { event: "clear" }, () => canvasRef.current?.applyClear());
      ch.on("broadcast", { event: "chat" }, ({ payload }) => {
        const m = payload as ChatMsg & { guessedOnly?: boolean };
        if (m.guessedOnly) {
          const st = stateRef.current;
          const pid = playerIdRef.current;
          const canSee =
            !st ||
            st.phase !== "drawing" ||
            st.drawerId === pid ||
            (pid && st.guessedIds.includes(pid));
          if (!canSee) return;
          addMsg({ ...m, kind: "whisper" });
          return;
        }
        addMsg(m);
      });
      ch.on("broadcast", { event: "correct" }, ({ payload }) => {
        const m = payload as { name: string; avatar: string; from: string };
        addMsg({ ...m, text: "", kind: "correct" });
        sound("othercorrect");
      });
      ch.on("broadcast", { event: "sync_req" }, ({ payload }) => {
        const st = stateRef.current;
        const pid = playerIdRef.current;
        // the drawer answers; when a bot is drawing, the host holds the canvas
        const botDrawing = st?.players.find((p) => p.id === st.drawerId)?.isBot;
        const iAnswer =
          st?.drawerId === pid || (botDrawing && st?.hostId === pid);
        if (iAnswer && st.phase === "drawing") {
          ch.send({
            type: "broadcast",
            event: "sync_res",
            payload: { to: (payload as { playerId: string }).playerId, ops: canvasRef.current?.getOps() ?? [] },
          });
        }
      });
      ch.on("broadcast", { event: "sync_res" }, ({ payload }) => {
        const p = payload as { to: string; ops: Op[] };
        if (p.to === playerIdRef.current) canvasRef.current?.applyOps(p.ops);
      });
      ch.on("presence", { event: "leave" }, ({ key }) => {
        const gone = key as string;
        setTimeout(() => {
          const st = stateRef.current;
          const pid = playerIdRef.current;
          if (!st || !pid) return;
          const presence = channelRef.current?.presenceState() ?? {};
          if (presence[gone]) return; // came back
          const stillListed = st.players.find((p) => p.id === gone && p.connected);
          const iAmReporter = st.hostId === pid || gone === st.hostId;
          if (stillListed && iAmReporter) {
            api(`/${roomId}`, { type: "leave", playerId: gone }).catch(() => {});
          }
        }, 6000);
      });

      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ online: true });
          const st = stateRef.current;
          if (st?.phase === "drawing" && st.drawerId !== playerId) {
            ch.send({ type: "broadcast", event: "sync_req", payload: { playerId } });
          }
        }
      });
    })();

    const onUnload = () => {
      navigator.sendBeacon(
        `/api/rooms/${roomId}`,
        new Blob([JSON.stringify({ type: "leave", playerId })], {
          type: "application/json",
        })
      );
    };
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onUnload);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, roomId]);

  // --- bot artist: the host's client performs a bot's drawing turn ----------
  // The plan is coordinates only; strokes go out on the same channel a human
  // would use, animated with a hand-like speed curve.
  const botDrawRef = useRef<{ cancelled: boolean; timers: ReturnType<typeof setTimeout>[] }>({
    cancelled: false,
    timers: [],
  });

  const performStroke = useCallback((item: PlanStroke) => {
    const sid = Math.random().toString(36).slice(2, 9);
    const n = item.pts.length / 2;
    if (n < 1) return;
    const started = performance.now();
    let sent = 0;
    let pending: number[] = [];
    let lastFlush = started;
    const step = () => {
      if (botDrawRef.current.cancelled) return;
      const elapsed = performance.now() - started;
      const p = Math.min(1, elapsed / Math.max(1, item.duration));
      // minimum-jerk: eases out of rest, accelerates, settles at the end
      const eased = p * p * (3 - 2 * p);
      const target = Math.max(1, Math.round(eased * n));
      if (target > sent) {
        const slice = item.pts.slice(sent * 2, target * 2);
        canvasRef.current?.applyStroke({
          sid,
          tool: "pen",
          color: item.color,
          size: item.w,
          pts: slice,
          done: p >= 1,
        });
        pending = pending.concat(slice);
        sent = target;
      }
      const now2 = performance.now();
      if (pending.length > 0 && (now2 - lastFlush > 90 || p >= 1)) {
        channelRef.current?.send({
          type: "broadcast",
          event: "stroke",
          payload: {
            sid,
            tool: "pen",
            color: item.color,
            size: item.w,
            pts: pending,
            done: p >= 1,
          },
        });
        pending = [];
        lastFlush = now2;
      }
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    botDrawRef.current.timers.forEach(clearTimeout);
    botDrawRef.current = { cancelled: false, timers: [] };
    const ctl = botDrawRef.current;
    if (!state || !playerId || state.hostId !== playerId) return;
    const drawer = state.players.find((p) => p.id === state.drawerId);
    if (!drawer?.isBot) return;

    if (state.phase === "choosing") {
      // a beat of "hmm" before committing, like a person would
      ctl.timers.push(
        setTimeout(() => {
          if (ctl.cancelled) return;
          api(`/${roomId}`, { type: "botchoose", playerId }).catch(() => {});
        }, 1600 + Math.random() * 2600)
      );
    }

    if (state.phase === "drawing") {
      (async () => {
        try {
          const { items } = await api<{ items: PlanItem[] }>(`/${roomId}`, {
            type: "botplan",
            playerId,
          });
          if (ctl.cancelled) return;
          let t = 0;
          for (const item of items) {
            t += item.delay;
            const at = t;
            if (item.kind === "stroke") {
              t += item.duration;
              ctl.timers.push(
                setTimeout(() => {
                  if (!ctl.cancelled) performStroke(item);
                }, at)
              );
            } else if (item.kind === "fill") {
              ctl.timers.push(
                setTimeout(() => {
                  if (ctl.cancelled) return;
                  canvasRef.current?.applyFill(item);
                  channelRef.current?.send({
                    type: "broadcast",
                    event: "fill",
                    payload: { x: item.x, y: item.y, color: item.color },
                  });
                }, at)
              );
            } else {
              ctl.timers.push(
                setTimeout(() => {
                  if (ctl.cancelled) return;
                  canvasRef.current?.applyUndo();
                  channelRef.current?.send({
                    type: "broadcast",
                    event: "undo",
                    payload: {},
                  });
                }, at)
              );
            }
          }
        } catch {}
      })();
    }

    return () => {
      ctl.cancelled = true;
      ctl.timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.turnIndex, state?.hostId, state?.drawerId, playerId, roomId]);

  // --- bot driver: the host's client makes bots guess -----------------------
  const botTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
    if (!state || !playerId || state.hostId !== playerId) return;
    if (state.phase !== "drawing") return;
    const bots = state.players.filter(
      (p) =>
        p.isBot &&
        p.id !== state.drawerId && // the artist doesn't guess its own drawing
        !state.guessedIds.includes(p.id)
    );
    if (bots.length === 0) return;

    bots.forEach((bot, bi) => {
      // several attempts per bot, staggered so bots feel independent; ones
      // that land on an empty canvas are skipped, so more are scheduled
      for (let attempt = 1; attempt <= 6; attempt++) {
        const delay =
          6000 + bi * 2500 + (attempt - 1) * (6500 + Math.random() * 3500);
        botTimers.current.push(
          setTimeout(async () => {
            const st = stateRef.current;
            if (!st || st.phase !== "drawing") return;
            if (st.guessedIds.includes(bot.id)) return;
            // don't guess at a blank board — wait until there's something to see
            if ((canvasRef.current?.inkFraction() ?? 0) < 0.006) return;
            try {
              const image = canvasRef.current?.snapshotSmall() ?? "";
              const { guess, result } = await api<{
                guess: string | null;
                result: string;
              }>(`/${roomId}`, {
                type: "botguess",
                playerId,
                botId: bot.id,
                image,
                attempt,
              });
              if (!guess) return;
              const payload = {
                from: bot.id,
                name: bot.name,
                avatar: bot.avatar,
              };
              if (result === "correct") {
                addMsg({ ...payload, text: "", kind: "correct" });
                sound("othercorrect");
                channelRef.current?.send({
                  type: "broadcast",
                  event: "correct",
                  payload,
                });
              } else if (result === "wrong" || result === "close") {
                addMsg({ ...payload, text: guess, kind: "guess" });
                channelRef.current?.send({
                  type: "broadcast",
                  event: "chat",
                  payload: { ...payload, text: guess, kind: "guess" },
                });
              }
            } catch {}
          }, delay)
        );
      }
    });
    return () => {
      botTimers.current.forEach(clearTimeout);
      botTimers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.turnIndex, state?.hostId, playerId, roomId]);

  // announce roster changes: joins, disconnects, reconnects
  const rosterRef = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (!state) return;
    const next = new Map(state.players.map((p) => [p.id, p.connected]));
    const prev = rosterRef.current;
    rosterRef.current = next;
    if (!prev) return; // first load: no announcements
    for (const p of state.players) {
      const was = prev.get(p.id);
      if (was === undefined) {
        if (p.id !== playerId) addSystem(`${p.name} joined the game!`);
      } else if (was && !p.connected) {
        addSystem(`${p.name} disconnected`);
      } else if (!was && p.connected && p.id !== playerId) {
        addSystem(`${p.name} is back!`);
      }
    }
    for (const [id] of prev) {
      if (!next.has(id)) {
        // removed entirely (kicked) — kick announcements are sent by the host
      }
    }
  }, [state, playerId, addSystem]);

  // self-heal: if the server thinks we're disconnected (stale leave beacon,
  // duplicate tab closed, flaky network) but this tab is alive, rejoin
  const healLock = useRef(0);
  useEffect(() => {
    if (!state || !playerId) return;
    if (!state.players.some((p) => p.id === playerId)) {
      // we were removed from the room (kicked) — back to the join gate
      savePlayerId(roomId, "");
      setPlayerId(null);
      setState(null);
      return;
    }
    const meNow = state.players.find((p) => p.id === playerId);
    if (meNow && !meNow.connected && Date.now() - healLock.current > 5000) {
      healLock.current = Date.now();
      api<{ state: ClientState }>(`/${roomId}`, { type: "rejoin", playerId })
        .then(({ state: s }) => applyState(s))
        .catch(() => {});
    }
  }, [state, playerId, roomId, applyState]);

  // --- clock + advance driver --------------------------------------------

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      const st = stateRef.current;
      const pid = playerIdRef.current;
      if (!st || !pid) return;
      if (!["choosing", "drawing", "reveal"].includes(st.phase)) return;
      const serverNow = Date.now() + offsetRef.current;
      const left = st.phaseEndsAt - serverNow;

      if (st.phase === "drawing" && left > 0 && left <= 5200) {
        const sec = Math.ceil(left / 1000);
        if (sec !== lastTickSec.current) {
          lastTickSec.current = sec;
          sound("tick");
        }
      }

      const myIdx = Math.max(0, st.players.findIndex((p) => p.id === pid));
      const myDelay = 400 + myIdx * 500;
      if (left < -myDelay && Date.now() - advanceLock.current > 2500) {
        advanceLock.current = Date.now();
        api(`/${roomId}`, { type: "advance", playerId: pid })
          .then(({ state: s }) => applyState(s))
          .catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [roomId, applyState]);

  // --- phase-change side effects -----------------------------------------

  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}:${state.round}:${state.turnIndex}`;
    if (key === prevPhaseKey.current) return;
    const prevKey = prevPhaseKey.current;
    prevPhaseKey.current = key;

    hintTimers.current.forEach(clearTimeout);
    hintTimers.current = [];

    if (state.phase === "choosing") {
      canvasRef.current?.reset();
      reactionsThisTurn.current = 0;
      const drawer = state.players.find((p) => p.id === state.drawerId);
      addSystem(
        state.drawerId === playerId
          ? "Your turn! Pick a word"
          : `${drawer?.name ?? "Someone"} is picking a word…`
      );
      if (state.drawerId === playerId && !state.yourChoices) {
        api<{ state: ClientState }>(`/${roomId}?playerId=${playerId}`)
          .then(({ state: s }) => applyState(s, false))
          .catch(() => {});
      }
    }

    if (state.phase === "drawing") {
      sound("start");
      lastTickSec.current = -1;
      if (state.drawerId === playerId && !state.yourWord) {
        // auto-picked while we never chose: fetch our word
        api<{ state: ClientState }>(`/${roomId}?playerId=${playerId}`)
          .then(({ state: s }) => applyState(s))
          .catch(() => {});
      }
      if (state.drawerId !== playerId) {
        // refresh mask at hint reveal moments
        const total = state.settings.drawSeconds * 1000;
        const serverNow = Date.now() + offsetRef.current;
        for (const frac of [0.5, 0.75, 0.88]) {
          const fireIn = state.phaseEndsAt - total * (1 - frac) - serverNow + 400;
          if (fireIn > 0) {
            hintTimers.current.push(
              setTimeout(() => {
                const pid = playerIdRef.current;
                api<{ state: ClientState }>(`/${roomId}?playerId=${pid}`)
                  .then(({ state: s }) => applyState(s))
                  .catch(() => {});
              }, fireIn)
            );
          }
        }
      }
    }

    if (state.phase === "reveal" && prevKey.startsWith("drawing")) {
      const snap = canvasRef.current?.snapshot();
      const lt = state.lastTurn;
      if (snap && lt) {
        const drawer = state.players.find((p) => p.id === lt.drawerId);
        setGallery((g) => [
          ...g,
          {
            word: lt.word,
            drawerName: drawer?.name ?? "?",
            drawerAvatar: drawer?.avatar ?? "a0",
            dataUrl: snap,
            reactions: reactionsThisTurn.current,
          },
        ]);
      }
      if (state.lastTurn) {
        addSystem(
          state.lastTurn.skipped
            ? "Turn skipped!"
            : `The word was “${state.lastTurn.word}”`
        );
      }
    }

    if (state.phase === "gameover") {
      sound("over");
    }
    if (state.phase === "lobby" && prevKey && !prevKey.startsWith("lobby")) {
      canvasRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.turnIndex, state?.yourChoices]);

  // --- actions ------------------------------------------------------------

  async function sendChat(text: string) {
    const st = stateRef.current;
    const pid = playerIdRef.current;
    if (!st || !pid || !me) return;
    const base = { from: pid, name: me.name, avatar: me.avatar };

    const guessing = st.phase === "drawing" && !isDrawer && !hasGuessed;
    if (guessing) {
      addMsg({ ...base, text, kind: "guess" });
      try {
        const { result, state: s } = await api<{
          result: string;
          state: ClientState;
        }>(`/${roomId}`, { type: "guess", playerId: pid, text });
        if (result === "correct") {
          sound("correct");
          applyState(s, false);
          addMsg({ ...base, text: "", kind: "correct" });
          channelRef.current?.send({
            type: "broadcast",
            event: "correct",
            payload: base,
          });
        } else if (result === "expired") {
          applyState(s, false);
          addSystem("Too late — time was already up!");
        } else {
          if (result === "close")
            addMsg({ ...base, text: `“${text}” is sooo close!`, kind: "close" });
          channelRef.current?.send({
            type: "broadcast",
            event: "chat",
            payload: { ...base, text, kind: "guess" },
          });
        }
      } catch {}
      return;
    }

    // drawer / guessed players / lobby chatter
    const guessedOnly = st.phase === "drawing" && (isDrawer || hasGuessed);
    addMsg({ ...base, text, kind: guessedOnly ? "whisper" : "guess" });
    channelRef.current?.send({
      type: "broadcast",
      event: "chat",
      payload: { ...base, text, kind: "guess", guessedOnly },
    });
  }

  function kick(targetId: string, name: string) {
    api(`/${roomId}`, { type: "kick", playerId, targetId })
      .then(() => addSystem(`${name} was removed from the room`))
      .catch(() => {});
  }

  function skipTurnAsHost() {
    api(`/${roomId}`, { type: "skip", playerId })
      .then(() => addSystem("Host skipped the turn"))
      .catch(() => {});
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  async function copyName() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedName(true);
      setTimeout(() => setCopiedName(false), 1600);
    } catch {}
  }

  // --- join gate ----------------------------------------------------------

  if (notFound) {
    return (
      <Shell>
        <div className="mx-auto mt-20 max-w-sm rounded-2xl border-2 border-ink bg-white p-8 text-center shadow-doodle">
          <div><IconHole size={56} /></div>
          <h2 className="mt-3 font-display text-2xl">Room not found</h2>
          <p className="mt-2 text-ink/60">This doodle den doesn&apos;t exist (or evaporated).</p>
          <a href="/" className="btn-primary mt-5 inline-block">Make a new one</a>
        </div>
      </Shell>
    );
  }

  if (!playerId) {
    return (
      <JoinGate
        roomId={roomId}
        onJoined={(pid, s) => {
          savePlayerId(roomId, pid);
          setPlayerId(pid);
          applyState(s, false);
        }}
        onNotFound={() => setNotFound(true)}
      />
    );
  }

  if (!state || !me) {
    return (
      <Shell>
        <div className="mt-24 text-center font-display text-2xl text-ink/50 animate-pulse">
          Sharpening crayons… <IconCrayon size={26} />
        </div>
      </Shell>
    );
  }

  const serverNow = now + offsetRef.current;
  const timeLeft = Math.max(0, Math.ceil((state.phaseEndsAt - serverNow) / 1000));
  const drawer = state.players.find((p) => p.id === state.drawerId);
  const inGame = ["choosing", "drawing", "reveal"].includes(state.phase);
  const drawing = state.phase === "drawing";
  const smallRoom = state.players.length <= 4;
  const layout: "desktop" | "tl" | "tp" = !isTouch
    ? "desktop"
    : landscape
    ? "tl"
    : "tp";
  const showKeyboard = isTouch && !(isDrawer && drawing);

  const placeholder = isDrawer
    ? "chat with players who guessed…"
    : hasGuessed
    ? "you got it! chat with the smart club"
    : "type your guess…";

  function submitDraft() {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    sendChat(t);
  }

  const header = (
    <header className="flex shrink-0 items-center gap-2">
      <a href="/" className="shrink-0 text-base leading-none sm:text-2xl">
        <IconLogo size={22} /> <Wordmark />
      </a>
      {state.phase !== "lobby" && (
        <button
          onClick={copyLink}
          className="with-glyph min-w-0 rounded-xl border-2 border-ink bg-sun px-2.5 py-1 text-xs font-bold shadow-doodle transition-transform active:scale-95 sm:text-sm"
        >
          <span className="grid">
            <span
              className={`col-start-1 row-start-1 flex items-center justify-center gap-1.5 ${copied ? "invisible" : ""}`}
            >
              <span className="max-w-[42vw] truncate sm:max-w-none">{roomId}</span>
              <IconLink size={14} />
            </span>
            <span
              className={`col-start-1 row-start-1 flex items-center justify-center gap-1.5 ${copied ? "" : "invisible"}`}
            >
              Copied! <IconCheck size={15} />
            </span>
          </span>
        </button>
      )}
    </header>
  );

  if (!inGame) {
    return (
      <Shell>
        <div className="flex items-center gap-2">
          {header}
          <button
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            className="ml-auto shrink-0 rounded-xl border-2 border-ink/15 px-1.5 py-1"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <IconSoundOff size={20} /> : <IconSoundOn size={20} />}
          </button>
        </div>
        <div className="mt-2" />
        {state.phase === "lobby" && (
          <Lobby
            state={state}
            meId={playerId}
            isHost={isHost}
            roomId={roomId}
            onCopy={copyLink}
            onCopyName={copyName}
            copied={copied}
            copiedName={copiedName}
          />
        )}
        {state.phase === "gameover" && (
          <GameOver
            state={state}
            meId={playerId}
            isHost={isHost}
            gallery={gallery}
            roomId={roomId}
            onAgain={() => {
              setGallery([]);
              api(`/${roomId}`, { type: "again", playerId }).catch(() => {});
            }}
          />
        )}
      </Shell>
    );
  }

  // Only game-state panels may sit over the board — never chatter, and never
  // while there's a drawing to look at.
  const canvasOverlay =
    state.phase === "choosing" ? (
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink/40 backdrop-blur-[2px]">
        {isDrawer ? (
          <div className="mx-3 rounded-2xl border-2 border-ink bg-white p-3 text-center shadow-doodle">
            <div className="mb-2 font-display text-lg sm:text-xl">
              Pick a word ({timeLeft}s)
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(state.yourChoices ?? []).map((w, i) => {
                const tier = state.yourChoiceTiers?.[i] ?? "normal";
                const tierStyle =
                  tier === "easy"
                    ? "bg-green-100 text-green-800"
                    : tier === "chaos"
                    ? "bg-coral/15 text-coral"
                    : "bg-ink/5 text-ink/60";
                return (
                  <button
                    key={w}
                    onClick={() =>
                      api<{ state: ClientState }>(`/${roomId}`, {
                        type: "choose",
                        playerId,
                        index: i,
                      })
                        .then(({ state: s }) => applyState(s, false))
                        .catch(() => {})
                    }
                    className="flex flex-col items-center gap-1 rounded-xl border-2 border-ink bg-sun px-3 py-2 font-bold shadow-doodle transition-transform hover:-translate-y-0.5 active:scale-95"
                  >
                    <span>{w}</span>
                    <span
                      className={`rounded-full px-2 text-[10px] font-extrabold uppercase tracking-wide ${tierStyle}`}
                    >
                      {tier}
                    </span>
                  </button>
                );
              })}
              {!state.yourChoices && (
                <span className="animate-pulse">loading words…</span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-ink/45">
              Don&apos;t pick and you forfeit the turn!
            </p>
          </div>
        ) : (
          <div className="mx-3 rounded-2xl border-2 border-ink bg-white px-4 py-3 text-center font-display text-base shadow-doodle sm:text-xl">
            <PlayerAvatar token={drawer?.avatar ?? ""} size={24} />{" "}
            {drawer?.name} is picking a word
            <span className="animate-pulse">…</span>
          </div>
        )}
      </div>
    ) : null;

  const hintButton = drawing && !isDrawer && !hasGuessed && (
    <button
      onClick={() =>
        api<{ state: ClientState }>(`/${roomId}`, {
          type: "usehint",
          playerId,
        })
          .then(({ state: s }) => {
            applyState(s);
            sound("pop");
          })
          .catch((e) => addSystem((e as Error).message))
      }
      disabled={(state.yourHints ?? 0) < 1}
      title={
        (state.yourHints ?? 0) > 0
          ? "Reveal one extra letter (only you see it)"
          : `Guess ${5 - (state.yourHintProgress ?? 0)} more words to earn a hint`
      }
      className="with-glyph flex shrink-0 items-center gap-1 rounded-xl border-2 border-ink bg-sun px-2.5 py-1 text-sm font-bold shadow-doodle transition-transform active:scale-90 disabled:border-ink/15 disabled:bg-white disabled:opacity-60 disabled:shadow-none"
    >
      <IconHint size={16} />
      {(state.yourHints ?? 0) > 0 ? "Hint" : `${state.yourHintProgress ?? 0}/5`}
    </button>
  );

  // reveal scores + live guesses share one strip, always beside the board
  const feed =
    state.phase === "reveal" && state.lastTurn ? (
      <RevealPanel state={state} />
    ) : smallRoom ? (
      <GuessClouds messages={msgs} className="h-full" />
    ) : (
      <Chat
        messages={msgs}
        onSend={sendChat}
        disabled={false}
        placeholder={placeholder}
        hideInput={isTouch}
      />
    );

  return (
    <div className="dd-game dd-nosel mx-auto flex w-full max-w-6xl flex-col gap-1.5 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {header}
      <WordBar
        state={state}
        isDrawer={isDrawer}
        hasGuessed={hasGuessed}
        timeLeft={timeLeft}
        isHost={isHost}
        onSkip={skipTurnAsHost}
        offsetMs={offsetRef.current}
        muted={muted}
        onToggleMute={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
      />

      <main
        className={`flex min-h-0 flex-1 gap-2 ${
          layout === "tp" ? "flex-col" : "flex-row"
        }`}
      >
        {layout === "desktop" && (
          <div className="w-[190px] shrink-0 overflow-y-auto">
            <Players state={state} meId={playerId} onKick={kick} />
          </div>
        )}

        <section className="flex min-h-0 flex-1 flex-col gap-1.5">
          <Canvas
            ref={canvasRef}
            channel={channelRef.current}
            canDraw={isDrawer && drawing}
            overlay={canvasOverlay}
          />
        </section>

        <aside
          className={
            layout === "desktop"
              ? "flex min-h-0 w-[300px] shrink-0 flex-col gap-1.5"
              : layout === "tl"
              ? "flex min-h-0 w-[46%] max-w-[480px] shrink-0 flex-col gap-1.5"
              : "flex shrink-0 flex-col gap-1.5"
          }
        >
          {layout !== "desktop" && (
            <div className="shrink-0">
              <Players state={state} meId={playerId} variant="wrap" />
            </div>
          )}

          <div
            className={`flex min-h-0 items-end gap-1.5 ${
              layout === "tp" ? "h-[13dvh] min-h-[70px]" : "flex-1"
            }`}
          >
            {hintButton}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
              {feed}
            </div>
          </div>

          {showKeyboard ? (
            <div className="shrink-0">
              <VirtualKeyboard
                value={draft}
                onChange={setDraft}
                onSubmit={submitDraft}
                placeholder={placeholder}
                compact={layout === "tl"}
              />
            </div>
          ) : !isTouch && smallRoom ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitDraft();
              }}
              className="shrink-0 rounded-2xl border-2 border-ink bg-white p-2 shadow-doodle"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                maxLength={100}
                autoComplete="off"
                className="w-full rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              />
            </form>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

// --- sub components -------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-4">
      {children}
    </div>
  );
}

/** Gartic-style smooth draining time bar: rAF-driven, color shifts as time runs out. */
function TimeFill({
  endsAt,
  totalMs,
  offsetMs,
}: {
  endsAt: number;
  totalMs: number;
  offsetMs: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const left = endsAt - (Date.now() + offsetMs);
      const frac = Math.max(0, Math.min(1, left / totalMs));
      const el = ref.current;
      if (el) {
        el.style.width = `${frac * 100}%`;
        el.style.background =
          frac > 0.5
            ? "rgba(255, 217, 61, 0.45)"
            : frac > 0.22
            ? "rgba(245, 134, 44, 0.4)"
            : "rgba(255, 107, 107, 0.45)";
      }
      if (left > -1000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt, totalMs, offsetMs]);
  return <div ref={ref} className="absolute inset-y-0 left-0" />;
}

function WordBar({
  state,
  isDrawer,
  hasGuessed,
  timeLeft,
  isHost,
  onSkip,
  offsetMs,
  muted,
  onToggleMute,
}: {
  state: ClientState;
  isDrawer: boolean;
  hasGuessed: boolean;
  timeLeft: number;
  isHost: boolean;
  onSkip: () => void;
  offsetMs: number;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const total =
    state.phase === "drawing"
      ? state.settings.drawSeconds
      : state.phase === "choosing"
      ? 15
      : 6;
  const frac = Math.min(1, timeLeft / total);
  const urgent = state.phase === "drawing" && timeLeft <= 10;

  let content: React.ReactNode = null;
  if (state.phase === "drawing") {
    if (isDrawer || hasGuessed) {
      content = (
        <span className="font-display text-lg tracking-wide sm:text-2xl">
          {isDrawer ? (
            <><IconBrush size={22} /> Draw: </>
          ) : (
            <><IconCheck size={22} /> </>
          )}
          <span className="font-bold">{state.yourWord ?? "…"}</span>
        </span>
      );
    } else {
      content = (
        <span className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono text-lg font-bold tracking-[0.2em] sm:text-2xl">
            {(state.mask ?? "")
              .split("")
              .map((c) => (c === " " ? "\u00a0\u00a0" : c))
              .join("")}
          </span>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-bold tracking-normal text-ink/50">
            {state.wordLen.join("+")}
          </span>
        </span>
      );
    }
  } else if (state.phase === "reveal") {
    content = state.lastTurn?.skipped ? (
      <span className="font-display text-lg sm:text-2xl">
        Turn skipped — no word was picked
      </span>
    ) : (
      <span className="font-display text-lg sm:text-2xl">
        The word was <span className="font-bold text-coral">{state.lastTurn?.word}</span>
      </span>
    );
  } else {
    content = <span className="font-display text-lg sm:text-2xl">Get ready…</span>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-ink bg-white px-4 py-2.5 shadow-doodle">
      {(state.phase === "drawing" || state.phase === "choosing") && (
        <TimeFill
          endsAt={state.phaseEndsAt}
          totalMs={total * 1000}
          offsetMs={offsetMs}
        />
      )}
      <div className="relative flex items-center justify-between gap-2">
        {content}
        <span className="flex items-center gap-1.5">
          <button
            onClick={onToggleMute}
            className="rounded-lg border-2 border-ink/15 px-1 py-0.5 opacity-60 transition-opacity hover:opacity-100"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <IconSoundOff size={17} /> : <IconSoundOn size={17} />}
          </button>
          {isHost &&
            (state.phase === "drawing" || state.phase === "choosing") && (
              <button
                onClick={onSkip}
                title="Skip this turn (host)"
                className="rounded-lg border-2 border-ink/20 px-1.5 py-0.5 opacity-50 transition-opacity hover:opacity-100"
              >
                <IconSkip size={17} />
              </button>
            )}
          <span
            className={`flex flex-col items-center rounded-xl border-2 border-ink px-2 py-0.5 leading-none ${
              urgent ? "animate-pulse bg-coral text-white" : "bg-paper"
            }`}
          >
            {(state.phase === "drawing" || state.phase === "choosing") && (
              <span className="font-display text-lg tabular-nums">{timeLeft}</span>
            )}
            <span className="text-[10px] font-bold tabular-nums opacity-60">
              R{state.round}/{state.totalRounds}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function RevealPanel({ state }: { state: ClientState }) {
  const lt = state.lastTurn!;
  const entries = Object.entries(lt.deltas)
    .map(([pid, pts]) => ({
      p: state.players.find((x) => x.id === pid),
      pts,
    }))
    .filter((e) => e.p)
    .sort((a, b) => b.pts - a.pts);
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink/50 backdrop-blur-[2px]">
      <div className="mx-4 min-w-[240px] rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-doodle">
        <div className="text-sm text-ink/50">the word was</div>
        <div className="font-display text-3xl text-coral">{lt.word}</div>
        {lt.everyoneGuessed && (
          <div className="mt-1 text-sm font-bold text-green-700">
            Everybody got it!
          </div>
        )}
        <div className="mt-3 space-y-1 text-sm">
          {entries.map(({ p, pts }) => (
            <div key={p!.id} className="flex items-center justify-between gap-6">
              <span>
                <PlayerAvatar token={p!.avatar} size={20} /> {p!.name}
              </span>
              <span className={`font-bold tabular-nums ${pts > 0 ? "text-green-700" : "text-ink/40"}`}>
                +{pts}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Lobby({
  state,
  meId,
  isHost,
  roomId,
  onCopy,
  onCopyName,
  copied,
  copiedName,
}: {
  state: ClientState;
  meId: string;
  isHost: boolean;
  roomId: string;
  onCopy: () => void;
  onCopyName: () => void;
  copied: boolean;
  copiedName: boolean;
}) {
  const canStart = state.players.filter((p) => p.connected).length >= 2;
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeText, setThemeText] = useState("");
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeErr, setThemeErr] = useState("");

  async function applyTheme(text: string) {
    setThemeBusy(true);
    setThemeErr("");
    try {
      await api(`/${roomId}`, { type: "theme", playerId: meId, theme: text });
      if (!text) {
        setThemeOpen(false);
        setThemeText("");
      }
    } catch (e) {
      setThemeErr((e as Error).message);
    } finally {
      setThemeBusy(false);
    }
  }
  return (
    <div className="mx-auto mt-4 max-w-lg">
      <div className="rounded-2xl border-2 border-ink bg-white p-6 shadow-doodle">
        <h2 className="font-display text-2xl">The gang assembles…</h2>
        <p className="mt-1 text-sm text-ink/60">
          Send friends the link — they click, type a name, and they&apos;re in.
        </p>
        <div className="mt-3 rounded-xl bg-sun/35 px-3 py-2 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
            Your room
          </div>
          <div className="font-display text-lg font-bold leading-tight break-all">
            {roomId}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={onCopyName}
            className="with-glyph flex items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-sun px-3 py-2.5 font-display font-bold shadow-doodle transition-transform active:scale-95"
          >
            {copiedName ? (
              <>Copied! <IconCheck size={17} /></>
            ) : (
              <>Copy name</>
            )}
          </button>
          <button onClick={onCopy} className="btn-primary">
            {copied ? (
              <>Copied! <IconCheck size={17} /></>
            ) : (
              <>Copy link <IconLink size={17} /></>
            )}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {state.players.map((p) => (
            <span
              key={p.id}
              className={`flex items-center gap-1.5 rounded-xl border-2 border-ink/15 bg-paper px-3 py-1.5 font-bold ${
                !p.connected ? "opacity-40" : ""
              }`}
            >
              <PlayerAvatar token={p.avatar} size={26} /> {p.name}
              {p.isBot && (
                <span className="rounded bg-ink/10 px-1 text-[9px] font-extrabold tracking-wide text-ink/50">
                  BOT
                </span>
              )}
              {p.id === meId && <span className="font-normal text-ink/40">(you)</span>}
              {p.id === state.hostId && <IconCrown size={16} />}
              {p.isBot && isHost && (
                <button
                  aria-label={`Remove ${p.name}`}
                  onClick={() =>
                    api(`/${roomId}`, {
                      type: "removebot",
                      playerId: meId,
                      botId: p.id,
                    }).catch(() => {})
                  }
                  className="opacity-40 hover:opacity-100"
                >
                  <IconX size={12} />
                </button>
              )}
            </span>
          ))}
          {isHost && state.players.filter((p) => p.isBot).length < 3 && (
            <button
              onClick={() =>
                api(`/${roomId}`, { type: "addbot", playerId: meId }).catch(() => {})
              }
              className="rounded-xl border-2 border-dashed border-ink/30 px-3 py-1.5 text-sm font-bold text-ink/50 transition-colors hover:border-ink hover:text-ink"
            >
              + Add a bot
            </button>
          )}
        </div>

        {isHost ? (
          <>
            <div className="mt-5">
              <span className="text-sm font-bold">Difficulty</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "easy", label: "Easy", sub: "for kids" },
                    { key: "medium", label: "Medium", sub: "casual & fun" },
                    { key: "hard", label: "Hard", sub: "galaxy brain" },
                  ] as const
                ).map((d) => {
                  const active =
                    (state.settings.difficulty ?? "medium") === d.key;
                  return (
                    <button
                      key={d.key}
                      onClick={() =>
                        api(`/${roomId}`, {
                          type: "settings",
                          playerId: meId,
                          difficulty: d.key,
                        }).catch(() => {})
                      }
                      className={`rounded-xl border-2 px-2 py-2 text-center transition-all ${
                        active
                          ? "border-ink bg-sun shadow-doodle"
                          : "border-ink/15 bg-paper hover:border-ink/40"
                      }`}
                    >
                      <span className="block font-display font-bold leading-tight">
                        {d.label}
                      </span>
                      <span className="block text-[11px] text-ink/50">
                        {d.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <span className="text-sm font-bold">Rounds</span>
                <div className="mt-1 flex gap-1.5">
                  {[5, 10, 15].map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        api(`/${roomId}`, {
                          type: "settings",
                          playerId: meId,
                          rounds: n,
                        }).catch(() => {})
                      }
                      className={`flex-1 rounded-xl border-2 py-2 font-display font-bold transition-all ${
                        state.settings.rounds === n
                          ? "border-ink bg-sun shadow-doodle"
                          : "border-ink/15 bg-paper hover:border-ink/40"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-sm font-bold">Draw time</span>
                <div className="mt-1 flex gap-1.5">
                  {[45, 60, 75].map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        api(`/${roomId}`, {
                          type: "settings",
                          playerId: meId,
                          drawSeconds: n,
                        }).catch(() => {})
                      }
                      className={`flex-1 rounded-xl border-2 py-2 font-display font-bold transition-all ${
                        state.settings.drawSeconds === n
                          ? "border-ink bg-sun shadow-doodle"
                          : "border-ink/15 bg-paper hover:border-ink/40"
                      }`}
                    >
                      {n}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3">
              {state.theme ? (
                <div className="flex items-center justify-between rounded-xl border-2 border-ink/20 bg-sun/30 px-3 py-2 text-sm">
                  <span>
                    <b>Word theme:</b> {state.theme}
                  </span>
                  <button
                    onClick={() => applyTheme("")}
                    disabled={themeBusy}
                    className="font-bold text-ink/50 hover:text-ink"
                  >
                    clear
                  </button>
                </div>
              ) : !themeOpen ? (
                <button
                  onClick={() => setThemeOpen(true)}
                  className="text-xs font-bold text-ink/40 underline decoration-dotted hover:text-ink/70"
                >
                  Theme the words? (optional)
                </button>
              ) : (
                <div>
                  <div className="flex gap-2">
                    <input
                      value={themeText}
                      onChange={(e) => setThemeText(e.target.value)}
                      maxLength={60}
                      placeholder="e.g. cricket, 90s cartoons, cooking…"
                      className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                    />
                    <button
                      onClick={() => applyTheme(themeText)}
                      disabled={themeBusy || themeText.trim().length < 3}
                      className="rounded-xl border-2 border-ink bg-sun px-3 text-sm font-bold shadow-doodle disabled:opacity-40"
                    >
                      {themeBusy ? "Brewing…" : "Go"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-ink/40">
                    Generates themed words for this room. Family-friendly only —
                    rude themes get refused.
                  </p>
                  {themeErr && (
                    <p className="mt-1 text-xs text-coral">{themeErr}</p>
                  )}
                </div>
              )}
            </div>
            <button
              disabled={!canStart}
              onClick={() =>
                api(`/${roomId}`, { type: "start", playerId: meId }).catch(() => {})
              }
              className="btn-primary mt-4 w-full disabled:opacity-40"
            >
              {canStart ? (
                <>Start the disaster! <IconRocket size={18} /></>
              ) : (
                "Waiting for at least 2 players…"
              )}
            </button>
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-sm text-ink/50">
              {state.settings.rounds} round{state.settings.rounds > 1 ? "s" : ""} ·{" "}
              {state.settings.drawSeconds}s draws ·{" "}
              <span className="capitalize">{state.settings.difficulty ?? "medium"}</span>{" "}
              difficulty
              {state.theme ? <> · themed: “{state.theme}”</> : null}
            </p>
            <p className="mt-3 animate-pulse text-center font-display text-lg text-ink/50">
              Waiting for the host to hit start…
            </p>
          </>
        )}
        <InstallTip />
      </div>
    </div>
  );
}

function GameOver({
  state,
  meId,
  isHost,
  gallery,
  roomId,
  onAgain,
}: {
  state: ClientState;
  meId: string;
  isHost: boolean;
  gallery: GalleryItem[];
  roomId: string;
  onAgain: () => void;
}) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const mostLoved = [...gallery].sort((a, b) => b.reactions - a.reactions)[0];
  return (
    <div className="mx-auto mt-4 max-w-3xl">
      <Confetti />
      <div className="rounded-2xl border-2 border-ink bg-white p-6 text-center shadow-doodle">
        <h2 className="font-display text-3xl">
          <IconFlag size={28} /> Final scores
        </h2>
        <div className="mx-auto mt-4 max-w-sm space-y-2">
          {ranked.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl border-2 px-4 py-2 ${
                i === 0 ? "border-ink bg-sun/50" : "border-ink/10 bg-paper"
              }`}
            >
              <span className="flex items-center gap-1.5 font-bold">
                {i < 3 ? (
                  <IconMedal rank={(i + 1) as 1 | 2 | 3} size={22} />
                ) : (
                  `${i + 1}.`
                )}
                <PlayerAvatar token={p.avatar} size={24} /> {p.name}
                {p.id === meId && <span className="font-normal text-ink/40"> (you)</span>}
              </span>
              <span className="font-display text-xl tabular-nums">{p.score}</span>
            </div>
          ))}
        </div>
        {isHost ? (
          <button onClick={onAgain} className="btn-primary mt-5">
            Play again <IconReplay size={18} />
          </button>
        ) : (
          <p className="mt-5 animate-pulse text-ink/50">
            Waiting for the host to restart…
          </p>
        )}
      </div>

      {gallery.length > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-ink bg-white p-6 shadow-doodle">
          <h3 className="text-center font-display text-2xl">
            <IconGallery size={26} /> Tonight&apos;s masterpieces
          </h3>
          {mostLoved && mostLoved.reactions > 0 && (
            <p className="mt-1 text-center text-sm text-ink/60">
              Crowd favorite: <b>“{mostLoved.word}”</b> by{" "}
              <PlayerAvatar token={mostLoved.drawerAvatar} size={18} />{" "}
              {mostLoved.drawerName} ({mostLoved.reactions}{" "}
              <IconHeart size={14} />)
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((g, i) => (
              <figure key={i} className="rounded-xl border-2 border-ink/15 bg-paper p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.dataUrl}
                  alt={g.word}
                  className="w-full rounded-lg border border-ink/10 bg-white"
                />
                <figcaption className="mt-1 text-center text-xs">
                  <b>“{g.word}”</b> —{" "}
                  <PlayerAvatar token={g.drawerAvatar} size={15} /> {g.drawerName}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const g = c.getContext("2d")!;
    const colors = ["#FF6B6B", "#f7c948", "#4caf50", "#53c2f0", "#8e44ad", "#f06292"];
    const parts = Array.from({ length: 120 }, () => ({
      x: Math.random() * c.width,
      y: -20 - Math.random() * c.height * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      vr: -0.1 + Math.random() * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    let raf = 0;
    const draw = () => {
      frame++;
      g.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (frame < 400) raf = requestAnimationFrame(draw);
      else g.clearRect(0, 0, c.width, c.height);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
    />
  );
}

function JoinGate({
  roomId,
  onJoined,
  onNotFound,
}: {
  roomId: string;
  onJoined: (playerId: string, state: ClientState) => void;
  onNotFound: () => void;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("a0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(getSavedName());
    setAvatar(getSavedAvatar());
  }, []);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ playerId: string; state: ClientState }>(
        `/${roomId}`,
        { type: "join", name: n, avatar }
      );
      saveName(n);
      saveAvatar(avatar);
      onJoined(res.playerId, res.state);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) onNotFound();
      else setError(msg);
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto mt-16 max-w-sm">
        <div className="rounded-2xl border-2 border-ink bg-white p-8 text-center shadow-doodle">
          <div><IconLogo size={56} /></div>
          <h1 className="mt-2 text-3xl">
            <Wordmark />
          </h1>
          <p className="mt-1 text-ink/60">
            You&apos;re joining <b>{roomId}</b>
          </p>
          <form onSubmit={join} className="mt-5">
            <div className="mb-3 flex justify-center">
              <AvatarPicker
                value={avatar}
                onChange={(t) => {
                  setAvatar(t);
                  saveAvatar(t);
                }}
              />
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What do your friends call you?"
              maxLength={20}
              className="w-full rounded-xl border-2 border-ink/20 bg-paper px-4 py-3 text-center text-lg font-bold outline-none focus:border-ink"
            />
            <button
              disabled={!name.trim() || busy}
              className="btn-primary mt-3 w-full disabled:opacity-40"
            >
              {busy ? (
                "Squeezing in…"
              ) : (
                <>Jump in! <IconParty size={18} /></>
              )}
            </button>
            {error && <p className="mt-2 text-sm text-coral">{error}</p>}
          </form>
          <p className="mt-4 text-xs text-ink/40">
            Draw the word · guess fast for points · never write letters!
          </p>
        </div>
      </div>
    </Shell>
  );
}
