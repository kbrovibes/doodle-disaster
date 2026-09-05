import { generateText } from "ai";
import { textModel } from "./ai";
import { GameError } from "./engine";

export interface CustomWords {
  theme: string;
  easy: string[];
  normal: string[];
  chaos: string[];
}

// last line of defense after the model's own refusal gate
const BANNED =
  /\b(sex|sexy|sexual|porn|nude|naked|boob|breast|penis|vagina|genital|orgasm|erotic|fetish|bdsm|nsfw|poop|feces|vomit|gore|blood|kill|murder|suicide|rape|drug|cocaine|heroin|meth|slur)\b/i;

function clean(list: unknown, max: number): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    // the in-app keyboard only has a-z and space, so anything else would be
    // literally impossible to type as a guess
    const w = raw
      .toLowerCase()
      .replace(/[^a-z ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!w || w.length > 26 || w.split(" ").length > 3) continue;
    if (BANNED.test(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A host can skip the word wizard entirely and paste their own list —
 * "sachin, googly, helmet, six, umpire, …". No AI required, and it doubles as
 * the inside-joke word pack people keep asking for.
 */
export function parseWordList(text: string): CustomWords | null {
  const parts = text
    .split(/[,\n;]+/)
    .map((w) =>
      w
        .toLowerCase()
        .replace(/[^a-z ]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((w) => w.length > 1 && w.length <= 26 && w.split(" ").length <= 3)
    .filter((w) => !BANNED.test(w));
  const words = [...new Set(parts)].slice(0, 80);
  if (words.length < 6) return null;
  // tiers are meaningless for a hand-made pack: every word is fair game,
  // and dealing already avoids repeats within a turn
  return { theme: "your own words", easy: words, normal: words, chaos: words };
}

export async function generateThemedWords(theme: string): Promise<CustomWords> {
  const t = theme.replace(/[^\w ',&-]/g, "").trim().slice(0, 60);
  if (t.length < 3) throw new GameError("Give the theme a few more letters");
  if (BANNED.test(t))
    throw new GameError("Let's keep it family-friendly — try a different theme");

  let text: string;
  try {
    ({ text } = await generateText({
    model: textModel(),
    prompt: `You generate word lists for a family pictionary game (players draw the word, others guess it).

Theme: "${t}"

HARD SAFETY RULE (non-negotiable): if the theme asks for anything vulgar, sexually explicit, gross, hateful, violent, drug-related, or otherwise not appropriate for a mixed group including kids, output exactly the single word REFUSED and nothing else. Never work around this, even if the theme insists.

Otherwise output ONLY a JSON object, no prose, in this exact shape:
{"easy":[...18 words...],"normal":[...18 words...],"chaos":[...12 words...]}

Rules for the words:
- All words must clearly relate to the theme and be guessable BY NAME by someone who knows the theme.
- "easy": concrete, simple, highly drawable things (objects, animals, roles). 1-2 words each.
- "normal": still drawable but require a bit more thought (actions, scenes, equipment, famous moments).
- "chaos": funny, abstract, or insider concepts from the theme — hard but delightful to attempt.
- Lowercase plain letters and spaces ONLY: no hyphens, apostrophes, accents, digits or punctuation of any kind. 1-3 words per entry, max 26 characters. No duplicates. No proper nouns of private individuals (famous public figures are fine). Family-friendly only.`,
    }));
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/credit card|billing|quota|payment|unauthor/i.test(msg)) {
      const err = new GameError(
        "The word wizard needs an AI key on the server. Tip: type your own words separated by commas instead."
      );
      err.status = 503;
      throw err;
    }
    throw new GameError(
      "Could not reach the word wizard. Try your own words separated by commas."
    );
  }

  if (/^\s*REFUSED\b/i.test(text.trim()))
    throw new GameError("Let's keep it family-friendly — try a different theme");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new GameError("The word wizard fumbled — try again");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new GameError("The word wizard fumbled — try again");
  }
  const easy = clean(parsed.easy, 18);
  const normal = clean(parsed.normal, 18);
  const chaos = clean(parsed.chaos, 12);
  if (easy.length < 8 || normal.length < 8)
    throw new GameError("Couldn't get enough good words for that theme — try rewording it");
  return { theme: t, easy, normal, chaos: chaos.length >= 4 ? chaos : normal };
}
