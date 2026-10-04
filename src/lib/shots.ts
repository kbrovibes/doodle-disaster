import type { RoomState } from "./types";

/**
 * A drawing's slot in doodle_shots. The game number is part of it because
 * round and turn numbers restart on "Play again" — without it, the second
 * game's drawings landed on top of the first's.
 */
export const SHOT_GAME_STRIDE = 100_000;
export function shotTurn(state: RoomState, slot: number): number {
  return (state.game ?? 0) * SHOT_GAME_STRIDE + state.round * 1000 + slot;
}
export function shotGame(turn: number): number {
  return Math.floor(turn / SHOT_GAME_STRIDE);
}
export function shotRound(turn: number): number {
  return Math.floor((turn % SHOT_GAME_STRIDE) / 1000);
}
