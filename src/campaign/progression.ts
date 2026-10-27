import type { DifficultyId, RoundResult } from "@/engine/types";

/**
 * Trench Academy campaign rules: XP, levels, ranks, what each level unlocks, and how a finished round pays out.
 * Pure functions only; the store (src/store/campaign.ts) keeps the state.
 */

export const MAX_LEVEL = 50;
/** Trader balance you start with, and get topped back up to when you go broke. */
export const START_SOL = 2.5;
export const BUST_BELOW_SOL = 0.5;
/** Opening the dev wallet takes this deposit; each launch needs at least LAUNCH_MIN_SOL in it. */
export const DEV_DEPOSIT_SOL = 10;
export const LAUNCH_MIN_SOL = 5;

/** Total XP needed to reach a level. About 3 rounds to level 2, 40 to level 10, 250 to level 30. */
export const xpForLevel = (level: number): number => (level <= 1 ? 0 : Math.round(150 * Math.pow(level - 1, 1.3)));

export function levelForXp(xp: number): number {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export const RANKS: { from: number; name: string }[] = [
  { from: 1, name: "Fresh Wallet" },
  { from: 3, name: "Paper Hands" },
  { from: 5, name: "Jeeter" },
  { from: 8, name: "Trencher" },
  { from: 11, name: "Degen" },
  { from: 15, name: "Sniper" },
  { from: 20, name: "Chad" },
  { from: 25, name: "Whale" },
  { from: 30, name: "Insider" },
];

export const rankFor = (level: number): string => [...RANKS].reverse().find((r) => level >= r.from)!.name;

/** What a campaign player may use. Standalone modes get everything. */
export interface Features {
  difficulties: DifficultyId[];
  saga: boolean;
  orders: boolean;
  /** Trader wallets: main plus side wallets (1-5). */
  wallets: number;
  boosts: boolean;
  dex: boolean;
  consolidate: boolean;
  kolRep: boolean;
  dev: boolean;
  extraPresets: boolean;
}

export const ALL_FEATURES: Features = {
  difficulties: ["paper", "trencher", "sniper"],
  saga: true,
  orders: true,
  wallets: 5,
  boosts: true,
  dex: true,
  consolidate: true,
  kolRep: true,
  dev: true,
  extraPresets: true,
};

export function featuresFor(level: number): Features {
  return {
    difficulties: ["paper", ...(level >= 2 ? (["trencher"] as const) : []), ...(level >= 10 ? (["sniper"] as const) : [])],
    saga: level >= 4,
    orders: level >= 3,
    wallets: 1 + [5, 8, 11, 18].filter((l) => level >= l).length,
    boosts: level >= 7,
    dex: level >= 10,
    consolidate: level >= 11,
    kolRep: level >= 8,
    dev: level >= 15,
    extraPresets: level >= 20,
  };
}

/**
 * The unlock road, for the hub and level-up cards. `threat` is what the market adds at that level; `threatLive`
 * marks the ones already in the game (the rest are coming).
 */
export const UNLOCKS: { level: number; label: string; threat?: string; threatLive?: boolean }[] = [
  { level: 1, label: "Blitz on Easy · main wallet" },
  { level: 2, label: "Medium difficulty", threat: "Faster look-alikes" },
  { level: 3, label: "Take profit and stop loss orders" },
  { level: 4, label: "Saga rounds", threat: "Vamps", threatLive: true },
  { level: 5, label: "Side wallet 1 · Split ×2", threat: "Deleted tweets" },
  { level: 7, label: "Buy boosts", threat: "Fake authority accounts" },
  { level: 8, label: "Side wallet 2 · KOL Rep" },
  { level: 10, label: "Pay the DEX · Hard difficulty", threat: "Pre-migration rugs" },
  { level: 11, label: "Side wallet 3 · Consolidate", threat: "Bundled launches show" },
  { level: 15, label: "Dev mode (10 SOL deposit)", threat: "KOLs dumping on followers" },
  { level: 18, label: "Side wallet 4" },
  { level: 20, label: "Limit orders · extra preset sets", threat: "Harsher versions of every threat" },
  { level: 25, label: "Whale rank" },
  { level: 30, label: "Insider prestige badge" },
];

export interface CampaignProgress {
  xp: number;
  traderSol: number;
  rounds: number;
  /** Consecutive rounds with the right coin bought. */
  streak: number;
  firsts: { tenX: boolean; vamp: boolean; saga: boolean };
}

export interface Award {
  lines: { label: string; xp: number }[];
  xp: number;
  levelBefore: number;
  levelAfter: number;
  solBefore: number;
  solAfter: number;
  bust: boolean;
}

/**
 * Pay out a finished campaign round: XP from the score (half in Casual), bonuses for firsts and streaks, and the
 * trader balance it ended with. Going broke tops you back up to 2.5 SOL and costs half your progress into the
 * current level (never a level).
 */
export function awardRound(p: CampaignProgress, r: RoundResult, endSol: number): { next: CampaignProgress; award: Award } {
  const lines: Award["lines"] = [];
  const casual = r.training;
  if (r.outcome !== "false_start") {
    const base = Math.max(5, Math.round((r.score / 10) * (casual ? 0.5 : 1)));
    lines.push({ label: casual ? "Round score (Casual: half)" : "Round score", xp: base });
  }
  const success = r.outcome === "success";
  const streak = success ? p.streak + 1 : 0;
  if (streak >= 3) lines.push({ label: `Hit streak ×${streak}`, xp: 10 * (Math.min(streak, 6) - 2) });
  const firsts = { ...p.firsts };
  if (!firsts.tenX && success && r.pnlPct >= 900) {
    firsts.tenX = true;
    lines.push({ label: "First 10× trade", xp: 100 });
  }
  if (!firsts.vamp && r.vamps.some((v) => v.reactionMs !== null)) {
    firsts.vamp = true;
    lines.push({ label: "First vamp caught", xp: 75 });
  }
  if (!firsts.saga && success && r.length === "saga") {
    firsts.saga = true;
    lines.push({ label: "First Saga finished", xp: 50 });
  }
  let xp = p.xp + lines.reduce((n, l) => n + l.xp, 0);
  const levelBefore = levelForXp(p.xp);
  const bust = endSol < BUST_BELOW_SOL;
  let solAfter = Math.max(0, endSol);
  if (bust) {
    const lvl = levelForXp(xp);
    const into = xp - xpForLevel(lvl);
    const lost = Math.floor(into / 2);
    xp -= lost;
    lines.push({ label: `Busted: topped up to ${START_SOL} SOL`, xp: -lost });
    solAfter = START_SOL;
  }
  const next: CampaignProgress = { xp, traderSol: solAfter, rounds: p.rounds + 1, streak, firsts };
  return {
    next,
    award: { lines, xp: lines.reduce((n, l) => n + l.xp, 0), levelBefore, levelAfter: levelForXp(xp), solBefore: p.traderSol, solAfter, bust },
  };
}
