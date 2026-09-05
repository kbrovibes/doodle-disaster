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

/**
 * A short code you can read out across a room. No O/0/I/1 so nobody has to
 * ask "is that a one or an el". Stored lowercase (routes lowercase the id);
 * always SHOWN uppercase via roomCode().
 */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function goofyRoomId(): string {
  let s = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

/** How a room id is shown to humans. */
export function roomCode(id: string): string {
  return id.length <= 6 ? id.toUpperCase() : id;
}

// tokens rendered by <PlayerAvatar> as proprietary doodle-critter glyphs
export const AVATARS = Array.from({ length: 40 }, (_, i) => `a${i}`);

export function pickAvatar(taken: string[]): string {
  const free = AVATARS.filter((a) => !taken.includes(a));
  const pool = free.length > 0 ? free : AVATARS;
  return pool[Math.floor(Math.random() * pool.length)];
}
