/** Reaction-time bands for a scored FIRST TX buy, in ms from the right coin landing. */
const BANDS: [number, string][] = [
  [300, "Bot speed"],
  [600, "Elite"],
  [1000, "Fast"],
  [1500, "Solid"],
  [2500, "Slow"],
];

export function ratingFor(reactionMs: number): string {
  for (const [limit, label] of BANDS) if (reactionMs < limit) return label;
  return "Too slow";
}

/** Auto-end thresholds, in ms after the tweet. */
export const MISS_AFTER_MS = 20000;
export const MAX_ROUND_MS = 90000;
export const COUNTDOWN_MS = 3000;
/** The big tweet can land anywhere in the first minute, so the player has to keep watching the tracker. */
export const ARMED_WAIT_MS: [number, number] = [4000, 55000];
