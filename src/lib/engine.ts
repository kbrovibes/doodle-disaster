import { ClientState, Player, RoomState, Settings } from "./types";
import { pickWordChoices } from "./words";
import { pickBotWords } from "./botdraw";
import { isClose, isCorrect } from "./text";

export class GameError extends Error {
  status = 400;
}

export const CHOOSE_SECONDS = 15;
export const REVEAL_SECONDS = 6;
export const ADVANCE_GRACE_MS = 1500;

export function newRoom(host: Player, settings?: Partial<Settings>): RoomState {
  return {
    phase: "lobby",
    players: [host],
    hostId: host.id,
    settings: { rounds: 10, drawSeconds: 45, difficulty: "medium", ...settings },
    order: [],
    round: 0,
    turnIndex: 0,
    drawerId: null,
    wordChoices: [],
    word: null,
    phaseEndsAt: 0,
    guessed: {},
    drawerPoints: 0,
    usedWords: [],
    lastTurn: null,
  };
}

export function addPlayer(state: RoomState, p: Player): void {
  state.players.push(p);
  // joined mid-game: they get turns too
  if (state.phase !== "lobby" && state.phase !== "gameover") {
    state.order.push(p.id);
  }
}

export const BOT_ROSTER = [
  { name: "Botrick", avatar: "a7" },
  { name: "Doodl-E", avatar: "a13" },
  { name: "Crayon.exe", avatar: "a19" },
] as const;

export function addBot(state: RoomState): Player {
  if (state.phase !== "lobby")
    throw new GameError("Bots can only be added in the lobby");
  const bots = state.players.filter((p) => p.isBot);
  if (bots.length >= BOT_ROSTER.length)
    throw new GameError(`Max ${BOT_ROSTER.length} bots`);
  if (state.players.length >= 10) throw new GameError("Room is full");
  const cfg = BOT_ROSTER.find(
    (b) => !state.players.some((p) => p.name === b.name)
  )!;
  const bot: Player = {
    id: crypto.randomUUID(),
    name: cfg.name,
    avatar: cfg.avatar,
    score: 0,
    connected: true,
    joinedAt: Date.now(),
    isBot: true,
  };
  state.players.push(bot);
  return bot;
}

export function removeBot(state: RoomState, botId: string): void {
  const idx = state.players.findIndex((p) => p.id === botId && p.isBot);
  if (idx < 0) throw new GameError("No such bot");
  state.players.splice(idx, 1);
  delete state.guessed[botId];
}

export function startGame(state: RoomState, now: number): void {
  const connected = state.players.filter((p) => p.connected);
  const humans = connected.filter((p) => !p.isBot);
  if (connected.length < 2) throw new GameError("Need at least 2 players");
  if (humans.length < 1) throw new GameError("Need at least one human");
  state.players.forEach((p) => (p.score = 0));
  // bots take drawing turns too
  state.order = shuffle(connected.map((p) => p.id));
  state.round = 1;
  state.turnIndex = 0;
  // usedWords deliberately NOT reset: repeats stay spread across matches
  state.lastTurn = null;
  beginChoosing(state, now);
}

function beginChoosing(state: RoomState, now: number): void {
  const drawerId = state.order[state.turnIndex];
  state.phase = "choosing";
  state.drawerId = drawerId;
  const drawer = state.players.find((p) => p.id === drawerId);
  // a bot can only draw what it knows how to draw
  const picked = drawer?.isBot
    ? pickBotWords(state.usedWords)
    : pickWordChoices(
        state.usedWords,
        state.settings.difficulty ?? "medium",
        state.customWords ?? undefined
      );
  state.wordChoices = picked.words;
  state.wordChoiceTiers = picked.tiers;
  state.word = null;
  state.guessed = {};
  state.personalHints = {};
  state.drawerPoints = 0;
  state.phaseEndsAt = now + CHOOSE_SECONDS * 1000;
}

export function chooseWord(
  state: RoomState,
  playerId: string,
  index: number,
  now: number
): void {
  if (state.phase !== "choosing") throw new GameError("Not choosing");
  if (playerId !== state.drawerId) throw new GameError("Not the drawer");
  const word = state.wordChoices[index];
  if (!word) throw new GameError("That word wasn't on the menu!");
  beginDrawing(state, word, now);
}

function beginDrawing(state: RoomState, word: string, now: number): void {
  state.phase = "drawing";
  state.word = word;
  // recency list, oldest first, unique — the word-dealer's memory
  const key = word.toLowerCase();
  state.usedWords = state.usedWords.filter((w) => w !== key);
  state.usedWords.push(key);
  if (state.usedWords.length > 300)
    state.usedWords = state.usedWords.slice(-300);
  state.wordChoices = [];
  state.phaseEndsAt = now + state.settings.drawSeconds * 1000;
}

export type GuessResult = "correct" | "close" | "wrong" | "chat" | "expired";

export function handleGuess(
  state: RoomState,
  playerId: string,
  text: string,
  now: number
): GuessResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Unknown player");
  if (state.phase !== "drawing" || !state.word) return "chat";
  // the clock is authoritative: a guess after time's up scores nothing and
  // instead resolves the overdue turn (serverless — no background timer)
  if (now > state.phaseEndsAt + ADVANCE_GRACE_MS) {
    endTurn(state, now, false);
    return "expired";
  }
  if (playerId === state.drawerId) return "chat";
  if (state.guessed[playerId] !== undefined) return "chat"; // already got it

  if (isCorrect(text, state.word)) {
    // compressed curve: guess order matters more than raw typing speed,
    // but the spread stays small so one fast typist can't run away with it
    const ORDER_POINTS = [100, 85, 70, 60, 55, 50];
    const order = Math.min(Object.keys(state.guessed).length, ORDER_POINTS.length - 1);
    const total = state.settings.drawSeconds * 1000;
    const left = Math.max(0, state.phaseEndsAt - now);
    const points = ORDER_POINTS[order] + Math.round(25 * (left / total));
    state.guessed[playerId] = points;
    player.score += points;
    // hint token replenish: 5 correct guesses while empty earns one back
    if ((player.hints ?? 1) < 1) {
      player.hintStreak = (player.hintStreak ?? 0) + 1;
      if (player.hintStreak >= 5) {
        player.hints = 1;
        player.hintStreak = 0;
      }
    }
    const guessers = state.players.filter(
      (p) => p.id !== state.drawerId && p.connected
    );
    const allGuessed = guessers.every((p) => state.guessed[p.id] !== undefined);
    if (allGuessed) endTurn(state, now, false);
    return "correct";
  }
  return isClose(text, state.word) ? "close" : "wrong";
}

function endTurn(state: RoomState, now: number, skipped: boolean): void {
  const word = state.word ?? "";
  const drawer = state.players.find((p) => p.id === state.drawerId);
  const guessers = state.players.filter(
    (p) => p.id !== state.drawerId && p.connected
  );
  const correctCount = Object.keys(state.guessed).length;
  const everyoneGuessed =
    guessers.length > 0 && correctCount >= guessers.length;
  let drawerDelta = 0;
  if (!skipped && drawer) {
    // 10 bravery points even when nobody guessed — a zero stings too much
    drawerDelta =
      correctCount === 0 ? 10 : 35 * correctCount + (everyoneGuessed ? 25 : 0);
    drawer.score += drawerDelta;
  }
  const deltas: Record<string, number> = { ...state.guessed };
  if (drawer) deltas[drawer.id] = drawerDelta;
  state.lastTurn = {
    word,
    drawerId: state.drawerId ?? "",
    deltas,
    everyoneGuessed,
    skipped,
  };
  state.phase = "reveal";
  state.phaseEndsAt = now + REVEAL_SECONDS * 1000;
}

/** Called by any client when a phase timer expires (or drawer vanished). */
export function advance(state: RoomState, now: number): void {
  switch (state.phase) {
    case "choosing": {
      const drawerGone = !state.players.find(
        (p) => p.id === state.drawerId && p.connected
      );
      if (now + ADVANCE_GRACE_MS < state.phaseEndsAt && !drawerGone) return;
      // no word picked in time = turn forfeited. Auto-picking just produced a
      // dead round where nobody drew anything.
      state.word = null;
      endTurn(state, now, true);
      return;
    }
    case "drawing": {
      const drawerGone = !state.players.find(
        (p) => p.id === state.drawerId && p.connected
      );
      if (now + ADVANCE_GRACE_MS < state.phaseEndsAt && !drawerGone) return;
      endTurn(state, now, drawerGone && Object.keys(state.guessed).length === 0);
      return;
    }
    case "reveal": {
      if (now + ADVANCE_GRACE_MS < state.phaseEndsAt) return;
      nextTurn(state, now);
      return;
    }
    default:
      return;
  }
}

function nextTurn(state: RoomState, now: number): void {
  const connected = state.players.filter((p) => p.connected);
  if (connected.length < 2) {
    state.phase = "lobby";
    state.drawerId = null;
    state.word = null;
    state.phaseEndsAt = 0;
    return;
  }
  let idx = state.turnIndex;
  let round = state.round;
  for (let hop = 0; hop < state.order.length + 1; hop++) {
    idx += 1;
    if (idx >= state.order.length) {
      idx = 0;
      round += 1;
    }
    if (round > state.settings.rounds) {
      state.phase = "gameover";
      state.drawerId = null;
      state.word = null;
      state.phaseEndsAt = 0;
      return;
    }
    const candidate = state.players.find((p) => p.id === state.order[idx]);
    if (candidate?.connected) {
      state.turnIndex = idx;
      state.round = round;
      beginChoosing(state, now);
      return;
    }
  }
  // nobody drawable
  state.phase = "lobby";
  state.phaseEndsAt = 0;
}

export function playAgain(state: RoomState): void {
  if (state.phase !== "gameover") throw new GameError("Game not over");
  state.phase = "lobby";
  state.drawerId = null;
  state.word = null;
  state.round = 0;
  state.turnIndex = 0;
  state.lastTurn = null;
  state.phaseEndsAt = 0;
}

/**
 * Spend a personal hint token: reveals one extra letter for THIS player only.
 * Letters come from the tail of the seeded reveal order, so they never
 * collide with the timed global reveals (which come from the head).
 */
export function useHint(state: RoomState, playerId: string, now: number): void {
  if (state.phase !== "drawing" || !state.word)
    throw new GameError("Nothing to hint right now");
  if (playerId === state.drawerId)
    throw new GameError("You know the word already!");
  if (state.guessed[playerId] !== undefined)
    throw new GameError("You already guessed it!");
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("Unknown player");
  if ((player.hints ?? 1) < 1) throw new GameError("No hint tokens left");

  const order = seededShuffleIdx(state.word);
  const letters = order.length;
  const maxGlobal = Math.max(1, Math.floor(letters / 3));
  state.personalHints ??= {};
  const mine = state.personalHints[playerId] ?? [];
  // keep at least 2 letters hidden even after global + personal reveals
  if (letters - maxGlobal - mine.length <= 2)
    throw new GameError("This word is too short for another hint");
  const idx = order[letters - 1 - mine.length];
  state.personalHints[playerId] = [...mine, idx];
  player.hints = (player.hints ?? 1) - 1;
  player.hintStreak = 0;
}

/** Host-only: end the current turn early (stuck or misbehaving drawer). */
export function skipTurn(state: RoomState, now: number): void {
  if (state.phase === "choosing") {
    state.word = null;
    endTurn(state, now, true);
  } else if (state.phase === "drawing") {
    // guessers keep what they earned; drawer paid per correct guess as usual
    endTurn(state, now, Object.keys(state.guessed).length === 0);
  } else {
    throw new GameError("Nothing to skip");
  }
}

/** Host-only: remove a player entirely. */
export function kickPlayer(state: RoomState, targetId: string, now: number): void {
  const idx = state.players.findIndex((p) => p.id === targetId);
  if (idx < 0) throw new GameError("Unknown player");
  const wasDrawer = state.drawerId === targetId;
  state.players.splice(idx, 1);
  const orderIdx = state.order.indexOf(targetId);
  if (orderIdx >= 0) {
    state.order.splice(orderIdx, 1);
    if (orderIdx <= state.turnIndex) state.turnIndex--;
  }
  if (state.hostId === targetId) {
    const next = state.players.find((p) => p.connected);
    if (next) state.hostId = next.id;
  }
  delete state.guessed[targetId];
  if (wasDrawer && (state.phase === "choosing" || state.phase === "drawing")) {
    if (state.phase === "choosing") state.word = null;
    endTurn(state, now, Object.keys(state.guessed).length === 0);
  }
}

export function markConnected(
  state: RoomState,
  playerId: string,
  connected: boolean
): void {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return;
  p.connected = connected;
  if (!connected && state.hostId === playerId) {
    const next = state.players.find((x) => x.connected && !x.isBot);
    if (next) state.hostId = next.id;
  }
}

// --- hints ---------------------------------------------------------------

function seededShuffleIdx(word: string): number[] {
  // deterministic per word so every state fetch agrees on reveal order
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = [...word]
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => /[a-z0-9]/i.test(c))
    .map(({ i }) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    const j = (h >>> 0) % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function revealedCount(word: string, elapsedFrac: number): number {
  const letters = word.replace(/[^a-z0-9]/gi, "").length;
  const maxReveals = Math.max(1, Math.floor(letters / 3));
  let n = 0;
  if (elapsedFrac >= 0.5) n = 1;
  if (elapsedFrac >= 0.75) n = 2;
  if (elapsedFrac >= 0.88 && letters >= 7) n = 3;
  return Math.min(n, maxReveals);
}

export function maskWord(
  word: string,
  elapsedFrac: number,
  extra: number[] = []
): string {
  const reveal = new Set([
    ...seededShuffleIdx(word).slice(0, revealedCount(word, elapsedFrac)),
    ...extra,
  ]);
  return [...word]
    .map((c, i) => (/[a-z0-9]/i.test(c) ? (reveal.has(i) ? c : "_") : c))
    .join("");
}

// --- sanitize ------------------------------------------------------------

export function sanitize(
  state: RoomState,
  playerId: string | null,
  now: number
): ClientState {
  const isDrawer = playerId !== null && playerId === state.drawerId;
  const hasGuessed = playerId !== null && state.guessed[playerId] !== undefined;
  let mask: string | null = null;
  if (state.phase === "drawing" && state.word) {
    const total = state.settings.drawSeconds * 1000;
    const elapsed = 1 - Math.max(0, state.phaseEndsAt - now) / total;
    const personal = (playerId && state.personalHints?.[playerId]) || [];
    mask = maskWord(state.word, elapsed, personal);
  }
  const mePlayer = playerId
    ? state.players.find((p) => p.id === playerId)
    : null;
  return {
    phase: state.phase,
    players: state.players,
    hostId: state.hostId,
    settings: state.settings,
    round: state.round,
    totalRounds: state.settings.rounds,
    turnIndex: state.turnIndex,
    turnsPerRound: state.order.length,
    drawerId: state.drawerId,
    order: state.order,
    mask,
    wordLen:
      state.phase === "drawing" && state.word
        ? state.word.split(" ").map((s) => s.length)
        : [],
    phaseEndsAt: state.phaseEndsAt,
    serverNow: now,
    guessedIds: Object.keys(state.guessed),
    theme: state.customWords?.theme ?? null,
    lastTurn:
      state.phase === "reveal" || state.phase === "gameover"
        ? state.lastTurn
        : null,
    yourWord:
      (isDrawer || hasGuessed) && state.phase === "drawing"
        ? state.word
        : undefined,
    yourChoices:
      isDrawer && state.phase === "choosing" ? state.wordChoices : undefined,
    yourChoiceTiers:
      isDrawer && state.phase === "choosing" ? state.wordChoiceTiers : undefined,
    yourHints: mePlayer ? mePlayer.hints ?? 1 : undefined,
    yourHintProgress: mePlayer ? mePlayer.hintStreak ?? 0 : undefined,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
