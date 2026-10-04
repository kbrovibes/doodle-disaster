import { ClientState, Player, RoomState, Settings } from "./types";
import { isPlayableTheme, pickWordChoices, randomSalt, type Cursor } from "./words";
import { pickBotWords } from "./botdraw";
import { isClose, isCorrect } from "./text";

export class GameError extends Error {
  status = 400;
}

export const CHOOSE_SECONDS = 30;
export const REVEAL_SECONDS = 6;
/** nothing was drawn, so there is nothing to linger on */
export const SKIP_REVEAL_SECONDS = 2;
export const ADVANCE_GRACE_MS = 1500;
/** a draw-a-thon reveal is just "pens down" while everyone's drawing uploads */
export const DRAWATHON_REVEAL_SECONDS = 4;

export function isDrawathon(state: { settings: Settings }): boolean {
  return state.settings.mode === "drawathon";
}

/**
 * The ring this room walks. Fixed for the life of the room (the old version
 * re-derived it from the player list, so it reshuffled every time somebody
 * joined). A room created with a seed carries on from where the group's last
 * game left off; without one it starts a fresh ring at a random point.
 */
function ringOf(state: RoomState): { salt: number; cursor: Cursor } {
  if (typeof state.wordSalt !== "number") state.wordSalt = randomSalt();
  if (!state.wordCursor) state.wordCursor = {};
  return { salt: state.wordSalt, cursor: state.wordCursor as Cursor };
}

export function newRoom(
  host: Player,
  settings?: Partial<Settings>,
  seed?: { salt?: number; cursor?: Record<string, number> }
): RoomState {
  return {
    phase: "lobby",
    players: [host],
    hostId: host.id,
    founderId: host.id,
    settings: { rounds: 5, drawSeconds: 75, difficulty: "medium", ...settings },
    order: [],
    round: 0,
    turnIndex: 0,
    drawerId: null,
    giverId: null,
    wordChoices: [],
    word: null,
    phaseEndsAt: 0,
    guessed: {},
    drawerPoints: 0,
    usedWords: [],
    // carry the group's ring forward from whoever made the room, so a second
    // game of the night does not deal the same opening words as the first
    wordSalt: typeof seed?.salt === "number" ? seed.salt : randomSalt(),
    wordCursor: seed?.cursor ?? {},
    lastTurn: null,
  };
}

/**
 * Who hands the drawer their word this turn: the next connected human after
 * them in the turn order, so the job goes round the table the same way the pen
 * does and nobody gives twice before everyone has given once.
 *
 * Returns null — meaning "the drawer picks off the deck as usual" — whenever
 * giver mode cannot actually be played:
 *
 *   - the setting is off
 *   - the drawer is a bot, which can only draw from its own small repertoire
 *   - fewer than three people are connected, so somebody would be left with
 *     nothing to do (drawer + giver + at least one guesser is the minimum)
 *   - everyone else in the order is a bot or has dropped
 *
 * A turn therefore degrades to the classic game rather than stalling.
 */
export function giverFor(state: RoomState, drawerId: string): string | null {
  if (state.settings.wordSource !== "giver" || isDrawathon(state)) return null;
  const drawer = state.players.find((p) => p.id === drawerId);
  if (!drawer || drawer.isBot) return null;
  if (state.players.filter((p) => p.connected).length < 3) return null;

  const n = state.order.length;
  if (n === 0) return null;
  const at = Math.max(0, state.order.indexOf(drawerId));
  for (let hop = 1; hop <= n; hop++) {
    const id = state.order[(at + hop) % n];
    if (id === drawerId) continue;
    const p = state.players.find((x) => x.id === id);
    if (p?.connected && !p.isBot) return id;
  }
  return null;
}

/**
 * A word a person typed, rather than one off the deck. Same house rules as a
 * theme pack (up to four words, letters and single spaces) because a giver
 * naming a person or a film is exactly the point.
 */
export function cleanGivenWord(raw: string): string | null {
  const w = raw
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (w.replace(/ /g, "").length < 2) return null;
  return isPlayableTheme(w) ? w : null;
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
  if (state.phase === "gameover") throw new GameError("Game is over");
  if (isDrawathon(state))
    throw new GameError("Bots can't join a draw-a-thon");
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
  addPlayer(state, bot); // joins the draw order too when a game is running
  return bot;
}

export function removeBot(state: RoomState, botId: string): void {
  const idx = state.players.findIndex((p) => p.id === botId && p.isBot);
  if (idx < 0) throw new GameError("No such bot");
  state.players.splice(idx, 1);
  delete state.guessed[botId];
}

export function startGame(state: RoomState, now: number): void {
  if (isDrawathon(state)) {
    // bots only know how to draw their own little repertoire, so they sit
    // this one out entirely
    state.players = state.players.filter((p) => !p.isBot);
    const here = state.players.filter((p) => p.connected);
    if (here.length < 1) throw new GameError("Need at least one player");
    state.players.forEach((p) => (p.score = 0));
    state.order = shuffle(here.map((p) => p.id));
    state.round = 1;
    state.turnIndex = 0;
    state.lastTurn = null;
    beginChoosing(state, now);
    return;
  }
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
  state.giverId = giverFor(state, drawerId);
  const drawer = state.players.find((p) => p.id === drawerId);
  // a bot can only draw what it knows how to draw
  const ring = ringOf(state);
  const picked = drawer?.isBot
    ? pickBotWords(state.usedWords)
    : pickWordChoices(ring.cursor, state.settings.difficulty ?? "medium", {
        salt: ring.salt,
        themes: state.settings.themePacks ?? null,
        custom: state.customWords
          ? [
              ...state.customWords.easy,
              ...state.customWords.normal,
              ...state.customWords.chaos,
            ]
          : undefined,
      });
  state.wordChoices = picked.words;
  state.wordChoiceTiers = picked.tiers;
  // the ring only ever moves forward, so a word cannot come round again until
  // every other word in its tier has been dealt
  if ("cursor" in picked && picked.cursor)
    state.wordCursor = picked.cursor as Record<string, number>;
  // remember what we merely SHOWED, not just what got drawn: the two you
  // turned down used to come straight back round to the next player
  const offered = state.offeredWords ?? [];
  for (const w of picked.words) {
    const k = w.toLowerCase();
    const at = offered.indexOf(k);
    if (at >= 0) offered.splice(at, 1);
    offered.push(k);
  }
  // hold a long memory: a word you turned down coming back next turn reads as
  // a repeat just as much as one you drew
  state.offeredWords = offered.length > 1200 ? offered.slice(-1200) : offered;
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
  // in giver mode the three dealt words are the giver's shortlist, not the
  // drawer's menu — the drawer must not even be able to name one
  const picker = state.giverId ?? state.drawerId;
  if (playerId !== picker)
    throw new GameError(
      state.giverId ? "Not your word to give" : "Not the drawer"
    );
  const word = state.wordChoices[index];
  if (!word) throw new GameError("That word wasn't on the menu!");
  beginDrawing(state, word, now);
}

/** Giver mode: a word somebody typed for the drawer, rather than dealt. */
export function giveWord(
  state: RoomState,
  playerId: string,
  raw: string,
  now: number
): void {
  if (state.phase !== "choosing") throw new GameError("Not choosing");
  // in a draw-a-thon whoever is picking may name anything they like
  const picker =
    state.giverId ?? (isDrawathon(state) ? state.drawerId : null);
  if (!picker) throw new GameError("Nobody is giving words this turn");
  if (playerId !== picker) throw new GameError("Not your word to give");
  const word = cleanGivenWord(raw);
  if (!word)
    throw new GameError("Letters and spaces only, up to four words");
  beginDrawing(state, word, now);
}

function beginDrawing(state: RoomState, word: string, now: number): void {
  state.phase = "drawing";
  state.word = word;
  // recency list, oldest first, unique — the word-dealer's memory
  const key = word.toLowerCase();
  state.usedWords = state.usedWords.filter((w) => w !== key);
  state.usedWords.push(key);
  // the deck is thousands deep; remember a long way back so a repeat needs a
  // truly epic night before it can come round again
  if (state.usedWords.length > 2000)
    state.usedWords = state.usedWords.slice(-2000);
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
  if (isDrawathon(state)) return "chat"; // everybody knows the word
  // the clock is authoritative: a guess after time's up scores nothing and
  // instead resolves the overdue turn (serverless — no background timer)
  if (now > state.phaseEndsAt + ADVANCE_GRACE_MS) {
    endTurn(state, now, false);
    return "expired";
  }
  // both people who already know the word just talk; nothing they type is
  // ever scored, and nothing is swallowed either — it all reaches the room
  if (playerId === state.drawerId) return "chat";
  if (playerId === state.giverId) return "chat";
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
      (p) =>
        p.id !== state.drawerId && p.id !== state.giverId && p.connected
    );
    const allGuessed = guessers.every((p) => state.guessed[p.id] !== undefined);
    if (allGuessed) endTurn(state, now, false);
    return "correct";
  }
  return isClose(text, state.word) ? "close" : "wrong";
}

/** Draw-a-thon: "I'm finished" — the round ends once everyone here is. */
export function markDone(state: RoomState, playerId: string, now: number): void {
  if (!isDrawathon(state)) throw new GameError("Not a draw-a-thon");
  if (state.phase !== "drawing") throw new GameError("Not drawing right now");
  if (!state.order.includes(playerId)) throw new GameError("Unknown player");
  state.guessed[playerId] = 0;
  if (everyoneDone(state)) endTurn(state, now, false);
}

function everyoneDone(state: RoomState): boolean {
  const here = state.players.filter(
    (p) => p.connected && state.order.includes(p.id)
  );
  return here.length > 0 && here.every((p) => state.guessed[p.id] !== undefined);
}

function endTurn(state: RoomState, now: number, skipped: boolean): void {
  if (isDrawathon(state)) {
    state.lastTurn = {
      word: state.word ?? "",
      drawerId: state.drawerId ?? "",
      deltas: {},
      everyoneGuessed: false,
      skipped,
    };
    state.phase = "reveal";
    state.phaseEndsAt =
      now + (skipped ? SKIP_REVEAL_SECONDS : DRAWATHON_REVEAL_SECONDS) * 1000;
    return;
  }
  const word = state.word ?? "";
  const drawer = state.players.find((p) => p.id === state.drawerId);
  // the giver is out of the running by design, so they must not count toward
  // "everyone got it" either — otherwise the drawer could never earn the bonus
  const guessers = state.players.filter(
    (p) => p.id !== state.drawerId && p.id !== state.giverId && p.connected
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
    giverId: state.giverId,
    deltas,
    everyoneGuessed,
    skipped,
  };
  state.phase = "reveal";
  state.phaseEndsAt =
    now + (skipped ? SKIP_REVEAL_SECONDS : REVEAL_SECONDS) * 1000;
}

/** Called by any client when a phase timer expires (or drawer vanished). */
export function advance(state: RoomState, now: number): void {
  switch (state.phase) {
    case "choosing": {
      const drawerGone = !state.players.find(
        (p) => p.id === state.drawerId && p.connected
      );
      if (now + ADVANCE_GRACE_MS < state.phaseEndsAt && !drawerGone) return;
      // a draw-a-thon never forfeits a round: everybody else is waiting to
      // draw, so whoever dithered simply gets the first word dealt
      if (isDrawathon(state) && state.wordChoices.length) {
        beginDrawing(state, state.wordChoices[0], now);
        return;
      }
      // no word picked in time = turn forfeited. Auto-picking just produced a
      // dead round where nobody drew anything.
      //
      // Giver mode is the exception: there the drawer is sitting ready with a
      // pen and it was somebody ELSE who dithered, so burning their turn
      // punishes the wrong person. Deal off the deck and get on with it.
      if (state.giverId && !drawerGone && state.wordChoices.length) {
        beginDrawing(state, state.wordChoices[0], now);
        return;
      }
      state.word = null;
      endTurn(state, now, true);
      return;
    }
    case "drawing": {
      if (isDrawathon(state)) {
        // the picker leaving changes nothing: their word is everyone's now
        if (now + ADVANCE_GRACE_MS < state.phaseEndsAt && !everyoneDone(state))
          return;
        endTurn(state, now, false);
        return;
      }
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
  if (isDrawathon(state)) {
    nextDrawathonRound(state, now);
    return;
  }
  const connected = state.players.filter((p) => p.connected);
  if (connected.length < 2) {
    // Don't tear the game down because people dropped — hold it open and let
    // them come back. The host can end it deliberately if they'd rather.
    state.phase = "reveal";
    state.drawerId = null;
    state.phaseEndsAt = now + 25_000; // re-checked periodically
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
      state.giverId = null;
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
  // nobody drawable right now — hold, don't end
  state.phase = "reveal";
  state.phaseEndsAt = now + 25_000;
}

/**
 * One drawing per round, so every round is a single "turn" — the picker's job
 * just moves one seat round the table each time.
 */
function nextDrawathonRound(state: RoomState, now: number): void {
  const round = state.round + 1;
  if (round > state.settings.rounds) {
    state.phase = "gameover";
    state.drawerId = null;
    state.giverId = null;
    state.word = null;
    state.phaseEndsAt = 0;
    return;
  }
  const n = state.order.length;
  for (let hop = 1; hop <= n; hop++) {
    const idx = (state.turnIndex + hop) % n;
    const p = state.players.find((x) => x.id === state.order[idx]);
    if (p?.connected) {
      state.round = round;
      state.turnIndex = idx;
      beginChoosing(state, now);
      return;
    }
  }
  // everybody has wandered off — hold, don't end
  state.phase = "reveal";
  state.drawerId = null;
  state.phaseEndsAt = now + 25_000;
}

/** Host deliberately calls it a night. */
export function endGame(state: RoomState): void {
  if (state.phase === "lobby" || state.phase === "gameover")
    throw new GameError("No game running");
  state.phase = "gameover";
  state.drawerId = null;
  state.giverId = null;
  state.word = null;
  state.phaseEndsAt = 0;
}

export function playAgain(state: RoomState): void {
  if (state.phase !== "gameover") throw new GameError("Game not over");
  state.phase = "lobby";
  state.drawerId = null;
  state.giverId = null;
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
  if (playerId === state.drawerId || playerId === state.giverId)
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

/**
 * End the current turn early — the host skipping a stuck player, or the
 * drawer passing on their own turn.
 */
export function skipTurn(state: RoomState, now: number): void {
  if (state.phase === "choosing") {
    // no word was ever chosen, so there is nothing to reveal
    state.word = null;
    endTurn(state, now, true);
  } else if (state.phase === "drawing") {
    // a word WAS chosen: reveal it (and the drawing) and keep any points
    // guessers already earned
    endTurn(state, now, false);
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
  if (state.giverId === targetId)
    state.giverId =
      state.phase === "choosing" ? giverFor(state, state.drawerId ?? "") : null;
  if (isDrawathon(state)) {
    if (wasDrawer && state.phase === "choosing" && state.wordChoices.length)
      beginDrawing(state, state.wordChoices[0], now);
    else if (state.phase === "drawing" && everyoneDone(state))
      endTurn(state, now, false);
    return;
  }
  if (wasDrawer && (state.phase === "choosing" || state.phase === "drawing")) {
    if (state.phase === "choosing") state.word = null;
    endTurn(state, now, Object.keys(state.guessed).length === 0);
  }
}

/**
 * Change your own name and face between games.
 *
 * Allowed in the lobby and on the results screen only: a name changing
 * mid-turn would rewrite the guess feed everyone is reading, and "Play again"
 * is exactly the moment somebody wants to stop being whatever they typed in a
 * hurry twenty minutes ago. Everything else about the seat — score, turn
 * order, hint tokens — is left alone.
 */
export function renamePlayer(
  state: RoomState,
  playerId: string,
  rawName: string,
  avatar?: string
): void {
  if (state.phase !== "lobby" && state.phase !== "gameover")
    throw new GameError("Finish the round first");
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new GameError("Unknown player");

  const wanted = rawName.trim().slice(0, 20);
  if (!wanted) throw new GameError("Names can't be empty");
  // the same auto-suffix the join gate uses, so two Sams stay tellable apart
  const taken = new Set(
    state.players
      .filter((p) => p.id !== playerId)
      .map((p) => p.name.toLowerCase())
  );
  let name = wanted;
  if (taken.has(name.toLowerCase())) {
    let n = 2;
    while (taken.has(`${wanted} (${n})`.toLowerCase())) n++;
    name = `${wanted} (${n})`.slice(0, 24);
  }
  me.name = name;
  if (avatar && /^a([0-9]|[1-3][0-9])$/.test(avatar)) me.avatar = avatar;
}

export function markConnected(
  state: RoomState,
  playerId: string,
  connected: boolean
): void {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return;
  p.connected = connected;
  // the giver closing their tab mid-pick would otherwise strand the turn
  // until the clock ran out
  if (!connected && state.giverId === playerId && state.phase === "choosing")
    state.giverId = giverFor(state, state.drawerId ?? "");
  if (!connected && state.hostId === playerId) {
    const next = state.players.find((x) => x.connected && !x.isBot);
    if (next) state.hostId = next.id;
  }
  // the person who made the room gets it back when they walk in again —
  // otherwise a dropped signal permanently demotes whoever set the game up
  if (connected && state.founderId === playerId) state.hostId = playerId;
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
  const isGiver = playerId !== null && playerId === state.giverId;
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
    // rooms created before giver mode existed have no such field
    giverId: state.giverId ?? null,
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
    themePacks: state.settings.themePacks ?? null,
    wordSalt: state.wordSalt,
    wordCursor: state.wordCursor,
    waiting:
      state.phase !== "lobby" &&
      state.phase !== "gameover" &&
      state.players.filter((p) => p.connected).length <
        (isDrawathon(state) ? 1 : 2),
    lastTurn:
      state.phase === "reveal" || state.phase === "gameover"
        ? state.lastTurn
        : null,
    // the giver has known the word since they set it, so hiding it from them
    // would only mean they cannot follow their own turn
    // a draw-a-thon's word is public, so even the broadcast carries it
    yourWord:
      (isDrawer || isGiver || hasGuessed || isDrawathon(state)) &&
      state.phase === "drawing"
        ? state.word
        : undefined,
    // in giver mode the shortlist belongs to the giver, and the drawer must
    // not see it — three words containing the answer is most of the answer
    yourChoices:
      (state.giverId ? isGiver : isDrawer) && state.phase === "choosing"
        ? state.wordChoices
        : undefined,
    yourChoiceTiers:
      (state.giverId ? isGiver : isDrawer) && state.phase === "choosing"
        ? state.wordChoiceTiers
        : undefined,
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
