import { EASY } from "./wordbank/easy";
import { MEDIUM } from "./wordbank/medium";
import { MEDIUM2 } from "./wordbank/medium2";
import { MEDIUM3 } from "./wordbank/medium3";
import { HARD } from "./wordbank/hard";
import { HARD2 } from "./wordbank/hard2";
import { HARD3 } from "./wordbank/hard3";
import { HARD4 } from "./wordbank/hard4";
import { ULTRA } from "./wordbank/ultra";
import { ULTRA2 } from "./wordbank/ultra2";
import { ULTRA3 } from "./wordbank/ultra3";
import { ULTRA4 } from "./wordbank/ultra4";
import { ULTRA5 } from "./wordbank/ultra5";
import { themeWords } from "./wordbank/themes";

/**
 * The KIDS difficulty deals from the "kids" tier, and medium deals one word
 * from it too — a gentle opener is exactly what that recipe wants.
 */
export type WordTier = "kids" | "normal" | "chaos" | "ultra";
export type Difficulty = "kids" | "medium" | "hard" | "ultra";

const TIERS: WordTier[] = ["kids", "normal", "chaos", "ultra"];

const RAW: Record<WordTier, string[]> = {
  kids: EASY,
  normal: [...MEDIUM, ...MEDIUM2, ...MEDIUM3],
  chaos: [...HARD, ...HARD2, ...HARD3, ...HARD4],
  ultra: [...ULTRA, ...ULTRA2, ...ULTRA3, ...ULTRA4, ...ULTRA5],
};

/**
 * House rules for anything that reaches a player:
 *   - plain a-z and single spaces (the in-app keyboard has nothing else)
 *   - at most TWO words: a phrase is a charade, not a pictionary word
 *   - one word belongs to exactly one tier, easiest wins
 */
export function isPlayable(w: string): boolean {
  return /^[a-z]+( [a-z]+)?$/.test(w) && w.length <= 26;
}

/**
 * Theme packs get one more word than the main bank. Names are the reason:
 * "shah rukh khan" and "sanjay leela bhansali" are the whole point of a
 * celebrity pack, and they are not phrases — everybody shouts them as a unit.
 */
export function isPlayableTheme(w: string): boolean {
  return /^[a-z]+( [a-z]+){0,3}$/.test(w) && w.length <= 34;
}

const POOLS: Record<WordTier, readonly string[]> = (() => {
  const seen = new Set<string>();
  const out = {} as Record<WordTier, string[]>;
  for (const tier of TIERS) {
    out[tier] = RAW[tier].filter((raw) => {
      const w = raw.toLowerCase().trim();
      if (!isPlayable(w) || seen.has(w)) return false;
      seen.add(w);
      return true;
    });
  }
  return out;
})();

export const POOL_SIZES = {
  kids: POOLS.kids.length,
  normal: POOLS.normal.length,
  chaos: POOLS.chaos.length,
  ultra: POOLS.ultra.length,
  total: TIERS.reduce((n, t) => n + POOLS[t].length, 0),
};

// --- the ring ------------------------------------------------------------

export type Cursor = Partial<Record<WordTier, number>>;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A group's own shuffle of the bank. Stable for a given salt, forever. */
export function saltFromNames(names: string[], extra = ""): number {
  const key =
    extra +
    "|" +
    names
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join(",");
  return fnv1a(key);
}

export function randomSalt(): number {
  const b = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    crypto.getRandomValues(b);
  else b[0] = Math.floor(Math.random() * 0xffffffff);
  return b[0] >>> 0;
}

const deckCache = new Map<string, string[]>();

function deckFor(tier: string, salt: number, pool: readonly string[]): string[] {
  const key = `${tier}:${salt}:${pool.length}:${pool[0] ?? ""}`;
  const hit = deckCache.get(key);
  if (hit) return hit;
  const rnd = mulberry32((salt ^ fnv1a(tier)) >>> 0);
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (deckCache.size > 48) deckCache.clear();
  deckCache.set(key, arr);
  return arr;
}

/**
 * The three choices per difficulty, dealt off the top of a circular deck.
 *
 * This is the whole anti-repeat design. Each tier is shuffled once per group
 * into a fixed ring, and a CURSOR walks it forward — so a word cannot come
 * round again until every other word in that tier has been dealt. The cursor
 * is carried between games (see lib/played.ts), which is the part that was
 * missing before: every fresh room used to restart at position zero and deal
 * the same opening words as the last one.
 *
 *   kids   -> [kids, kids, kids]         under-sevens and first-timers
 *   medium -> [kids, normal, wildcard]   the sweet spot (40% hard wildcard)
 *   hard   -> [normal, chaos, chaos]     you will sweat
 *   ultra  -> [ultra, ultra, ultra]      no mercy, no nouns
 *   theme  -> three from the pack, whatever the difficulty
 */
export function pickWordChoices(
  cursor: Cursor,
  difficulty: Difficulty = "medium",
  opts?: { salt?: number; themes?: string[] | null; custom?: string[] }
): { words: string[]; tiers: WordTier[]; cursor: Cursor } {
  const salt = opts?.salt ?? 0;
  // several packs simply union into one bigger word space
  const picked = (opts?.custom ?? themeWords(opts?.themes)).filter(isPlayableTheme);

  // a theme (or a hand-typed pack) replaces every tier with itself
  if (picked.length >= 3) {
    const deck = deckFor("theme", salt, picked);
    const at = cursor.kids ?? 0;
    const words = [0, 1, 2].map((i) => deck[(at + i) % deck.length]);
    return {
      words,
      tiers: ["normal", "normal", "normal"],
      cursor: { ...cursor, kids: (at + 3) % deck.length },
    };
  }

  const rnd = mulberry32((salt ^ ((cursor.kids ?? 0) + 1) * 2654435761) >>> 0);
  let recipe: WordTier[];
  switch (difficulty) {
    case "kids":
      recipe = ["kids", "kids", "kids"];
      break;
    case "hard":
      recipe = ["normal", "chaos", "chaos"];
      break;
    case "ultra":
      recipe = ["ultra", "ultra", "ultra"];
      break;
    default:
      recipe = ["kids", "normal", rnd() < 0.4 ? "chaos" : "normal"];
  }

  const next: Cursor = { ...cursor };
  const taken = new Set<string>();
  const words: string[] = [];
  const tiers: WordTier[] = [];

  for (const tier of recipe) {
    const deck = deckFor(tier, salt, POOLS[tier]);
    let at = next[tier] ?? 0;
    let word = deck[at % deck.length];
    // only ever skips inside one hand, so the ring order is preserved
    let guard = 0;
    while (taken.has(word) && guard++ < deck.length) {
      at += 1;
      word = deck[at % deck.length];
    }
    taken.add(word);
    words.push(word);
    tiers.push(tier);
    next[tier] = (at + 1) % deck.length;
  }

  return { words, tiers, cursor: next };
}
