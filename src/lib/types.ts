export type Phase = "lobby" | "choosing" | "drawing" | "reveal" | "gameover";

export interface Player {
  id: string;
  name: string;
  avatar: string; // avatar token ("a3") rendered as a doodle critter
  score: number;
  connected: boolean;
  joinedAt: number;
  hints?: number; // personal hint tokens (default 1)
  hintStreak?: number; // correct guesses toward the next replenish
  isBot?: boolean;
}

export interface Settings {
  rounds: number; // full cycles through all players
  drawSeconds: number;
  difficulty: "kids" | "medium" | "hard" | "ultra";
  /** keys of the predefined theme packs in play; empty = the whole bank */
  themePacks?: string[] | null;
  /**
   * Where the drawer's word comes from. "bank" is the classic game: the
   * drawer picks one of three off the deck. "giver" hands the choice to
   * another player each turn — see giverFor() in engine.ts.
   */
  wordSource?: "bank" | "giver";
  /**
   * "classic" is draw-and-guess. "drawathon" has no guessing at all: every
   * round one player picks a word, everybody draws it on their own board, and
   * the drawings are laid side by side at the end. Playable solo.
   */
  mode?: GameMode;
}

export type GameMode = "classic" | "drawathon";

/** Full server-side state, stored in Postgres. Never sent raw to clients. */
export interface RoomState {
  phase: Phase;
  players: Player[];
  hostId: string;
  /** whoever made the room — they get the crown back when they return */
  founderId?: string;
  settings: Settings;
  order: string[]; // player ids in draw order for current game
  round: number; // 1-based
  turnIndex: number; // index into order
  drawerId: string | null;
  /**
   * The player setting this turn's word, in "giver" mode. Null whenever the
   * drawer picks for themselves — a bot drawing, too few players, nobody
   * eligible — so every read of it doubles as "are we in giver mode *now*".
   */
  giverId: string | null;
  wordChoices: string[]; // secret: only for whoever is picking
  wordChoiceTiers?: string[];
  word: string | null; // secret
  phaseEndsAt: number; // epoch ms
  /** playerId -> points earned this turn; in a draw-a-thon, who has hit "done" */
  guessed: Record<string, number>;
  personalHints?: Record<string, number[]>; // playerId -> extra revealed letter indices (this turn)
  drawerPoints: number;
  usedWords: string[];
  /** every word we've *shown* on the pick screen, chosen or not */
  offeredWords?: string[];
  /** this group's shuffle of the bank + how far round the ring we are */
  wordSalt?: number;
  wordCursor?: Record<string, number>;
  customWords?: {
    theme: string;
    easy: string[];
    normal: string[];
    chaos: string[];
  } | null;
  lastTurn: {
    word: string;
    drawerId: string;
    /** who set the word, when it wasn't the drawer */
    giverId?: string | null;
    deltas: Record<string, number>;
    everyoneGuessed: boolean;
    skipped?: boolean;
  } | null;
}

/** What every client is allowed to see. */
export interface ClientState {
  phase: Phase;
  players: Player[];
  hostId: string;
  settings: Settings;
  round: number;
  totalRounds: number;
  turnIndex: number;
  turnsPerRound: number;
  drawerId: string | null;
  /** public: everyone needs to know who is sitting this one out */
  giverId: string | null;
  order: string[]; // public draw order (for "next to draw" indicators)
  mask: string | null; // e.g. "___ _____" with hints filled in: "a__ _r___"
  wordLen: number[]; // word shape as segment lengths
  phaseEndsAt: number;
  serverNow: number;
  guessedIds: string[];
  theme?: string | null;
  themePacks?: string[] | null;
  wordSalt?: number;
  wordCursor?: Record<string, number>;
  /** too few players connected — the game is held open, not over */
  waiting?: boolean;
  lastTurn: RoomState["lastTurn"];
  // private extras (only when requester is drawer)
  yourWord?: string | null;
  yourChoices?: string[];
  yourChoiceTiers?: string[];
  yourHints?: number; // hint tokens you can spend
  yourHintProgress?: number; // correct guesses toward the next token (of 5)
}

export type StrokeTool = "pen" | "eraser" | "fill";

export interface StrokeMsg {
  sid: string; // stroke id
  tool: StrokeTool;
  color: string;
  size: number; // brush px in virtual 1000-space
  pts: number[]; // flat x,y quantized 0..1000
  done?: boolean;
}

export interface ChatMsg {
  id: string;
  from: string; // player id
  name: string;
  avatar: string;
  text: string;
  kind: "guess" | "system" | "correct" | "close" | "whisper";
  ts: number;
}
