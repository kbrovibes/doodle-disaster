// Curated, drawable, family-friendly. Tiers: 0 = easy, 1 = medium, 2 = spicy.
const EASY = [
  "apple", "banana", "pizza", "burger", "hotdog", "taco", "donut", "cookie",
  "ice cream", "cake", "egg", "cheese", "carrot", "mushroom", "watermelon",
  "grapes", "corn", "pancake", "popcorn", "cupcake", "sandwich", "pretzel",
  "dog", "cat", "fish", "bird", "duck", "pig", "cow", "horse", "sheep",
  "rabbit", "turtle", "snake", "frog", "bee", "ant", "spider", "snail",
  "butterfly", "elephant", "giraffe", "lion", "monkey", "panda", "penguin",
  "whale", "shark", "octopus", "crab", "owl", "bat", "fox", "mouse",
  "sun", "moon", "star", "cloud", "rain", "rainbow", "snowman", "lightning",
  "tree", "flower", "leaf", "cactus", "mountain", "volcano", "beach", "island",
  "house", "door", "window", "bed", "chair", "table", "lamp", "clock",
  "key", "book", "pencil", "scissors", "umbrella", "balloon", "kite", "drum",
  "guitar", "bell", "candle", "ladder", "broom", "hammer", "glasses", "crown",
  "hat", "sock", "shoe", "shirt", "pants", "glove", "ring", "backpack",
  "car", "bus", "train", "boat", "rocket", "airplane", "bicycle", "truck",
  "traffic light", "wheel", "tent", "bridge", "castle", "church", "barn",
  "ball", "dice", "robot", "ghost", "alien", "dragon", "pirate", "wizard",
  "angel", "clown", "king", "queen", "baby", "eye", "nose", "ear", "hand",
  "foot", "tooth", "heart", "smile", "mustache", "beard", "skull", "bone",
  "phone", "camera", "computer", "television", "toilet", "bathtub", "toothbrush",
  "fork", "spoon", "knife", "cup", "bottle", "plate", "pot", "pan",
  "fire", "ice", "snowflake", "wave", "shadow", "hole", "map", "flag",
  "arrow", "anchor", "magnet", "battery", "lightbulb", "envelope", "gift",
  "trophy", "medal", "coin", "money", "diamond", "pumpkin", "candy",
  "dinosaur", "puppy", "kitten", "zebra", "hippo", "gorilla", "crocodile",
  "dolphin", "seal", "starfish", "ladybug", "caterpillar", "worm", "rooster",
  "goat", "donkey", "teddy bear", "lollipop", "school bus", "fire truck",
  "tractor", "football", "basketball", "crayon", "paintbrush", "swing",
] as const;

const MEDIUM = [
  "treasure chest", "campfire", "waterfall", "lighthouse", "windmill",
  "ferris wheel", "roller coaster", "merry-go-round", "seesaw", "slide",
  "swimming pool", "sandcastle", "scarecrow", "birdhouse", "beehive",
  "spider web", "bird nest", "aquarium", "cage", "dog house",
  "police officer", "firefighter", "astronaut", "ninja", "mermaid",
  "vampire", "zombie", "mummy", "fairy", "genie", "superhero", "cowboy",
  "chef", "doctor", "farmer", "teacher", "magician", "juggler",
  "sneeze", "yawn", "hiccup", "whisper", "dream", "nightmare", "headache",
  "dizzy", "sweat", "goosebumps", "blush", "wink", "high five", "handshake",
  "hug", "dance", "sleepwalk", "snore", "burp", "cartwheel", "push-up",
  "karate", "yoga", "surfing", "skiing", "fishing", "bowling", "darts",
  "hopscotch", "tug of war", "hide and seek", "limbo", "arm wrestling",
  "telescope", "microscope", "binoculars", "compass", "stethoscope",
  "wheelbarrow", "lawnmower", "vacuum", "blender", "toaster", "microwave",
  "washing machine", "fire hydrant", "mailbox", "street lamp", "manhole",
  "escalator", "elevator", "revolving door", "vending machine", "atm",
  "parachute", "hot air balloon", "submarine", "helicopter", "canoe",
  "skateboard", "scooter", "unicycle", "sled", "jet ski", "gondola",
  "porcupine", "hedgehog", "platypus", "flamingo", "peacock", "ostrich",
  "kangaroo", "koala", "sloth", "chameleon", "jellyfish", "seahorse",
  "lobster", "walrus", "beaver", "raccoon", "skunk", "moose", "camel",
  "hamster", "parrot", "toucan", "pelican", "swan", "woodpecker",
  "avalanche", "earthquake", "tornado", "eclipse", "meteor", "quicksand",
  "iceberg", "geyser", "canyon", "desert", "jungle", "swamp", "cave",
  "constellation", "galaxy", "satellite", "footprint", "fingerprint",
  "x-ray", "hourglass", "metronome", "boomerang", "slingshot", "trampoline",
  "piñata", "confetti", "fireworks", "bubble bath", "lava lamp", "disco ball",
  "wind chime", "dream catcher", "snow globe", "music box", "puppet",
  "domino", "jigsaw puzzle", "rubik's cube", "yo-yo", "pinwheel", "origami",
  "watermelon slice", "corn dog", "french fries", "spaghetti", "sushi",
  "burrito", "croissant", "waffle", "gingerbread man", "fortune cookie",
  "milkshake", "lemonade", "barbecue", "picnic", "food truck",
  "wedding", "birthday party", "graduation", "campsite", "parade",
  "traffic jam", "car wash", "drive-thru", "garage sale", "lemonade stand",
] as const;

const SPICY = [
  "deja vu", "gravity", "wifi", "echo", "silence", "monday", "jet lag",
  "brain freeze", "writer's block", "midlife crisis", "small talk",
  "awkward silence", "food coma", "bad hair day", "photobomb", "selfie",
  "influencer", "podcast", "spam", "autocorrect", "buffering", "low battery",
  "airplane mode", "screenshot", "voicemail", "group chat", "mansplaining",
  "procrastination", "claustrophobia", "insomnia", "amnesia", "allergy",
  "karma", "gossip", "sarcasm", "jinx", "curse", "hypnosis", "telepathy",
  "time travel", "parallel universe", "black hole", "big bang", "evolution",
  "extinction", "camouflage", "hibernation", "migration", "metamorphosis",
  "tan line", "sunburn", "paper cut", "static electricity", "pins and needles",
  "stage fright", "trust fall", "eye contact", "personal space", "third wheel",
  "inside joke", "plot twist", "cliffhanger", "spoiler", "binge watching",
  "couch potato", "night owl", "early bird", "sweet tooth", "cold feet",
  "butterflies in stomach", "elephant in the room", "piece of cake",
  "raining cats and dogs", "break a leg", "spill the beans", "couch surfing",
  "optical illusion", "conspiracy theory", "staring contest",
  "secret handshake", "invisible ink", "time capsule", "lie detector",
  "mind reader", "domino effect", "needle in a haystack", "when pigs fly",
  "hold your horses", "butterfingers", "dad joke", "air guitar", "facepalm",
  "mic drop", "slow motion", "poker face", "earworm", "tongue twister",
  "brainstorm", "comfort zone", "reply all",
] as const;

export type WordTier = "easy" | "normal" | "chaos";
export type Difficulty = "easy" | "medium" | "hard";

const POOLS: Record<WordTier, readonly string[]> = {
  easy: EASY,
  normal: MEDIUM,
  chaos: SPICY,
};

/**
 * Deal a word from a pool like a deck: never a word the room has played
 * while unplayed ones remain; once a pool is exhausted, recycle from the
 * LEAST-recently-played third so repeats land as far apart as possible.
 * `used` is a recency list, oldest first.
 */
function deal(
  tier: WordTier,
  used: string[],
  taken: Set<string>,
  pools: Record<WordTier, readonly string[]> = POOLS
): string {
  const pool = pools[tier];
  const usedSet = new Set(used.map((w) => w.toLowerCase()));
  const fresh = pool.filter(
    (w) => !usedSet.has(w.toLowerCase()) && !taken.has(w)
  );
  if (fresh.length > 0) {
    return fresh[Math.floor(Math.random() * fresh.length)];
  }
  const age = (w: string) => used.lastIndexOf(w.toLowerCase()); // -1 impossible here
  const byAge = pool
    .filter((w) => !taken.has(w))
    .sort((a, b) => age(a) - age(b));
  const windowSize = Math.max(1, Math.floor(byAge.length / 3));
  return byAge[Math.floor(Math.random() * windowSize)];
}

/**
 * The three choices per difficulty. Index 0 is always the escape hatch —
 * the easiest word on offer (auto-pick takes it on timeout).
 *
 *   easy   -> [easy, easy, easy]           kids & first-timers
 *   medium -> [easy, normal, wildcard]     the sweet spot (45% chaos wildcard)
 *   hard   -> [normal, chaos, chaos*]      still fun, but you'll sweat
 *                                          (*35% mercy downgrade to normal)
 */
export function pickWordChoices(
  used: string[],
  difficulty: Difficulty = "medium",
  custom?: { easy: string[]; normal: string[]; chaos: string[] }
): { words: string[]; tiers: WordTier[] } {
  const pools: Record<WordTier, readonly string[]> = custom
    ? { easy: custom.easy, normal: custom.normal, chaos: custom.chaos }
    : POOLS;
  let recipe: WordTier[];
  switch (difficulty) {
    case "easy":
      recipe = ["easy", "easy", "easy"];
      break;
    case "hard":
      recipe = [
        "normal",
        "chaos",
        Math.random() < 0.35 ? "normal" : "chaos",
      ];
      break;
    default:
      recipe = ["easy", "normal", Math.random() < 0.45 ? "chaos" : "normal"];
  }
  const taken = new Set<string>();
  const words: string[] = [];
  const tiers: WordTier[] = [];
  for (const tier of recipe) {
    const w = deal(tier, used, taken, pools);
    taken.add(w);
    words.push(w);
    tiers.push(tier);
  }
  return { words, tiers };
}
