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
  difficulty: "easy" | "medium" | "hard";
}

/** Full server-side state, stored in Postgres. Never sent raw to clients. */
export interface RoomState {
  phase: Phase;
  players: Player[];
  hostId: string;
  settings: Settings;
  order: string[]; // player ids in draw order for current game
  round: number; // 1-based
  turnIndex: number; // index into order
  drawerId: string | null;
  wordChoices: string[]; // secret: only for drawer
  wordChoiceTiers?: string[];
  word: string | null; // secret
  phaseEndsAt: number; // epoch ms
  guessed: Record<string, number>; // playerId -> points earned this turn
  personalHints?: Record<string, number[]>; // playerId -> extra revealed letter indices (this turn)
  drawerPoints: number;
  usedWords: string[];
  customWords?: {
    theme: string;
    easy: string[];
    normal: string[];
    chaos: string[];
  } | null;
  lastTurn: {
    word: string;
    drawerId: string;
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
  order: string[]; // public draw order (for "next to draw" indicators)
  mask: string | null; // e.g. "___ _____" with hints filled in: "a__ _r___"
  wordLen: number[]; // word shape as segment lengths
  phaseEndsAt: number;
  serverNow: number;
  guessedIds: string[];
  theme?: string | null;
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
