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

// ------------------------------------------------------------------ KOL Rep

/** KOL tiers: Rep points where each starts, and followers at that point. */
export const KOL_TIERS: { name: string; at: number; followers: number }[] = [
  { name: "Nobody", at: 0, followers: 0 },
  { name: "Anon Caller", at: 30, followers: 50 },
  { name: "Micro KOL", at: 120, followers: 500 },
  { name: "Rising", at: 400, followers: 2000 },
  { name: "KOL", at: 1200, followers: 10000 },
  { name: "Big KOL", at: 3500, followers: 50000 },
];
/** Tier where your own bubble shows on the chart. */
export const KOL_BUBBLE_TIER = 3;

export const kolTier = (points: number): number => KOL_TIERS.reduce((t, k, i) => (points >= k.at ? i : t), 0);

/** Followers grow smoothly between tiers (and keep growing past Big KOL, slowly). */
export function followersFor(points: number): number {
  const t = kolTier(points);
  const a = KOL_TIERS[t];
  const b = KOL_TIERS[t + 1] ?? { at: a.at * 2.3, followers: a.followers * 2 };
  if (t === 0) return Math.round((points / KOL_TIERS[1].at) * 20);
  const f = Math.min(1.5, (points - a.at) / (b.at - a.at));
  return Math.round(a.followers * Math.pow(b.followers / a.followers, f));
}

/**
 * KOL Rep for one round: good trades build it, getting rugged and dumping on your followers cost it, and a call
 * you posted pays (or costs) extra depending on how it played out.
 */
export function kolRepFor(r: RoundResult): { label: string; rep: number }[] {
  const out: { label: string; rep: number }[] = [];
  const success = r.outcome === "success";
  if (success && r.pnlPct > 0) out.push({ label: `Profitable trade (+${Math.round(r.pnlPct)}%)`, rep: Math.round(Math.min(30, 3 + r.pnlPct / 25)) });
  if (success && r.buyNumber !== null && r.buyNumber <= 5) out.push({ label: "Early on the right coin", rep: 4 });
  if (r.boughtSol > 0 && r.pnlPct <= -60) out.push({ label: "Got rugged holding", rep: -10 });
  if (r.kol.called && r.pnlPct >= 50) out.push({ label: "Your call played out", rep: 10 });
  if (r.kol.called && r.pnlPct <= -30) out.push({ label: "Bad call", rep: -10 });
  if (r.kol.dumpedOn > 0) out.push({ label: `Dumped on ${r.kol.dumpedOn} follower${r.kol.dumpedOn > 1 ? "s" : ""}`, rep: -Math.min(30, r.kol.dumpedOn * 6) });
  return out;
}

export interface CampaignProgress {
  xp: number;
  /** KOL Rep points (counted from campaign level 8). */
  kolPoints: number;
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
  /** KOL Rep this round (empty before level 8). */
  kolLines: { label: string; rep: number }[];
  kolBefore: number;
  kolAfter: number;
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
  // KOL Rep counts once your following is unlocked (level 8).
  const kolLines = featuresFor(levelBefore).kolRep ? kolRepFor(r) : [];
  const kolPoints = Math.max(0, p.kolPoints + kolLines.reduce((n, l) => n + l.rep, 0));
  const next: CampaignProgress = { xp, kolPoints, traderSol: solAfter, rounds: p.rounds + 1, streak, firsts };
  return {
    next,
    award: {
      lines,
      xp: lines.reduce((n, l) => n + l.xp, 0),
      levelBefore,
      levelAfter: levelForXp(xp),
      solBefore: p.traderSol,
      solAfter,
      bust,
      kolLines,
      kolBefore: p.kolPoints,
      kolAfter: kolPoints,
    },
  };
}
