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

/**
 * Saga score out of 1000: your first reaction, how fast you got onto each new narrative, and what you made.
 * - No vamps: speed 600, entry 100, exit 300 (realised PnL across the round, full at +300%).
 * - With vamps: speed 450, entry 100, vamps 200 (split evenly, each speed-scored like the first; a missed vamp is 0),
 *   exit 250.
 * - Minus 150 per wrong buy in Training, and minus 100 per vamp look-alike bought (both styles).
 */
export function scoreSaga(o: {
  success: boolean;
  reactionMs: number | null;
  buyNumber: number | null;
  pnlPct: number;
  wrongBuys: number;
  vampReactions: (number | null)[];
  vampWrong: number;
}): ScoreParts & { vamps: number } {
  if (!o.success || o.reactionMs === null) return { speed: 0, entry: 0, exit: 0, penalty: 0, vamps: 0, total: 0 };
  const has = o.vampReactions.length > 0;
  const speedMax = has ? 450 : 600;
  const exitMax = has ? 250 : 300;
  const speedOf = (ms: number) => Math.max(0, Math.min(1, 1 - (ms - SCORE.fastMs) / (SCORE.slowMs - SCORE.fastMs)));
  const speed = Math.round(speedMax * speedOf(o.reactionMs));
  const n = o.buyNumber ?? 99;
  const entry = Math.round(SCORE.entryMax * Math.max(0, Math.min(1, 1 - (n - 5) / 35)));
  const exit = Math.round(exitMax * Math.max(0, Math.min(1, o.pnlPct / 300)));
  const vamps = has ? Math.round(o.vampReactions.reduce<number>((t, ms) => t + (ms === null ? 0 : (200 / o.vampReactions.length) * speedOf(ms)), 0)) : 0;
  const penalty = o.wrongBuys * SCORE.wrongPenalty + o.vampWrong * 100;
  return { speed, entry, exit, vamps, penalty, total: Math.max(0, speed + entry + exit + vamps - penalty) };
}
