import { MIGRATION_MC_USD, SOL_USD } from "./curve";
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

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export type LaunchMode = "manual" | "organic" | "block0";
export type BundleBuild = "quick" | "clean" | "full";

/**
 * Block-0: your launch wallets buy in the same block as the create. `supplyPct` is the share they take (dev buy not
 * included), spread over `wallets` of them. `mev` is the back-MEV setting: 0 front-runs the snipers (fewer of them,
 * but your wallets top the holder list), 1 lets them in (more early dumping, but you hide in the crowd).
 */
export interface BundleConfig {
  supplyPct: number;
  wallets: number;
  build: BundleBuild;
  mev: number;
}

/**
 * How the bundle is built. Quick funds every wallet from one source with even sizes: cheap and obvious. Clean
 * funds through hops. Full uses aged wallets, CEX funding and varied sizes: costs the most, hardest to trace.
 */
export const BUNDLE_BUILDS: Record<BundleBuild, { label: string; sub: string; perWalletSol: number; stealth: number }> = {
  quick: { label: "Quick", sub: "One funder, even sizes", perWalletSol: 0.002, stealth: 0 },
  clean: { label: "Clean", sub: "Hop-funded wallets", perWalletSol: 0.012, stealth: 0.45 },
  full: { label: "Full", sub: "Aged, CEX-funded, varied", perWalletSol: 0.03, stealth: 0.75 },
};
export const BUNDLE_WALLETS = [5, 10, 20, 30, 50] as const;
export const BUNDLE_PCTS = [5, 10, 20, 30, 40] as const;

export interface BundleRiskInput {
  /** Supply in your non-deployer wallets (launch, bot, half of holder-bot), %. */
  clusterPct: number;
  /** How many wallets it sits in. */
  wallets: number;
  /** Your biggest single non-deployer wallet, %. */
  maxWalletPct: number;
  /** 0 (Quick) to 0.75 (Full); organic and bot wallets count as Quick. */
  stealth: number;
  /** Back-MEV setting (0.5 when not a block-0 launch). */
  mev: number;
}

/**
 * Chance one bundle-checker pass flags the launch. Driven by how much supply sits in your wallets, how few wallets
 * it's in, how traceable the funding is and how visible you are in the top holders. Under ~6% it's noise.
 */
export function bundleRisk(r: BundleRiskInput): number {
  if (r.clusterPct < 6) return 0;
  const size = clamp((r.clusterPct - 6) / 30, 0, 1);
  const avg = r.clusterPct / Math.max(1, r.wallets);
  const conc = clamp(avg / 3, 0.2, 1);
  const vis = 1.2 - 0.4 * clamp(r.mev, 0, 1);
  const whale = r.maxWalletPct >= 5 ? 0.2 : 0;
  return clamp(size * (0.45 + 0.55 * conc) * (1 - r.stealth) * vis * 0.9 + whale, 0, 0.92);
}

/** How a bubble map reads at a given per-check risk. */
export function bubbleRead(risk: number): "Likely clean" | "Uncertain" | "Clustered" {
  return risk < 0.12 ? "Likely clean" : risk < 0.35 ? "Uncertain" : "Clustered";
}

/** Bundle checkers look at 6, 15 and 30 s, then every 30 s while you hold enough to matter. */
export const BUNDLE_CHECKS_MS = [6_000, 15_000, 30_000];
export const BUNDLE_RECHECK_MS = 30_000;
/** Chance of getting caught across the first three checks. */
export const earlyDetection = (risk: number) => 1 - Math.pow(1 - risk, BUNDLE_CHECKS_MS.length);
/** What the launch panel shows before you deploy. */
export interface LaunchQuote {
  mcUsd: number;
  /** Everything your wallets would hold, %. */
  supplyPct: number;
  /** SOL the block-0 buys take, and what funding the wallets costs on top. */
  bundleSol: number;
  walletCostSol: number;
  /** Deploy fee + every buy + wallet funding. */
  costSol: number;
  /** Per-check risk, chance of getting flagged in the first 30 s, and the bubble-map read. */
  risk: number;
  detectPct: number;
  read: ReturnType<typeof bubbleRead>;
}

/** Once flagged, buyers come at this fraction of the interest and sell more. */
export const BUNDLED_INTEREST = 0.4;
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
  /** Block-0 mode only. */
  bundle?: BundleConfig;
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
  /** Bundle checkers flagged it. */
  bundled?: boolean;
  /** Holder base (0-1): from ~40 organic holders (0) to ~1,000 (1). A real base buys dips and doesn't panic. */
  support?: number;
  /** Drop from the last minute's high (0-1). */
  drawdown?: number;
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
  /** Share of a buy that goes to holders (who sit through dips) rather than traders. */
  holdFrac: number;
}

/**
 * Demand tuning, set with the harness (dev.harness.test.ts, HARNESS=1). At these values a right, fast, organic
 * launch bonds ~80% of the time (median peak ~$150K with KOL waves, 1 in 20 near $1M+); right but late ~15%; a wrong
 * picture ~30%, a wrong pair ~15%; a wrong ticker never.
 */
export const DEV_TUNING = { buy: 0.5, curveSize: 0.5, poolSize: 0.006, luckSigma: 0.7, corrExp: 1.5 };

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
  // Selling your bag costs you buyers, but a holder base cushions it: they've seen devs take profit before.
  const trust = 1 - (0.85 - 0.35 * clamp(d.support ?? 0, 0, 1)) * clamp(d.devSoldFrac, 0, 1);
  // Mistakes cost more than their face value: a market that smells something off just walks.
  const interest = d.heat0 * heat * Math.pow(d.corr, DEV_TUNING.corrExp) * Math.pow(d.share, 1.3) * d.rep * trust * (d.cashback ? 1.15 : 1) * (1 + d.proof) * (d.bundled ? BUNDLED_INTEREST : 1);
  const fomo = 1 + 4 * Math.max(0, d.momentum);
  // A flagged bundle loses buyers even when the chart is hot: the crowd reads the callout.
  const support = clamp(d.support ?? 0, 0, 1);
  // A holder base buys the dip: past bonding, a 8-75% pullback from the last minute's high brings buyers in, more
  // the bigger the base and the deeper the dip (until it looks like a rug). Visible dev selling scares them off.
  const dd = d.drawdown ?? 0;
  const dip = d.migrated && dd > 0.08 && dd < 0.75 ? 0.5 * support * Math.min(1, dd / 0.3) * trust * (d.bundled ? 0.5 : 1) * (0.3 + 0.7 * Math.sqrt(room)) : 0;
  const buyP = clamp(clamp(0.04 + DEV_TUNING.buy * interest * Math.sqrt(room) * fomo, 0, 0.92) * (d.bundled ? 0.6 : 1) + dip, 0, 0.92);
  const over = d.mcUsd > d.ceilingUsd ? 0.35 : 0;
  // Holders don't panic like traders: a big base damps the sell-off cascade.
  const calm = 1 - 0.6 * support;
  const sellP = clamp(
    0.1 + 0.4 * (1 - heat) * calm + over + 2.5 * Math.max(0, -d.momentum) * calm + 0.35 * (1 - trust) + (d.bundled ? 0.12 : 0),
    0,
    0.92,
  );
  // Size follows liquidity: small on the curve; on the pool, a share of the SOL side (which grows with the square
  // root of market cap), so one buy moves a big coin about as much as a small one rather than more and more.
  const mcSol = d.mcUsd / SOL_USD;
  const poolSol = 0.2 * Math.sqrt((MIGRATION_MC_USD / SOL_USD) * mcSol);
  const base = d.migrated ? Math.max(0.3, poolSol * DEV_TUNING.poolSize) : 0.2 + DEV_TUNING.curveSize * interest;
  return {
    buyP,
    sellP,
    buySol: base * (0.7 + interest) * (dip > 0 ? 1 + support : 1),
    sellSol: base * 0.9,
    heat,
    holdFrac: d.migrated ? 0.2 + 0.45 * support : 0.15,
  };
}
