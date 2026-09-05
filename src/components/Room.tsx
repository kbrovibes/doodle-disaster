"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import Canvas, { CanvasHandle, Op } from "./Canvas";
import Chat from "./Chat";
import Players from "./Players";
import AvatarPicker from "./AvatarPicker";
import VirtualKeyboard from "./VirtualKeyboard";
import GuessClouds from "./GuessClouds";
import Ticker from "./Ticker";
import InstallTip from "./InstallTip";
import { recordGame, touchGame } from "@/lib/games";
import { syncRing } from "@/lib/played";
import { saveArchive } from "@/lib/archive";
import { THEMES, themeWords } from "@/lib/wordbank/themes";
import { roomCode } from "@/lib/names";
import { useEdgeSwipeGuard } from "@/lib/edgeguard";
import {
  sh,
  useShellMetrics,
  readKeyboardMode,
  writeKeyboardMode,
  type KeyboardMode,
} from "@/lib/shell";
import {
  api,
  haptic,
  getPlayerId,
  getSavedAvatar,
  getSavedName,
  mergeMasks,
  saveAvatar,
  roomChannel,
  saveName,
  savePlayerId,
} from "@/lib/client";
import { ChatMsg, ClientState, StrokeMsg } from "@/lib/types";
import type { PlanItem, PlanStroke } from "@/lib/botdraw";
import {
  IconBrush,
  IconPen,
  IconCheck,
  IconCrayon,
  IconCrown,
  IconFlag,
  IconGallery,
  IconGear,
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
  useEdgeSwipeGuard();
  const kbOpen = useShellMetrics();
  const [kbMode, setKbMode] = useState<KeyboardMode>("device");
  useEffect(() => setKbMode(readKeyboardMode()), []);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<ClientState | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [draft, setDraft] = useState("");
  const [isTouch, setIsTouch] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [lastShot, setLastShot] = useState<string | null>(null);
  const [shots, setShots] = useState<
    { turn: number; word: string; drawerId: string; image: string }[] | null
  >(null);
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

  const me = state?.players.find((p) => p.id === playerId);

  // keep the local "my games" registry in step with reality
  useEffect(() => {
    if (!state || !playerId || !me) return;
    recordGame({
      roomId,
      playerId,
      name: me.name,
      avatar: me.avatar,
      finished: state.phase === "gameover",
    });
  }, [roomId, playerId, me?.name, me?.avatar, state?.phase]);
  const isDrawer = !!state && state.drawerId === playerId;
  // giver mode: one player sets the word for the drawer and sits the turn out.
  // Null giverId means the classic game, whatever the setting says — the
  // server decides per turn, since bots and thin rooms fall back to the bank.
  const isGiver = !!state && !!state.giverId && state.giverId === playerId;
  const giver = state?.players.find((p) => p.id === state.giverId);
  const hasGuessed = !!state && !!playerId && state.guessedIds.includes(playerId);
  const isHost = !!state && state.hostId === playerId;

  const applyState = useCallback((s: ClientState, keepPrivate = true) => {
    offsetRef.current = s.serverNow ? s.serverNow - Date.now() : offsetRef.current;
    // every device adopts the room's ring, so whoever makes the NEXT room
    // carries on from here rather than restarting the deck
    syncRing(s.wordSalt, s.wordCursor);
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
        prev.drawerId === s.drawerId &&
        prev.giverId === s.giverId
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

  /** Guesses from rivals are a free clue — hide them until you've solved it. */
  const canSeeGuess = useCallback((fromId: string) => {
    const st = stateRef.current;
    const pid = playerIdRef.current;
    if (!st || !pid) return true;
    if (fromId === pid) return true;
    const stillGuessing =
      st.phase === "drawing" &&
      st.drawerId !== pid &&
      !st.guessedIds.includes(pid);
    return !stillGuessing;
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
        if (!canSeeGuess(m.from)) return;
        addMsg(m);
      });
      ch.on("broadcast", { event: "correct" }, ({ payload }) => {
        const m = payload as { name: string; avatar: string; from: string };
        if (announced.current.has(m.from)) return;
        announced.current.add(m.from);
        addMsg({ ...m, text: "", kind: "correct" });
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
        }, 30000);
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

  // --- bot driver -----------------------------------------------------------
  // The host's client runs the bots. This is deliberately LEVEL-triggered (a
  // poll) rather than edge-triggered off a phase change: if a single state
  // transition is ever missed, an edge-triggered effect leaves a bot idle for
  // an entire turn — which is exactly how bots ended up drawing nothing.
  const botRun = useRef({
    key: "",
    cancelled: true,
    timers: [] as ReturnType<typeof setTimeout>[],
  });
  const botChose = useRef("");
  const botForced = useRef("");
  const botRedrew = useRef("");

  const performStroke = useCallback((item: PlanStroke, ctl: { cancelled: boolean }) => {
    const sid = Math.random().toString(36).slice(2, 9);
    const n = item.pts.length / 2;
    if (n < 1) return;
    const started = performance.now();
    let sent = 0;
    let pending: number[] = [];
    let lastFlush = started;
    const step = () => {
      if (ctl.cancelled) return;
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
    if (!playerId) return;

    const begin = (key: string) => {
      botRun.current.cancelled = true;
      botRun.current.timers.forEach(clearTimeout);
      botRun.current = { key, cancelled: false, timers: [] };
      return botRun.current;
    };

    const scheduleDrawing = async (ctl: typeof botRun.current) => {
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
                if (!ctl.cancelled) performStroke(item, ctl);
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
    };

    const scheduleGuesses = (ctl: typeof botRun.current, drawerId: string | null) => {
      const st = stateRef.current;
      if (!st) return;
      const bots = st.players.filter((p) => p.isBot && p.id !== drawerId);
      bots.forEach((bot, bi) => {
        for (let attempt = 1; attempt <= 6; attempt++) {
          const delay =
            6000 + bi * 2500 + (attempt - 1) * (6500 + Math.random() * 3500);
          ctl.timers.push(
            setTimeout(async () => {
              if (ctl.cancelled) return;
              const cur = stateRef.current;
              if (!cur || cur.phase !== "drawing") return;
              if (cur.guessedIds.includes(bot.id)) return;
              // never guess at a blank board
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
                if (!guess || ctl.cancelled) return;
                const payload = {
                  from: bot.id,
                  name: bot.name,
                  avatar: bot.avatar,
                };
                if (result === "correct") {
                  announced.current.add(bot.id);
                  addMsg({ ...payload, text: "", kind: "correct" });
                  channelRef.current?.send({
                    type: "broadcast",
                    event: "correct",
                    payload,
                  });
                } else if (result === "wrong" || result === "close") {
                  if (canSeeGuess(bot.id))
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
    };

    const tick = () => {
      const st = stateRef.current;
      if (!st || st.hostId !== playerId) return;
      if (!st.players.some((p) => p.isBot)) return;
      const key = `${st.phase}:${st.round}:${st.turnIndex}`;
      const fresh = botRun.current.key !== key;
      const drawer = st.players.find((p) => p.id === st.drawerId);
      const msLeft = st.phaseEndsAt - (Date.now() + offsetRef.current);

      if (st.phase === "choosing") {
        const ctl = fresh ? begin(key) : botRun.current;
        if (!drawer?.isBot) return;
        const pick = () =>
          api(`/${roomId}`, { type: "botchoose", playerId }).catch(() => {
            botChose.current = ""; // request died — let the next tick retry
          });
        if (botChose.current !== key) {
          botChose.current = key;
          ctl.timers.push(
            setTimeout(() => {
              if (!ctl.cancelled) pick();
            }, 1200 + Math.random() * 2000)
          );
        } else if (msLeft < 5000 && botForced.current !== key) {
          // last chance: a bot must never forfeit its own turn
          botForced.current = key;
          pick();
        }
        return;
      }

      if (st.phase === "drawing") {
        if (fresh) {
          const ctl = begin(key);
          if (drawer?.isBot) scheduleDrawing(ctl);
          scheduleGuesses(ctl, st.drawerId);
          return;
        }
        // safety net: bot turn with a blank board well past the start means
        // the plan never arrived — fetch it again rather than waste the turn
        const total = st.settings.drawSeconds * 1000;
        if (
          drawer?.isBot &&
          botRedrew.current !== key &&
          total - msLeft > 9000 &&
          (canvasRef.current?.inkFraction() ?? 0) < 0.002
        ) {
          botRedrew.current = key;
          scheduleDrawing(botRun.current);
        }
        return;
      }

      if (fresh) begin(key); // reveal / lobby / gameover: stand everything down
    };

    const iv = setInterval(tick, 600);
    return () => {
      clearInterval(iv);
      botRun.current.cancelled = true;
      botRun.current.timers.forEach(clearTimeout);
    };
  }, [playerId, roomId, addMsg, canSeeGuess, performStroke]);

  // the shared gallery: fetched at game over so late joiners and refreshed
  // tabs see every drawing, not just the ones made while they watched. The
  // same fetch fills this device's scrapbook, so the game can be reopened
  // later without hitting the server again.
  useEffect(() => {
    if (state?.phase !== "gameover") return;
    let live = true;
    fetch(`/api/rooms/${roomId}/shots`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        const list = (j.shots ?? []) as {
          turn: number;
          word: string;
          drawerId: string;
          image: string;
        }[];
        setShots(list);
        const st = stateRef.current;
        if (!st) return;
        const nameOf = (id: string) =>
          st.players.find((p) => p.id === id)?.name ?? "someone";
        saveArchive({
          roomId,
          endedAt: Date.now(),
          rounds: st.totalRounds,
          scores: [...st.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => ({ name: p.name, avatar: p.avatar, score: p.score })),
          shots: list.map((sh) => ({
            turn: sh.turn,
            word: sh.word,
            drawerName: nameOf(sh.drawerId),
            image: sh.image,
          })),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [state?.phase, roomId]);

  /**
   * "X got it!" used to rely on the guessing player's own browser shouting it
   * over the channel — so a backgrounded phone, or a bot driven server-side,
   * left everyone else in the dark. Now it is derived from guessedIds, which
   * the SERVER broadcasts, with a per-turn set so the peer message and this
   * can never both announce the same solve.
   */
  const announced = useRef(new Set<string>());
  const turnKey = state ? `${state.round}:${state.turnIndex}` : "";
  const announcedTurn = useRef("");
  useEffect(() => {
    if (!state) return;
    if (announcedTurn.current !== turnKey) {
      announcedTurn.current = turnKey;
      announced.current = new Set();
      return; // don't replay whoever had already solved when we arrived
    }
    for (const id of state.guessedIds) {
      if (announced.current.has(id)) continue;
      announced.current.add(id);
      const p = state.players.find((x) => x.id === id);
      if (!p) continue;
      addMsg({ from: p.id, name: p.name, avatar: p.avatar, text: "", kind: "correct" });
    }
  }, [state, turnKey, addMsg]);

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

  // The countdown only ever renders whole seconds (the smooth timer bar drives
  // itself off rAF), so re-rendering this whole screen 4x a second was pure
  // waste — and it was the main thread that key presses had to queue behind.
  useEffect(() => {
    let t = 0;
    const beat = () => {
      setNow(Date.now());
      // land on the next second boundary so the number never skips
      t = window.setTimeout(beat, 1000 - (Date.now() % 1000) + 8);
    };
    beat();
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
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
        }
      }

      const myIdx = Math.max(0, st.players.findIndex((p) => p.id === pid));
      // a skipped turn has nothing to show — hurry it along
      const skipping = st.phase === "reveal" && st.lastTurn?.skipped;
      const myDelay = (skipping ? 120 : 400) + myIdx * (skipping ? 180 : 500);
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
      if (state.drawerId === playerId && !state.yourChoices) {
        api<{ state: ClientState }>(`/${roomId}?playerId=${playerId}`)
          .then(({ state: s }) => applyState(s, false))
          .catch(() => {});
      }
    }

    if (state.phase === "drawing") {
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
      setLastShot(snap ?? null);
      const lt = state.lastTurn;
      // one player uploads it so every device shows the same gallery later
      const artist = state.players.find((p) => p.id === lt?.drawerId);
      const iUpload =
        !!lt && !lt.skipped &&
        (lt.drawerId === playerId || (artist?.isBot && state.hostId === playerId));
      if (iUpload) {
        const small = canvasRef.current?.snapshotSmall();
        if (small)
          api(`/${roomId}`, { type: "shot", playerId, image: small }).catch(
            () => {}
          );
      }
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
    }
    if (state.phase === "lobby" && prevKey && !prevKey.startsWith("lobby")) {
      canvasRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.turnIndex, state?.yourChoices]);

  // --- actions ------------------------------------------------------------

  // stable identity on purpose: the virtual keyboard is memoised, and a fresh
  // function every render would defeat that and re-render 40 keys per tick
  const sendChat = useCallback(
    async (text: string) => {
      const st = stateRef.current;
      const pid = playerIdRef.current;
      if (!st || !pid) return;
      const meNow = st.players.find((p) => p.id === pid);
      if (!meNow) return;
      const base = { from: pid, name: meNow.name, avatar: meNow.avatar };
      const amDrawer = st.drawerId === pid;
      // the giver wrote the word, so nothing they type can be a guess — but it
      // is deliberately NOT a whisper either: half the fun of giving a word is
      // heckling the room out loud while they flounder
      const amGiver = !!st.giverId && st.giverId === pid;
      const solved = st.guessedIds.includes(pid);

      if (st.phase === "drawing" && !amDrawer && !amGiver && !solved) {
        addMsg({ ...base, text, kind: "guess" });
        try {
          const { result, state: s } = await api<{
            result: string;
            state: ClientState;
          }>(`/${roomId}`, { type: "guess", playerId: pid, text });
          if (result === "correct") {
            // claim the dedupe slot BEFORE the new state lands, or the
            // guessedIds-derived announcement fires too and you see your own
            // "You got it!" twice
            announced.current.add(pid);
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

      // drawer / players who already solved it / the giver / lobby chatter.
      // Only the first two are hushed: their chatter is shown to people who
      // already know the word, so a stray "nearly!" can't hand it over.
      const guessedOnly = st.phase === "drawing" && (amDrawer || solved);
      addMsg({ ...base, text, kind: guessedOnly ? "whisper" : "guess" });
      channelRef.current?.send({
        type: "broadcast",
        event: "chat",
        payload: { ...base, text, kind: "guess", guessedOnly },
      });
    },
    [roomId, addMsg, addSystem, applyState]
  );

  /**
   * Settings used to feel broken: every button fired the request and threw the
   * response away, so the host's own UI only caught up when the next state
   * broadcast landed — and the server awaits a Supabase broadcast before it
   * even replies. Now the change paints immediately and the authoritative
   * state just confirms it.
   */
  function patchSettings(patch: Record<string, unknown>) {
    setState((prev) =>
      prev
        ? {
            ...prev,
            settings: { ...prev.settings, ...(patch as object) },
            ...("themePacks" in patch
              ? { themePacks: patch.themePacks as string[] | null }
              : {}),
          }
        : prev
    );
    haptic(8);
    api<{ state: ClientState }>(`/${roomId}`, {
      type: "settings",
      playerId,
      ...patch,
    })
      .then(({ state: s }) => applyState(s, false))
      .catch(() => refresh());
  }

  /** pull the truth back after a failed optimistic change */
  function refresh() {
    api<{ state: ClientState }>(`/${roomId}?playerId=${playerId}`)
      .then(({ state: s }) => applyState(s, false))
      .catch(() => {});
  }

  function kick(targetId: string, name: string) {
    api(`/${roomId}`, { type: "kick", playerId, targetId })
      .then(() => addSystem(`${name} was removed from the room`))
      .catch(() => {});
  }

  function passTurn() {
    api(`/${roomId}`, { type: "pass", playerId }).catch(() => {});
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
          <h2 className="mt-3 font-display text-xl">Room not found</h2>
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
        <div className="mt-24 text-center font-display text-xl text-ink/50 animate-pulse">
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
  const canType = isTouch && !(isDrawer && drawing);
  const showKeyboard = canType && kbMode === "app";
  const showNativeBar = canType && kbMode === "device";

  const placeholder =
    isDrawer || isGiver || hasGuessed ? "say something…" : "type your guess…";

  function submitDraft() {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    sendChat(t);
  }

  const header = (
    <header className="flex shrink-0 items-center gap-2">
      <a
        href="/"
        className="shrink-0 leading-none"
        style={{ fontSize: `clamp(20px, ${sh(3.6)}, 36px)` }}
      >
        <IconLogo size={26} /> <Wordmark />
      </a>
      {state.phase !== "lobby" && (
        <button
          onClick={copyLink}
          className="with-glyph ml-auto min-w-0 rounded-xl border-2 border-ink bg-sun px-2.5 py-1 text-[11px] font-bold shadow-doodle transition-transform active:scale-95 sm:text-xs"
        >
          <span className="grid">
            <span
              className={`col-start-1 row-start-1 flex items-center justify-center gap-1.5 ${copied ? "invisible" : ""}`}
            >
              <span className="max-w-[42vw] truncate tracking-widest sm:max-w-none">{roomCode(roomId)}</span>
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
        {header}
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
            onSettings={patchSettings}
          />
        )}
        {state.phase === "gameover" && (
          <GameOver
            state={state}
            meId={playerId}
            isHost={isHost}
            gallery={
              shots && shots.length > 0
                ? shots.map((sh) => {
                    const d = state.players.find((p) => p.id === sh.drawerId);
                    return {
                      word: sh.word,
                      drawerName: d?.name ?? "?",
                      drawerAvatar: d?.avatar ?? "a0",
                      dataUrl: sh.image,
                      reactions: 0,
                    };
                  })
                : gallery
            }
            roomId={roomId}
            onAgain={() => {
              setGallery([]);
              setShots(null);
              api(`/${roomId}`, { type: "again", playerId }).catch(() => {});
            }}
          />
        )}
      </Shell>
    );
  }

  // Only game-state panels may sit over the board — never chatter, and never
  // while there's a drawing to look at.
  const canvasOverlay = state.waiting ? (
    <div className="dd-frost absolute inset-0 flex items-center justify-center rounded-2xl p-3">
      <div className="rounded-2xl border-2 border-ink bg-white px-5 py-4 text-center shadow-doodle">
        <div className="font-display text-base sm:text-lg">
          Waiting for players to come back…
        </div>
        <div className="mt-1 text-xs text-ink/55">
          The game is paused, nothing is lost.
        </div>
        {isHost && (
          <button
            onClick={() =>
              api(`/${roomId}`, { type: "endgame", playerId }).catch(() => {})
            }
            className="btn-primary mt-3 text-xs"
          >
            End the game
          </button>
        )}
      </div>
    </div>
  ) : state.phase === "reveal" && state.lastTurn ? (
      <RevealPhoto state={state} shot={lastShot} />
    ) : state.phase === "choosing" ? (
      <div className="dd-frost absolute inset-0 flex items-center justify-center rounded-2xl">
        {isGiver ? (
          <GiveWord
            choices={state.yourChoices}
            tiers={state.yourChoiceTiers}
            drawerName={drawer?.name ?? "the drawer"}
            drawerAvatar={drawer?.avatar ?? ""}
            timeLeft={timeLeft}
            onSend={(body) =>
              api<{ state: ClientState }>(`/${roomId}`, {
                playerId,
                ...body,
              }).then(({ state: s }) => applyState(s, false))
            }
          />
        ) : state.giverId ? (
          <div className="mx-3 rounded-2xl border-2 border-ink bg-white px-4 py-3 text-center font-display text-sm shadow-doodle sm:text-lg">
            <PlayerAvatar token={giver?.avatar ?? ""} size={24} />{" "}
            {giver?.name} is thinking of a word
            {isDrawer ? " for you" : ` for ${drawer?.name}`}
            <span className="animate-pulse">…</span>
          </div>
        ) : isDrawer ? (
          <div className="mx-3 rounded-2xl border-2 border-ink bg-white p-3 text-center shadow-doodle">
            <div className="mb-2 font-display text-base sm:text-lg">
              Pick a word ({timeLeft}s)
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {(state.yourChoices ?? []).map((w, i) => {
                const tier = state.yourChoiceTiers?.[i] ?? "normal";
                const tierStyle =
                  tier === "kids"
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
            <button
              onClick={passTurn}
              className="mt-2 text-[11px] font-bold text-ink/45 underline decoration-dotted hover:text-ink"
            >
              none of these — pass my turn
            </button>
          </div>
        ) : (
          <div className="mx-3 rounded-2xl border-2 border-ink bg-white px-4 py-3 text-center font-display text-sm shadow-doodle sm:text-lg">
            <PlayerAvatar token={drawer?.avatar ?? ""} size={24} />{" "}
            {drawer?.name} is picking a word
            <span className="animate-pulse">…</span>
          </div>
        )}
      </div>
    ) : null;

  const settingsButton = isHost && (
    <div className="shrink-0">
      <button
        onClick={() => setSettingsOpen((v) => !v)}
        title="Game settings"
        className="flex items-center gap-1 rounded-lg border-2 border-dashed border-ink/30 px-2 py-1 text-[11px] font-bold text-ink/60 transition-colors hover:border-ink hover:text-ink"
      >
        <IconGear size={13} /> setup
      </button>
      {settingsOpen && (
        <>
          {/* fixed, not absolute: this used to be nested inside a horizontally
              scrolling roster row, and an overflow ancestor clips absolutely
              positioned children — so on a phone the panel (and the end-game
              button inside it) simply could not be seen */}
          <div
            className="fixed inset-0 z-40 bg-ink/20"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(88vw,300px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-ink/15 bg-white p-3 shadow-doodle">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-base font-bold">Game setup</span>
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg px-2 py-0.5 text-xs font-bold text-ink/45"
              >
                done
              </button>
            </div>
          <div className="text-[11px] font-bold text-ink/50">
            Draw time (next turn)
          </div>
          <div className="mt-1 flex gap-1">
            {[60, 75, 120].map((n) => (
              <button
                key={n}
                onClick={() => patchSettings({ drawSeconds: n })}
                className={`flex-1 rounded-lg border-2 py-1 text-[11px] font-bold ${
                  state.settings.drawSeconds === n
                    ? "border-ink bg-sun"
                    : "border-ink/15 bg-paper"
                }`}
              >
                {n}s
              </button>
            ))}
          </div>
          <div className="mt-2 border-t-2 border-dashed border-ink/15 pt-2">
            {endConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEndConfirm(false);
                    setSettingsOpen(false);
                    api<{ state: ClientState }>(`/${roomId}`, {
                      type: "endgame",
                      playerId,
                    })
                      .then(({ state: s }) => applyState(s, false))
                      .catch(() => {});
                  }}
                  className="flex-1 rounded-lg border-2 border-ink bg-coral py-1 text-[11px] font-bold text-white"
                >
                  End it — show scores
                </button>
                <button
                  onClick={() => setEndConfirm(false)}
                  className="rounded-lg px-2 py-1 text-[11px] font-bold text-ink/45"
                >
                  no
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEndConfirm(true)}
                className="w-full rounded-lg border-2 border-dashed border-ink/25 py-1 text-[11px] font-bold text-ink/50 hover:border-ink hover:text-ink"
              >
                🏁 End the game now
              </button>
            )}
          </div>

          <div className="mt-2 text-[11px] font-bold text-ink/50">
            Words come from (next turn)
          </div>
          <div className="mt-1 flex gap-1">
            {(
              [
                { key: "bank", label: "the bank" },
                { key: "giver", label: "a player" },
              ] as const
            ).map((o) => (
              <button
                key={o.key}
                onClick={() => patchSettings({ wordSource: o.key })}
                className={`flex-1 rounded-lg border-2 py-1 text-[11px] font-bold ${
                  (state.settings.wordSource ?? "bank") === o.key
                    ? "border-ink bg-sun"
                    : "border-ink/15 bg-paper"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="mt-2 text-[11px] font-bold text-ink/50">Rounds</div>
          <div className="mt-1 flex gap-1">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => patchSettings({ rounds: n })}
                className={`flex-1 rounded-lg border-2 py-1 text-[11px] font-bold ${
                  state.settings.rounds === n
                    ? "border-ink bg-sun"
                    : "border-ink/15 bg-paper"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          </div>
        </>
      )}
    </div>
  );

  const addBotButton = isHost &&
    state.players.filter((p) => p.isBot).length < 3 && (
      <button
        onClick={() =>
          api(`/${roomId}`, { type: "addbot", playerId }).catch(() => {})
        }
        className="shrink-0 rounded-lg border-2 border-dashed border-ink/30 px-1.5 py-1 text-[11px] font-bold text-ink/50 transition-colors hover:border-ink hover:text-ink"
      >
        +bot
      </button>
    );

  // during the reveal, everything but the photo steps out of the way
  // (kept in the layout with `invisible` so the board doesn't resize)
  const chrome = state.phase === "reveal" ? "invisible" : "";

  const hintButton = drawing && !isDrawer && !isGiver && !hasGuessed && (
    <button
      onClick={() =>
        api<{ state: ClientState }>(`/${roomId}`, {
          type: "usehint",
          playerId,
        })
          .then(({ state: s }) => {
            applyState(s);
          })
          .catch((e) => addSystem((e as Error).message))
      }
      disabled={(state.yourHints ?? 0) < 1}
      title={
        (state.yourHints ?? 0) > 0
          ? "Reveal one extra letter (only you see it)"
          : `Guess ${5 - (state.yourHintProgress ?? 0)} more words to earn a hint`
      }
      className="with-glyph flex shrink-0 items-center gap-1 rounded-xl border-2 border-ink bg-sun px-2.5 py-1 text-xs font-bold shadow-doodle transition-transform active:scale-90 disabled:border-ink/15 disabled:bg-white disabled:opacity-60 disabled:shadow-none"
    >
      <IconHint size={16} />
      {(state.yourHints ?? 0) > 0 ? "Hint" : `${state.yourHintProgress ?? 0}/5`}
    </button>
  );

  const useDeviceKeyboard = () => {
    setKbMode("device");
    writeKeyboardMode("device");
  };

  const kbToggle = isTouch && (
    <button
      onClick={() => {
        const m: KeyboardMode = kbMode === "app" ? "device" : "app";
        setKbMode(m);
        writeKeyboardMode(m);
      }}
      title={
        kbMode === "app"
          ? "Use your phone's own keyboard"
          : "Use the in-app keyboard"
      }
      className="shrink-0 rounded-lg border-2 border-dashed border-ink/30 px-1.5 py-1 text-[11px] font-bold text-ink/50 transition-colors hover:border-ink hover:text-ink"
    >
      {kbMode === "app" ? "⌨" : "⌨⁺"}
    </button>
  );

  // reveal scores + live guesses share one strip, always beside the board
  const feed = smallRoom ? (
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

  if (layout === "desktop") {
    // Desktop: the board is the point. Only one narrow rail (roster + guesses)
    // and, in bigger rooms, a chat column — everything else goes to the canvas,
    // with the typing box directly under the board where your eyes already are.
    return (
      <div className="dd-game dd-nosel mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-3 py-2">
        {header}
        <WordBar
          state={state}
          isDrawer={isDrawer}
          isGiver={isGiver}
          hasGuessed={hasGuessed}
          timeLeft={timeLeft}
          isHost={isHost}
          onSkip={skipTurnAsHost}
          onPass={passTurn}
          offsetMs={offsetRef.current}
        />
        <main className="flex min-h-0 flex-1 gap-3">
          <div className={`flex min-h-0 w-[190px] shrink-0 flex-col gap-2 ${chrome}`}>
            <div className="shrink-0 overflow-y-auto">
              <Players state={state} meId={playerId} onKick={kick} />
              {isHost && (
                <div className="mt-1.5 flex items-center gap-1">
                  {addBotButton}
                  {settingsButton}
                </div>
              )}
            </div>
            {smallRoom && (
              <GuessClouds messages={msgs} className="min-h-0 flex-1" />
            )}
          </div>

          <section className="flex min-h-0 flex-1 flex-col items-center gap-2">
            <div className="flex min-h-0 w-full flex-1">
              <Canvas
                ref={canvasRef}
                channel={channelRef.current}
                canDraw={isDrawer && drawing}
                overlay={canvasOverlay}
              />
            </div>
            <div className="flex w-full max-w-[620px] shrink-0 items-center gap-2">
              {hintButton}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitDraft();
                }}
                className="flex-1"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={placeholder}
                  maxLength={100}
                  autoComplete="off"
                  className="w-full rounded-xl border-2 border-ink/20 bg-white px-3 py-2.5 outline-none focus:border-ink/50"
                />
              </form>
            </div>
          </section>

          {!smallRoom && (
            <aside className="flex min-h-0 w-[290px] shrink-0 flex-col">
              <Chat
                messages={msgs}
                onSend={sendChat}
                disabled={false}
                placeholder={placeholder}
                hideInput
              />
            </aside>
          )}
        </main>
      </div>
    );
  }

  if (layout === "tl") {
    // landscape: every pixel of height goes to the board; the word bar,
    // roster and keyboard stack in a side column instead of eating rows
    return (
      <div className="dd-game dd-nosel flex w-full flex-row gap-2 px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
        <section className="relative flex min-h-0 flex-1 flex-col">
          <Canvas
            ref={canvasRef}
            channel={channelRef.current}
            canDraw={isDrawer && drawing}
            overlay={canvasOverlay}
          />
          {kbOpen && <Ticker messages={msgs} />}
        </section>
        <aside
          className="flex min-h-0 shrink-0 flex-col gap-1.5"
          style={{
            width: showKeyboard ? "clamp(320px, 44%, 640px)" : "190px",
          }}
        >
          {!kbOpen && header}
          <WordBar
            state={state}
            isDrawer={isDrawer}
            isGiver={isGiver}
            hasGuessed={hasGuessed}
            timeLeft={timeLeft}
            isHost={isHost}
            onSkip={skipTurnAsHost}
            onPass={passTurn}
            offsetMs={offsetRef.current}
            compact
          />
          {!kbOpen && (
            <div className={`flex shrink-0 items-center gap-1 overflow-x-auto ${chrome}`}>
              <Players state={state} meId={playerId} variant="mini" />
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {addBotButton}
                {kbToggle}
                {settingsButton}
              </span>
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-end gap-1.5">
            {hintButton}
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-end ${chrome}`}>
              {!kbOpen && feed}
            </div>
          </div>
          {showKeyboard && (
            <div className="shrink-0">
              <VirtualKeyboard
                onSubmit={sendChat}
                placeholder={placeholder}
                compact
                onUseDeviceKeyboard={useDeviceKeyboard}
              />
            </div>
          )}
          {showNativeBar && (
            <NativeGuessBar onSubmit={sendChat} placeholder={placeholder} />
          )}
        </aside>
      </div>
    );
  }

  return (
    <div className="dd-game dd-nosel mx-auto flex w-full max-w-6xl flex-col gap-1 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
      {!kbOpen && header}
      <WordBar
        state={state}
        isDrawer={isDrawer}
        isGiver={isGiver}
        hasGuessed={hasGuessed}
        timeLeft={timeLeft}
        isHost={isHost}
        onSkip={skipTurnAsHost}
        onPass={passTurn}
        offsetMs={offsetRef.current}
        compact
      />

      <main className="flex min-h-0 flex-1 flex-col gap-1">

        <section className="relative flex min-h-0 flex-1 flex-col gap-1.5">
          <Canvas
            ref={canvasRef}
            channel={channelRef.current}
            canDraw={isDrawer && drawing}
            overlay={canvasOverlay}
          />
          {kbOpen && <Ticker messages={msgs} />}
        </section>

        <aside className="flex shrink-0 flex-col gap-1">
          {!kbOpen && (
            <div className={`flex shrink-0 items-center gap-1 overflow-x-auto ${chrome}`}>
              <Players state={state} meId={playerId} variant="mini" />
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {addBotButton}
                {kbToggle}
                {settingsButton}
              </span>
            </div>
          )}

          {!kbOpen && (
            <div className="flex min-h-0 items-end gap-1.5" style={{ height: `clamp(39px, ${sh(7.3)}, 86px)` }}>
              {hintButton}
              <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-end ${chrome}`}>
                {feed}
              </div>
            </div>
          )}

          {showKeyboard ? (
            <div className="shrink-0">
              <VirtualKeyboard
                onSubmit={sendChat}
                placeholder={placeholder}
                onUseDeviceKeyboard={useDeviceKeyboard}
              />
            </div>
          ) : showNativeBar ? (
            <NativeGuessBar onSubmit={sendChat} placeholder={placeholder} />
          ) : !isTouch && smallRoom ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitDraft();
              }}
              className="shrink-0"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                maxLength={100}
                autoComplete="off"
                className="w-full rounded-xl border-2 border-ink/20 bg-white px-3 py-2.5 text-xs outline-none focus:border-ink/50"
              />
            </form>
          ) : null}
        </aside>
      </main>
    </div>
  );
}

// --- sub components -------------------------------------------------------

/**
 * The phone's own keyboard, without the page running away.
 *
 * The game shell is pinned to the visual viewport (see useShellMetrics), so
 * when the keyboard slides up the board simply shrinks to sit above it instead
 * of the page scrolling out from under you — which was the whole reason the
 * in-app keyboard existed. The input is uncontrolled on purpose: a controlled
 * one would re-render the entire room on every letter.
 */
const NativeGuessBar = memo(function NativeGuessBar({
  onSubmit,
  placeholder,
}: {
  onSubmit: (text: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(
      () => ref.current?.focus({ preventScroll: true }),
      120
    );
    return () => window.clearTimeout(t);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const v = el.value.trim();
    el.value = "";
    if (!v) return;
    haptic(16);
    onSubmit(v);
    el.focus({ preventScroll: true }); // keep it up for the next guess
  };

  return (
    <form onSubmit={submit} className="flex shrink-0 items-center gap-1.5">
      <input
        ref={ref}
        type="text"
        maxLength={40}
        placeholder={placeholder}
        enterKeyHint="send"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        onBlur={(e) => {
          // tapping a control (hint, settings, the mode toggle) is allowed to
          // dismiss it; tapping nowhere in particular is not
          const to = e.relatedTarget as Element | null;
          if (to?.closest?.("button, a, input, textarea, select")) return;
          window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 40);
        }}
        className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-white px-3 text-base font-bold outline-none focus:border-ink/50"
        style={{ height: `clamp(41px, ${sh(6.2)}, 54px)` }}
      />
      <button
        type="submit"
        aria-label="Send guess"
        className="shrink-0 rounded-xl border-2 border-ink bg-coral px-4 font-bold text-white shadow-doodle active:translate-y-[2px] active:shadow-none"
        style={{ height: `clamp(41px, ${sh(6.2)}, 54px)` }}
      >
        send
      </button>
    </form>
  );
});

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

/**
 * Giver mode's pick screen, shown to the one player who is setting the word.
 *
 * They get both halves: three off the deck, for when nothing comes to mind,
 * and a box to type their own, which is the reason to play this mode at all —
 * the funniest words in a room are always the ones somebody chose for a
 * specific person. The drawer sees none of this; the server only ever sends
 * the shortlist to whoever is actually picking.
 */
function GiveWord({
  choices,
  tiers,
  drawerName,
  drawerAvatar,
  timeLeft,
  onSend,
}: {
  choices?: string[];
  tiers?: string[];
  drawerName: string;
  drawerAvatar: string;
  timeLeft: number;
  onSend: (body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    onSend(body).catch((e) => {
      setErr((e as Error).message);
      setBusy(false);
    });
  };

  return (
    <div className="mx-3 w-[min(92vw,26rem)] rounded-2xl border-2 border-ink bg-white p-3 text-center shadow-doodle">
      <div className="font-display text-base sm:text-lg">
        <PlayerAvatar token={drawerAvatar} size={22} /> Give {drawerName} a word
        <span className="ml-1 text-ink/45">({timeLeft}s)</span>
      </div>
      <p className="mt-0.5 text-[11px] text-ink/55">
        You sit this turn out — no points, but you get to watch them suffer.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const w = draft.trim();
          if (w) send({ type: "give", word: w });
        }}
        className="mt-3 flex gap-2"
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="type anything…"
          maxLength={34}
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 font-bold outline-none focus:border-ink"
        />
        <button
          disabled={!draft.trim() || busy}
          className="rounded-xl border-2 border-ink bg-coral px-4 font-display font-black text-white shadow-doodle disabled:opacity-40"
        >
          Send
        </button>
      </form>
      {err && <p className="mt-1 text-[11px] font-bold text-coral">{err}</p>}

      <div className="mt-3 flex items-center gap-2">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
          or deal one
        </span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {(choices ?? []).map((w, i) => {
          const tier = tiers?.[i] ?? "normal";
          const tierStyle =
            tier === "kids"
              ? "bg-green-100 text-green-800"
              : tier === "chaos"
              ? "bg-coral/15 text-coral"
              : "bg-ink/5 text-ink/60";
          return (
            <button
              key={w}
              disabled={busy}
              onClick={() => send({ type: "choose", index: i })}
              className="flex flex-col items-center gap-1 rounded-xl border-2 border-ink bg-sun px-3 py-2 font-bold shadow-doodle transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
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
        {!choices && <span className="animate-pulse">loading words…</span>}
      </div>
    </div>
  );
}

function WordBar({
  state,
  isDrawer,
  isGiver,
  hasGuessed,
  timeLeft,
  isHost,
  onSkip,
  onPass,
  offsetMs,
  compact,
}: {
  state: ClientState;
  isDrawer: boolean;
  isGiver: boolean;
  hasGuessed: boolean;
  timeLeft: number;
  isHost: boolean;
  onSkip: () => void;
  onPass?: () => void;
  offsetMs: number;
  compact?: boolean;
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
    // the giver wrote the word, so there is nothing left to hide from them —
    // they watch the room flail at their handiwork
    if (isDrawer || isGiver || hasGuessed) {
      content = (
        <span className="font-display tracking-wide" style={{ fontSize: `clamp(12px, ${sh(2.0)}, 20px)` }}>
          {isDrawer ? (
            <><IconBrush size={22} /> Draw: </>
          ) : isGiver ? (
            <><IconPen size={20} /> You set: </>
          ) : (
            <><IconCheck size={22} /> </>
          )}
          <span className="font-bold">{state.yourWord ?? "…"}</span>
        </span>
      );
    } else {
      content = (
        <span className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono font-bold tracking-[0.2em]" style={{ fontSize: `clamp(12px, ${sh(2.1)}, 21px)` }}>
            {(state.mask ?? "")
              .split("")
              .map((c) => (c === " " ? "\u00a0\u00a0" : c))
              .join("")}
          </span>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold tracking-normal text-ink/50">
            {state.wordLen.join("+")}
          </span>
        </span>
      );
    }
  } else if (state.phase === "reveal") {
    content = state.lastTurn?.skipped ? (
      <span className="font-display" style={{ fontSize: `clamp(12px, ${sh(2.0)}, 20px)` }}>
        Turn skipped — no word was picked
      </span>
    ) : (
      <span className="font-display" style={{ fontSize: `clamp(12px, ${sh(2.0)}, 20px)` }}>
        The word was <span className="font-bold text-coral">{state.lastTurn?.word}</span>
        {state.lastTurn?.giverId && (
          <span className="ml-1.5 text-ink/50">
            · from{" "}
            {state.players.find((p) => p.id === state.lastTurn!.giverId)?.name ??
              "someone"}
          </span>
        )}
      </span>
    );
  } else {
    content = (
      <span className="font-display" style={{ fontSize: `clamp(12px, ${sh(2.0)}, 20px)` }}>
        Get ready…
      </span>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-doodle ${
        compact ? "px-2.5 py-1 text-xs" : "px-4 py-2"
      }`}
    >
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
          {isDrawer && state.phase === "drawing" && onPass && (
            <button
              onClick={onPass}
              title="End my turn now"
              className="rounded-lg border-2 border-ink/20 px-1.5 py-0.5 text-[11px] font-bold text-ink/55 transition-colors hover:border-ink hover:text-ink"
            >
              pass
            </button>
          )}
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
            className={`flex flex-col items-center rounded-xl border-2 border-ink leading-none ${
              compact ? "px-1.5 py-0.5" : "px-2 py-0.5"
            } ${urgent ? "animate-pulse bg-coral text-white" : "bg-well"}`}
          >
            {(state.phase === "drawing" || state.phase === "choosing") && (
              <span
                className={`font-display tabular-nums ${compact ? "text-sm" : "text-base"}`}
              >
                {timeLeft}
              </span>
            )}
            <span className="text-[9px] font-bold tabular-nums opacity-60">
              R{state.round}/{state.totalRounds}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

function RevealPhoto({
  state,
  shot,
}: {
  state: ClientState;
  shot: string | null;
}) {
  // how much room the board actually has right now — the reveal has to live
  // inside it, not paint over the page
  const boxRef = useRef<HTMLDivElement>(null);
  const [roomy, setRoomy] = useState(true);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setRoomy(el.getBoundingClientRect().height >= 210);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lt = state.lastTurn!;
  const artist = state.players.find((p) => p.id === lt.drawerId);
  // everyone who was in the round, so it's obvious who got it and who blanked
  const scoreboard = state.players
    .filter((p) => p.connected || lt.deltas[p.id] !== undefined)
    .map((p) => ({
      p,
      pts: lt.deltas[p.id] ?? 0,
      drew: p.id === lt.drawerId,
      got: p.id !== lt.drawerId && (lt.deltas[p.id] ?? 0) > 0,
    }))
    .sort((a, b) => {
      if (a.drew !== b.drew) return a.drew ? -1 : 1; // artist first
      if (a.got !== b.got) return a.got ? -1 : 1; // then solvers
      return b.pts - a.pts;
    });

  if (lt.skipped) {
    return (
      <div className="dd-frost absolute inset-0 flex items-center justify-center rounded-2xl p-3">
        <div className="rounded-2xl border-2 border-ink bg-white px-5 py-4 text-center shadow-doodle">
          <div className="font-display text-base sm:text-lg">
            <PlayerAvatar token={artist?.avatar ?? ""} size={24} />{" "}
            {artist?.name ?? "That player"} didn&apos;t pick a word
          </div>
          <div className="mt-1 text-xs text-ink/55">
            Skipping to the next player…
          </div>
        </div>
      </div>
    );
  }

  return (
    // overflow-hidden matters: when the device keyboard shrinks the board this
    // used to spill its score chips up the page as one name per line
    <div
      ref={boxRef}
      className="dd-frost absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl p-2 sm:p-3"
    >
      {/* one object: the photo, with the scores printed on its white border */}
      <figure className="dd-polaroid flex max-h-full min-h-0 w-full max-w-[420px] flex-col">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot}
            alt={lt.word}
            className="min-h-0 flex-1 rounded-md border border-ink/10 object-contain"
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-ink/10 px-8 text-ink/30">
            no drawing
          </div>
        )}

        <figcaption className="shrink-0 px-1 pt-2">
          <div className="text-center leading-none">
            <span className="font-display text-base text-coral sm:text-lg">
              {lt.word}
            </span>
            <span className="ml-1.5 text-[11px] text-ink/50">
              by {artist?.name ?? "?"}
            </span>
          </div>

          {roomy && (
            <div className="mt-2 flex max-h-[30%] flex-wrap items-center justify-center gap-1 overflow-hidden">
              {lt.everyoneGuessed && (
                <span className="rounded-lg bg-mint px-2 py-0.5 text-[10px] font-bold text-green-900">
                  Everybody got it!
                </span>
              )}
              {scoreboard.map(({ p, pts, drew, got }) => (
                <span
                  key={p.id}
                  className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[10px] ${
                    drew
                      ? "bg-sun/60"
                      : got
                      ? "bg-mint"
                      : "bg-ink/5 text-ink/45"
                  }`}
                >
                  <PlayerAvatar token={p.avatar} size={16} />
                  <span className="max-w-[64px] truncate font-bold">
                    {p.name}
                  </span>
                  {drew ? (
                    <IconBrush size={11} />
                  ) : got ? (
                    <IconCheck size={11} />
                  ) : (
                    <span className="font-bold opacity-50">✗</span>
                  )}
                  <span
                    className={`font-bold tabular-nums ${
                      pts > 0 ? "text-green-800" : "opacity-60"
                    }`}
                  >
                    +{pts}
                  </span>
                </span>
              ))}
            </div>
          )}
        </figcaption>
      </figure>
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
  onSettings,
}: {
  state: ClientState;
  meId: string;
  isHost: boolean;
  roomId: string;
  onCopy: () => void;
  onCopyName: () => void;
  copied: boolean;
  copiedName: boolean;
  onSettings: (patch: Record<string, unknown>) => void;
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
        <h2 className="font-display text-xl">The gang assembles…</h2>
        <p className="mt-1 text-xs text-ink/60">
          Send friends the link — they click, type a name, and they&apos;re in.
        </p>
        <div className="mt-3 rounded-xl bg-sun/35 px-3 py-2 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
            Your room
          </div>
          <div className="font-display text-base font-bold leading-tight tracking-[0.18em] break-all">
            {roomCode(roomId)}
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
              className="rounded-xl border-2 border-dashed border-ink/30 px-3 py-1.5 text-xs font-bold text-ink/50 transition-colors hover:border-ink hover:text-ink"
            >
              + Add a bot
            </button>
          )}
        </div>

        {isHost ? (
          <>
            <div className="mt-5">
              <span className="text-xs font-bold">Difficulty</span>
              <div className="mt-1 grid grid-cols-4 gap-1.5">
                {(
                  [
                    { key: "kids", label: "KIDS", sub: "under 7s" },
                    { key: "medium", label: "Medium", sub: "casual" },
                    { key: "hard", label: "Hard", sub: "sweaty" },
                    { key: "ultra", label: "Ultra", sub: "no mercy" },
                  ] as const
                ).map((d) => {
                  const active =
                    (state.settings.difficulty ?? "medium") === d.key;
                  return (
                    <button
                      key={d.key}
                      onClick={() => onSettings({ difficulty: d.key })}
                      className={`rounded-xl border-2 px-1 py-2 text-center transition-all ${
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

            <div className="mt-5">
              <span className="text-xs font-bold">Where words come from</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(
                  [
                    {
                      key: "bank",
                      label: "The word bank",
                      sub: "the drawer picks",
                    },
                    {
                      key: "giver",
                      label: "Another player",
                      sub: "needs 3+ players",
                    },
                  ] as const
                ).map((o) => {
                  const active =
                    (state.settings.wordSource ?? "bank") === o.key;
                  return (
                    <button
                      key={o.key}
                      onClick={() => onSettings({ wordSource: o.key })}
                      className={`rounded-xl border-2 px-2 py-2 text-center transition-all ${
                        active
                          ? "border-ink bg-sun shadow-doodle"
                          : "border-ink/15 bg-paper hover:border-ink/40"
                      }`}
                    >
                      <span className="block font-display font-bold leading-tight">
                        {o.label}
                      </span>
                      <span className="block text-[11px] text-ink/50">
                        {o.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
              {(state.settings.wordSource ?? "bank") === "giver" && (
                <p className="mt-1.5 text-[11px] text-ink/55">
                  Each turn one player hands the drawer a word instead of the
                  deck dealing one. They see every guess and can chat, but they
                  score nothing that turn — and the job goes round the table.
                </p>
              )}
            </div>

            <div className="mt-3">
              <span className="text-xs font-bold">Themes</span>
              <p className="text-[11px] text-ink/45">
                Tap as many as you like — they combine into one big word space.
                {(state.themePacks?.length ?? 0) > 0 &&
                  ` ${themeWords(state.themePacks).length} words in play.`}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  onClick={() => onSettings({ themePacks: null })}
                  className={`rounded-lg border-2 px-2 py-1 text-[11px] font-bold ${
                    !state.themePacks?.length
                      ? "border-ink bg-sun shadow-doodle"
                      : "border-ink/15 bg-paper"
                  }`}
                >
                  🎲 None
                </button>
                {THEMES.map((t) => {
                  const on = state.themePacks?.includes(t.key) ?? false;
                  return (
                    <button
                      key={t.key}
                      title={t.blurb}
                      onClick={() => {
                        const cur = state.themePacks ?? [];
                        const next = on
                          ? cur.filter((k) => k !== t.key)
                          : [...cur, t.key];
                        onSettings({ themePacks: next.length ? next : null });
                      }}
                      className={`rounded-lg border-2 px-2 py-1 text-[11px] font-bold ${
                        on
                          ? "border-ink bg-sun shadow-doodle"
                          : "border-ink/15 bg-paper"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {t.emoji} {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-bold">Rounds</span>
                <div className="mt-1 flex gap-1.5">
                  {[3, 5, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => onSettings({ rounds: n })}
                      className={`flex-1 rounded-lg border-2 py-1 text-xs font-display font-bold transition-all ${
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
                <span className="text-xs font-bold">Draw time</span>
                <div className="mt-1 flex gap-1.5">
                  {[60, 75, 120].map((n) => (
                    <button
                      key={n}
                      onClick={() => onSettings({ drawSeconds: n })}
                      className={`flex-1 rounded-lg border-2 py-1 text-xs font-display font-bold transition-all ${
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
                <div className="flex items-center justify-between rounded-xl border-2 border-ink/20 bg-sun/30 px-3 py-2 text-xs">
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
                  className="text-[11px] font-bold text-ink/40 underline decoration-dotted hover:text-ink/70"
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
                      placeholder="cricket… or paste your own words, comma separated"
                      className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-xs outline-none focus:border-ink"
                    />
                    <button
                      onClick={() => applyTheme(themeText)}
                      disabled={themeBusy || themeText.trim().length < 3}
                      className="rounded-xl border-2 border-ink bg-sun px-3 text-xs font-bold shadow-doodle disabled:opacity-40"
                    >
                      {themeBusy ? "Brewing…" : "Go"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-ink/40">
                    Name a theme and we invent the words, or paste your own
                    (six or more, separated by commas). Family-friendly only.
                  </p>
                  {themeErr && (
                    <p className="mt-1 text-[11px] text-coral">{themeErr}</p>
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
            <p className="mt-4 text-center text-xs text-ink/50">
              {state.settings.rounds} round{state.settings.rounds > 1 ? "s" : ""} ·{" "}
              {state.settings.drawSeconds}s draws ·{" "}
              <span className="capitalize">{state.settings.difficulty ?? "medium"}</span>{" "}
              difficulty
              {state.theme ? <> · themed: “{state.theme}”</> : null}
            </p>
            <p className="mt-3 animate-pulse text-center font-display text-base text-ink/50">
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
        <h2 className="font-display text-2xl">
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
              <span className="font-display text-lg tabular-nums">{p.score}</span>
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
          <h3 className="text-center font-display text-xl">
            <IconGallery size={26} /> Tonight&apos;s masterpieces
          </h3>
          {mostLoved && mostLoved.reactions > 0 && (
            <p className="mt-1 text-center text-xs text-ink/60">
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
                <figcaption className="mt-1 text-center text-[11px]">
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
      recordGame({ roomId, playerId: res.playerId, name: n, avatar });
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
          <h1 className="mt-2 text-2xl">
            <Wordmark />
          </h1>
          <p className="mt-1 text-ink/60">
            You&apos;re joining <b>{roomCode(roomId)}</b>
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
              className="w-full rounded-xl border-2 border-ink/20 bg-paper px-4 py-3 text-center text-base font-bold outline-none focus:border-ink"
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
            {error && <p className="mt-2 text-xs text-coral">{error}</p>}
          </form>
          <p className="mt-4 text-[11px] text-ink/40">
            Draw the word · guess fast for points · never write letters!
          </p>
        </div>
      </div>
    </Shell>
  );
}
