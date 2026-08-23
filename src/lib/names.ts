const ADJ = [
  "wobbly", "sneaky", "soggy", "funky", "grumpy", "sparkly", "wiggly",
  "cranky", "zesty", "goofy", "spicy", "fluffy", "jazzy", "squishy",
  "dizzy", "sassy", "crusty", "bouncy", "chunky", "slippery", "feral",
  "majestic", "suspicious", "dramatic", "chaotic", "turbo", "mega",
  "sleepy", "screaming", "dancing", "flying", "spinning", "angry",
] as const;

const NOUN = [
  "pickle", "walrus", "noodle", "waffle", "banana", "goblin", "llama",
  "nugget", "potato", "raccoon", "burrito", "penguin", "wombat", "donut",
  "cabbage", "ferret", "mango", "gremlin", "hamster", "meatball", "toad",
  "yeti", "narwhal", "biscuit", "platypus", "dumpling", "goose", "shrimp",
  "muffin", "badger", "turnip", "weasel",
] as const;

const TAIL = [
  "party", "panic", "fiesta", "rodeo", "vortex", "tornado", "parade",
  "riot", "stampede", "disco", "tantrum", "shenanigans", "mayhem",
  "bonanza", "rumble", "chaos", "olympics", "safari", "circus", "heist",
  "karaoke", "jamboree", "uprising", "summit", "wiggle", "boogie",
] as const;

export function goofyRoomId(): string {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(ADJ)}-${pick(NOUN)}-${pick(TAIL)}`;
}

// tokens rendered by <PlayerAvatar> as proprietary doodle-critter glyphs
export const AVATARS = Array.from({ length: 20 }, (_, i) => `a${i}`);

export function pickAvatar(taken: string[]): string {
  const free = AVATARS.filter((a) => !taken.includes(a));
  const pool = free.length > 0 ? free : AVATARS;
  return pool[Math.floor(Math.random() * pool.length)];
}
