import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DifficultyId, RoundOutcome } from "@/engine/types";

/** One finished FIRST TX round. */
export interface RunRecord {
  id: string;
  /** Wall-clock ms the round ended. */
  at: number;
  difficulty: DifficultyId;
  training: boolean;
  /** Older records have no length: they were Blitz. */
  length?: "blitz" | "saga";
  outcome: RoundOutcome;
  reactionMs: number | null;
  score: number;
  ticker: string;
  /** Right coin landed, ms after the tweet. */
  rightAppearMs: number | null;
  decoys: number;
  buyNumber: number | null;
  pnlPct: number;
}

const CAP = 300;

interface RunsState {
  runs: RunRecord[];
  add: (r: RunRecord) => void;
  clear: () => void;
}

/** Every finished round, kept in this browser: personal bests and stats are worked out from this. */
export const useRuns = create<RunsState>()(
  persist(
    (set) => ({
      runs: [],
      add: (r) => set((s) => (s.runs.some((x) => x.id === r.id) ? s : { runs: [...s.runs, r].slice(-CAP) })),
      clear: () => set({ runs: [] }),
    }),
    { name: "gngm.runs.v1", storage: createJSONStorage(() => localStorage) },
  ),
);

/** When this tab opened: "this session" means runs since then. */
export const SESSION_START = typeof window === "undefined" ? 0 : Date.now();

export interface RunStats {
  /** Strict rounds only: training never sets a PB. */
  pbReactionMs: number | null;
  pbScore: number | null;
  runs: number;
  hits: number;
  accuracyPct: number | null;
  avgReactionMs: number | null;
  bestStreak: number;
  streak: number;
}

export function statsFor(
  runs: readonly RunRecord[],
  difficulty: DifficultyId,
  opts: { since?: number; length?: "blitz" | "saga" } = {},
): RunStats {
  const len = opts.length ?? "blitz";
  const mine = runs.filter((r) => r.difficulty === difficulty && (r.length ?? "blitz") === len && r.at >= (opts.since ?? 0));
  const strictHits = mine.filter((r) => !r.training && r.outcome === "success" && r.reactionMs !== null);
  const hits = mine.filter((r) => r.outcome === "success" && r.reactionMs !== null);
  let streak = 0;
  let best = 0;
  for (const r of mine) {
    streak = r.outcome === "success" ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  return {
    pbReactionMs: strictHits.length ? Math.min(...strictHits.map((r) => r.reactionMs!)) : null,
    pbScore: strictHits.length ? Math.max(...strictHits.map((r) => r.score)) : null,
    runs: mine.length,
    hits: hits.length,
    accuracyPct: mine.length ? (hits.length / mine.length) * 100 : null,
    avgReactionMs: hits.length ? hits.reduce((n, r) => n + r.reactionMs!, 0) / hits.length : null,
    bestStreak: best,
    streak,
  };
}
