import { generateText } from "ai";

/**
 * Ask a vision model to guess the pictionary drawing.
 * Returns a normalized guess string, or null if the model is unavailable
 * (no gateway credits, network trouble) — caller then uses the simulator.
 */
export async function visionGuess(
  imageDataUrl: string,
  mask: string,
  attempt: number
): Promise<string | null> {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  try {
    const { text } = await generateText({
      model: "anthropic/claude-haiku-4.5",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are playing pictionary. This is a possibly unfinished drawing. The answer fits this letter pattern (underscores are hidden letters): "${mask}". ${
                attempt <= 1
                  ? "The drawing just started, so guess boldly from little information."
                  : "Take your best guess."
              } Reply with ONLY your guess (the word or phrase, lowercase, no punctuation, no explanation).`,
            },
            { type: "file", mediaType: "image/jpeg", data: base64 },
          ],
        },
      ],
    });
    const guess = text
      .toLowerCase()
      .replace(/["'.!?]/g, "")
      .trim()
      .split("\n")[0]
      .slice(0, 40);
    return guess || null;
  } catch {
    return null;
  }
}

const DECOY_GUESSES = [
  "cat", "house", "sun", "car", "dog", "tree", "fish", "ball", "bird",
  "pizza", "snake", "boat", "hat", "star", "flower", "robot", "cloud",
  "banana", "spider", "rocket",
];

/**
 * Offline bot brain: plausible wrong guesses, with a growing chance of
 * "getting it" on later attempts so turns still resolve. Used only when the
 * vision model is unavailable.
 */
export function simulatedGuess(word: string, attempt: number): string {
  const hitChance = Math.min(0.15 * attempt, 0.5);
  if (Math.random() < hitChance) return word;
  return DECOY_GUESSES[Math.floor(Math.random() * DECOY_GUESSES.length)];
}
