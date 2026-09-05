import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Which brain to use, in preference order:
 *   1. GOOGLE_GENERATIVE_AI_API_KEY -> Gemini Flash Lite (generous free tier)
 *   2. ANTHROPIC_API_KEY            -> Claude Haiku
 *   3. neither                      -> Vercel AI Gateway (needs a card on file)
 *
 * A direct provider key skips the gateway entirely, which is why this exists:
 * the gateway refuses to serve until billing is set up.
 * Override the exact model with AI_MODEL if you want something else.
 */
export function textModel(): LanguageModel {
  const override = process.env.AI_MODEL;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google(override ?? "gemini-2.5-flash-lite");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(override ?? "claude-haiku-4-5-20251001");
  }
  return (override ?? "anthropic/claude-haiku-4.5") as LanguageModel;
}

/** Same choice, but for looking at a drawing (bots guessing). */
export function visionModel(): LanguageModel {
  const override = process.env.AI_VISION_MODEL;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google(override ?? "gemini-2.5-flash");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(override ?? "claude-haiku-4-5-20251001");
  }
  return (override ?? "anthropic/claude-haiku-4.5") as LanguageModel;
}

export function aiConfigured(): boolean {
  return !!(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.ANTHROPIC_API_KEY
  );
}
