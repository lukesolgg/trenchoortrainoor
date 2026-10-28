import { SOL_USD } from "./curve";
import type { Rng } from "./rng";
import type { ArtSpec, CoinConfig, DifficultyId, Launchpad, Meme, Pair } from "./types";

/**
 * Dev mode rules that do not need the engine: the options you pick from, checking a launch against the tweet,
 * and the demand model that drives a coin you launched. The engine wires these into the market.
 */

/** Pump.fun charges about this to create a coin. */
export const DEPLOY_FEE_SOL = 0.02;
/** Creator fee on volume (creator-fee mode): higher on the curve, lower once it trades on the pool. */
export const CREATOR_FEE_CURVE = 0.003;
export const CREATOR_FEE_POOL = 0.0005;

// ------------------------------------------------------------------ bots

/**
 * Volume packages: wash trades (buy, then sell the same tokens a few seconds later) adding up to `usd` of volume over
 * `minutes`. The price covers the 1% pump fee on every trade plus the service's cut, which is what makes volume
 * expensive for real.
 */
export const VOLUME_PACKAGES = [
  { id: "v10", usd: 10_000, minutes: 5 },
  { id: "v50", usd: 50_000, minutes: 10 },
  { id: "v200", usd: 200_000, minutes: 20 },
] as const;
export const volumeCostSol = (usd: number) => (usd / SOL_USD) * 0.0125;

/**
 * Holder bot: each fake holder is a fresh wallet with a token account (rent, paid up front) that buys about 0.03% of
 * supply at the price of the moment. On a fresh coin 200 of them come to ~3 SOL and ~6% of supply.
 */
export const HOLDER_PACKAGES = [25, 50, 100, 200] as const;
export const HOLDER_RENT_SOL = 0.004;
export const HOLDER_SUPPLY_PCT = 0.03;
/** Estimated cost of `n` holders at a market cap (SOL), with a margin for the price rising as they buy. */
export const holderCostSol = (n: number, mcSol: number) => n * (HOLDER_RENT_SOL + (HOLDER_SUPPLY_PCT / 100) * mcSol) * 1.15;
/** The trend bot buys into its own wallets, never your launch wallets. */
export const BOT_WALLETS = 5;
/** Launch wallets: 10 to start, add more 10 at a time. */
export const LAUNCH_WALLETS_START = 10;
export const LAUNCH_WALLETS_MAX = 50;
/** Trend bot targets: a multiple of the current market cap, the bonding line, or a fixed market cap. */
export const TREND_TARGETS = [
  { id: "x1.5", label: "+50%", mult: 1.5 },
  { id: "x2", label: "2×", mult: 2 },
  { id: "bond", label: "Bond", usd: 44_000 },
  { id: "100k", label: "$100K", usd: 100_000 },
] as const;
export type TrendTargetId = (typeof TREND_TARGETS)[number]["id"];

export const OPTION_COUNT: Record<DifficultyId, number> = { paper: 3, trencher: 4, sniper: 5 };
/** How long after the tweet rival devs land their coins (s). */
export const RIVAL_LAG_S: Record<DifficultyId, [number, number]> = { paper: [14, 22], trencher: [8, 14], sniper: [4, 8] };

export interface NameOption {
  name: string;
  ticker: string;
}

export interface LaunchOptions {
  names: NameOption[];
  images: ArtSpec[];
  /** Index of the right answer in each list (kept engine-side). */
  rightName: number;
  rightImage: number;
}

export type LaunchMode = "manual" | "organic";
export type RewardsMode = "creator" | "cashback";

export interface DevChoice {
  nameIdx: number;
  imageIdx: number;
  launchpad: Launchpad;
  dividends: boolean;
  pair: Pair;
  mode: LaunchMode;
  /** Your dev buy at launch (SOL). */
  devBuySol: number;
  /** Organic mode: SOL spread over a few fresh wallets of yours right after launch. */
  organicSol: number;
  rewards: RewardsMode;
}

export interface LaunchCheck {
  name: boolean;
  ticker: boolean;
  image: boolean;
  launchpad: boolean;
  dividends: boolean;
  pair: boolean;
}

/** Near misses on a ticker: a dropped, doubled or swapped letter. */
function tickerTypos(t: string): string[] {
  const out = new Set<string>();
  if (t.length > 3) for (let i = 1; i < t.length; i++) out.add(t.slice(0, i) + t.slice(i + 1));
  for (let i = 1; i < t.length; i++) out.add(t.slice(0, i) + t[i] + t.slice(i));
  for (let i = 1; i < t.length - 1; i++) out.add(t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2));
  out.delete(t);
  return [...out];
}

/** Near misses on a name: a letter dropped or doubled inside one word. */
function nameTypos(n: string): string[] {
  const out = new Set<string>();
  for (let i = 1; i < n.length - 1; i++) {
    if (n[i] === " " || n[i - 1] === " ") continue;
    out.add(n.slice(0, i) + n.slice(i + 1));
    out.add(n.slice(0, i) + n[i] + n.slice(i));
  }
  out.delete(n);
  return [...out];
}

/**
 * The name/ticker and image choices for a launch: the right one plus `n - 1` near misses (another ticker the
 * meme could take, a typo'd ticker, a typo'd name) and other memes' pictures. Shuffled.
 */
export function makeLaunchOptions(rng: Rng, meme: Meme, pack: readonly Meme[], n: number): LaunchOptions {
  const right: NameOption = { name: meme.name, ticker: meme.tickers[0] };
  const pool: NameOption[] = [
    ...meme.tickers.slice(1).map((ticker) => ({ name: meme.name, ticker })),
    ...rng.shuffle(tickerTypos(meme.tickers[0])).slice(0, 3).map((ticker) => ({ name: meme.name, ticker })),
    ...rng.shuffle(nameTypos(meme.name)).slice(0, 2).map((name) => ({ name, ticker: meme.tickers[0] })),
  ];
  const wrong: NameOption[] = [];
  // Variety first: one of each kind, then fill.
  const seen = new Set<string>([`${right.name}|${right.ticker}`]);
  for (const o of rng.shuffle(pool)) {
    const k = `${o.name}|${o.ticker}`;
    if (seen.has(k)) continue;
    seen.add(k);
    wrong.push(o);
    if (wrong.length >= n - 1) break;
  }
  const names = rng.shuffle([right, ...wrong]);
  const others = rng.shuffle(pack.filter((m) => m.id !== meme.id && m.art.src && m.art.src !== meme.art.src)).slice(0, n - 1);
  const images = rng.shuffle([meme.art, ...others.map((m) => m.art)]);
  return { names, images, rightName: names.indexOf(right), rightImage: images.indexOf(meme.art) };
}

export function checkLaunch(choice: DevChoice, opts: LaunchOptions, right: CoinConfig): LaunchCheck {
  const picked = opts.names[choice.nameIdx];
  const truth = opts.names[opts.rightName];
  return {
    name: picked?.name === truth.name,
    ticker: picked?.ticker === truth.ticker,
    image: choice.imageIdx === opts.rightImage,
    launchpad: choice.launchpad === right.launchpad,
    dividends: choice.dividends === right.dividends,
    pair: choice.pair === right.pair,
  };
}

/** How much of the narrative's demand a launch can catch: a wrong name or ticker is close to nothing. */
export function correctness(c: LaunchCheck): number {
  let k = c.name && c.ticker ? 1 : 0.05;
  if (!c.image) k *= 0.6;
  for (const ok of [c.launchpad, c.dividends, c.pair]) if (!ok) k *= 0.5;
  return k;
}

/**
 * Where this launch could top out (USD market cap): the meme's own range for strong narratives, otherwise
 * 40-400K; the odd one runs several times further. Cut by how right the launch is and how late you were.
 */
export function devCeilingUsd(rng: Rng, meme: Meme, corr: number, share: number): number {
  if (corr < 0.2) return rng.range(6_000, 12_000);
  const logRange = (a: number, b: number) => Math.exp(rng.range(Math.log(a), Math.log(b)));
  let c = meme.big ? logRange(meme.big.peak[0] * 0.4, meme.big.peak[1]) : logRange(40_000, 400_000);
  if (rng.chance(0.1)) c *= rng.range(3, 8);
  return Math.min(25_000_000, Math.max(9_000, c * Math.pow(corr, 0.7) * Math.pow(share, 1.2)));
}

export interface DemandInput {
  /** Seconds since the tweet. */
  sinceTweetS: number;
  /** Tweet strength (about 1). */
  heat0: number;
  corr: number;
  /** Your share of the narrative: 1 if you were the first correct deploy. */
  share: number;
  /** Dev Rep traction (0.5 new dev - 1.2). */
  rep: number;
  /** Fraction of your launch bag you have sold so far. */
  devSoldFrac: number;
  cashback: boolean;
  mcUsd: number;
  ceilingUsd: number;
  /** Log change in market cap over the last ~10 s. */
  momentum: number;
  migrated: boolean;
  /** Attention from things you or others did (DEX paid, boosts, KOLs, a volume bot): a heat floor that fades (0-1). */
  promo: number;
  /** Social proof from holder count and visible volume (0-0.35): more buyers give it a look. */
  proof: number;
}

export interface Demand {
  /** Chance of a buy, and of a sell, on this step. */
  buyP: number;
  sellP: number;
  /** Median trade sizes (SOL). */
  buySol: number;
  sellSol: number;
  /** 0-1: how much life is left in it (for the engine to slow its loop). */
  heat: number;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/**
 * Demand tuning, set with the harness (dev.harness.test.ts, HARNESS=1). At these values a right, fast, organic
 * launch bonds ~80% of the time (median peak ~$150K with KOL waves, 1 in 20 near $1M+); right but late ~15%; a wrong
 * picture ~30%, a wrong pair ~15%; a wrong ticker never.
 */
export const DEV_TUNING = { buy: 0.5, curveSize: 0.5, luckSigma: 0.7, corrExp: 1.5 };

/** Some narratives just don't catch: a per-launch multiplier on the tweet's pull (median 1). */
export const narrativeLuck = (rng: Rng) => rng.lognormal(1, DEV_TUNING.luckSigma);

/**
 * The organic market around a coin you launched, one step at a time (~250 ms). Buyers come from the tweet's
 * heat (fading over a couple of minutes, kept alive by momentum and the pool), how right your launch is, your
 * share of the narrative and room left under its ceiling; sellers from fading heat, a stalling chart, and you
 * selling. Everything trades through the curve and pool, so the price is what the flow makes it.
 */
export function devDemand(d: DemandInput): Demand {
  const tau = 80;
  let heat = Math.exp(-d.sinceTweetS / tau);
  // A rising chart and a fresh pool keep it in the conversation.
  heat = clamp(Math.max(heat, d.promo) + Math.max(0, d.momentum) * 0.8 + (d.migrated ? 0.15 : 0), 0, 1);
  const room = d.mcUsd >= d.ceilingUsd ? 0 : clamp(Math.log(d.ceilingUsd / d.mcUsd) / Math.log(d.ceilingUsd / 4000), 0, 1);
  const trust = 1 - 0.85 * clamp(d.devSoldFrac, 0, 1);
  // Mistakes cost more than their face value: a market that smells something off just walks.
  const interest = d.heat0 * heat * Math.pow(d.corr, DEV_TUNING.corrExp) * Math.pow(d.share, 1.3) * d.rep * trust * (d.cashback ? 1.15 : 1) * (1 + d.proof);
  const fomo = 1 + 4 * Math.max(0, d.momentum);
  const buyP = clamp(0.04 + DEV_TUNING.buy * interest * Math.sqrt(room) * fomo, 0, 0.92);
  const over = d.mcUsd > d.ceilingUsd ? 0.35 : 0;
  const sellP = clamp(0.1 + 0.4 * (1 - heat) + over + 2.5 * Math.max(0, -d.momentum) + 0.35 * (1 - trust), 0, 0.92);
  // Size follows the coin: small on the curve, scaling with market cap on the pool.
  const mcSol = d.mcUsd / SOL_USD;
  const base = d.migrated ? Math.max(0.4, mcSol * 0.0025) : 0.2 + DEV_TUNING.curveSize * interest;
  return { buyP, sellP, buySol: base * (0.7 + interest), sellSol: base * 0.9, heat };
}
