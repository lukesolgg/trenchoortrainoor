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

/**
 * Round score out of 1000. Only a correct buy scores.
 * - Speed, up to 800: full marks at 150 ms or faster, falling linearly to 0 at 3000 ms.
 * - Entry, up to 100: buyer #1-5 gets it all, falling to 0 by buyer #40.
 * - Exit, up to 100: realised PnL, 0 at break-even or worse, full at +200%.
 * - Training only: minus 150 for every wrong coin bought on the way.
 */
export const SCORE = { speedMax: 800, entryMax: 100, exitMax: 100, wrongPenalty: 150, fastMs: 150, slowMs: 3000 } as const;

export interface ScoreParts {
  speed: number;
  entry: number;
  exit: number;
  penalty: number;
  total: number;
}

export function scoreRound(o: { success: boolean; reactionMs: number | null; buyNumber: number | null; pnlPct: number; wrongBuys: number }): ScoreParts {
  if (!o.success || o.reactionMs === null) return { speed: 0, entry: 0, exit: 0, penalty: 0, total: 0 };
  const r = Math.max(0, o.reactionMs);
  const speed = Math.round(SCORE.speedMax * Math.max(0, Math.min(1, 1 - (r - SCORE.fastMs) / (SCORE.slowMs - SCORE.fastMs))));
  const n = o.buyNumber ?? 99;
  const entry = Math.round(SCORE.entryMax * Math.max(0, Math.min(1, 1 - (n - 5) / 35)));
  const exit = Math.round(SCORE.exitMax * Math.max(0, Math.min(1, o.pnlPct / 200)));
  const penalty = o.wrongBuys * SCORE.wrongPenalty;
  return { speed, entry, exit, penalty, total: Math.max(0, speed + entry + exit - penalty) };
}
