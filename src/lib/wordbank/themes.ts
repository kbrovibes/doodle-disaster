import {
  MOVIES_WORLD,
  BOLLYWOOD,
  MALAYALAM,
  CELEBS_INDIA,
  PLACES_INDIA,
  DESI_LIFE,
  CRICKET_IN,
  NINETIES_IN,
} from "./packs-in";

/**
 * Theme packs, aimed squarely at who actually plays this: Indian friends
 * living abroad, thirties and forties, who share the same films, grounds and
 * childhood adverts. Pick one — or several — and the whole night is drawn
 * from them.
 *
 * Same house rules as the main bank: plain a-z, single spaces, one or two
 * words. Famous public figures are deliberately included; a celebrity pack
 * only works if everybody can shout the name.
 */
export interface ThemePack {
  key: string;
  label: string;
  emoji: string;
  blurb: string;
  words: string[];
  /** the everything-at-once pack builds itself from the others */
  mix?: boolean;
}

const PACKS: ThemePack[] = [
  { key: "bollywood", label: "Bollywood", emoji: "🎬", blurb: "stars, films and every trope", words: BOLLYWOOD },
  { key: "malayalam", label: "Malayalam Movies", emoji: "🥥", blurb: "Mohanlal to Manjummel Boys", words: MALAYALAM },
  { key: "celebs", label: "Famous Indians", emoji: "⭐", blurb: "screen, pitch and beyond", words: CELEBS_INDIA },
  { key: "places", label: "Places in India", emoji: "🛕", blurb: "monuments, cities, hill stations", words: PLACES_INDIA },
  { key: "desi", label: "Desi Life", emoji: "🫖", blurb: "food, festivals, and NRI problems", words: DESI_LIFE },
  { key: "cricket", label: "Cricket", emoji: "🏏", blurb: "gully rules to the World Cup", words: CRICKET_IN },
  { key: "retro", label: "90s India", emoji: "📺", blurb: "Doordarshan, Rasna, STD booths", words: NINETIES_IN },
  { key: "movies", label: "Movies (world)", emoji: "🍿", blurb: "tropes, genres and cinema things", words: MOVIES_WORLD },
];

const MIX: ThemePack = {
  key: "mix",
  label: "The Big Mix",
  emoji: "🎲",
  blurb: "everything above, shuffled together",
  mix: true,
  words: [],
};

export const THEMES: ThemePack[] = [...PACKS, MIX];

function wordsFor(p: ThemePack): string[] {
  return p.mix ? PACKS.flatMap((x) => x.words) : p.words;
}

export function themeByKey(key: string): ThemePack | undefined {
  return THEMES.find((t) => t.key === key);
}

/** The combined word space of however many packs are switched on. */
export function themeWords(keys: string[] | null | undefined): string[] {
  if (!keys?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const pack = themeByKey(k);
    if (!pack) continue;
    for (const w of wordsFor(pack)) {
      const t = w.toLowerCase();
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function themeLabel(keys: string[] | null | undefined): string {
  if (!keys?.length) return "";
  if (keys.length === 1) return themeByKey(keys[0])?.label ?? "";
  return `${keys.length} themes`;
}
