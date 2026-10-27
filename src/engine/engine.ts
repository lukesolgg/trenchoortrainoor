import * as curveLib from "./curve";
import { FEE, MIGRATION_LOCK_MS, MIGRATION_MC_USD, SOL_USD, SUPPLY, toUsd, type Curve } from "./curve";
import { DIFFICULTIES, type Difficulty } from "./difficulty";
import { Rng } from "./rng";
import { BOOST_TIERS, planSaga, type Beat, type Catalyst, type SagaPlan } from "./saga";
import { checkLaunch, correctness, CREATOR_FEE_CURVE, CREATOR_FEE_POOL, DEPLOY_FEE_SOL, devCeilingUsd, devDemand, makeLaunchOptions, narrativeLuck, OPTION_COUNT, RIVAL_LAG_S, type DevChoice, type LaunchCheck, type LaunchOptions } from "./dev";
import { BOOSTS, KOLS, AUTHORITIES, CTO_LEADERS, CTO_LINES, NOISE_AUTHORS } from "./content";
import { ARMED_WAIT_MS, COUNTDOWN_MS, MAX_ROUND_MS, MISS_AFTER_MS, ratingFor, scoreRound, scoreSaga } from "./scoring";
import {
  MEME_PACK,
  fillerSource,
  makeFillerCoin,
  makeNoiseTweet,
  makeRound,
  type CoinSpec,
  type RoundPlan,
} from "./scenario";
import type {
  ArtSpec,
  Author,
  Candle,
  ClosedTrade,
  CoinSummary,
  CoinView,
  DifficultyId,
  Flaw,
  Meme,
  PlayerTrade,
  Position,
  RoundOutcome,
  RoundPhase,
  RoundResult,
  RoundView,
  ScoredView,
  Snapshot,
  Stage,
  TapeEntry,
  TweetSeg,
  TweetSource,
  TweetView,
  Order,
  Hit,
  WrongBuy,
  SocialEvent,
  RoundLength,
  VampView,
  DevScenarioView,
  LaunchView,
} from "./types";

export interface EngineOptions {
  seed: number;
  difficulty: DifficultyId;
  pack?: Meme[];
  /** Free-play preview: a tweet and its runner every 30-60 s. */
  autoRounds?: boolean;
  startingSol?: number;
  /** How many of your wallets you may use (1-5). Default all five. */
  walletCount?: number;
  /** Dev mode: your dev wallet balance (SOL) and Dev Rep traction (0.5-1.2, default 1). */
  dev?: { sol: number; rep?: number } | null;
  /** Your following (campaign KOL Rep). Tier 0 or absent: nobody tails you. */
  kol?: { tier: number; followers: number; name: string; handle: string } | null;
  /** Real clock in ms. Defaults to performance.now. */
  clock?: () => number;
  /** Training style: a wrong buy costs points but does not end the round. */
  training?: boolean;
  /** Blitz: the run is done inside ~a minute. Saga: a 5-10 minute story with revivals and vamps. */
  length?: RoundLength;
}

/**
 * How a big coin's round plays out. Picked at random each round so you never know which one you are in.
 * Times are from launch; runners migrate in 2.5-5 s (sometimes up to 12 s).
 * - standard: tops at the meme's `big.peak` in 18-32 s, fades to `big.trip`
 * - runner:   $0.7-2.5M top in 28-50 s, flush, lower high, long bleed to 8-15%
 * - moon:     $3-50M top in 30-50 s, lower high, trickles to ~half; half the time the dev then rugs it to 3-5%
 * - toprug:   $200-400K top in 13-21 s, then down to $20-30K within ~8 s (one candle or a staircase), dies at $5-9K
 */
export type BigOutcome = "standard" | "runner" | "moon" | "toprug";
export const BIG_OUTCOME_WEIGHTS: Record<BigOutcome, number> = { standard: 0.3, runner: 0.27, moon: 0.13, toprug: 0.3 };

interface BigPlan {
  outcome: BigOutcome;
  /** SOL market caps. */
  peak: number;
  trip: number;
  /** Sim time the ATH should land by. */
  athBy: number;
}

/** One stretch of a scripted run. The price glides to `to` by `end` (sim ms). */
interface Leg {
  /** `rug`: the whole drop lands in one step (one giant red candle). `spike`: the same, upwards (a catalyst hitting). */
  kind: "push" | "dip" | "base" | "rug" | "spike";
  end: number;
  to: number;
  /** Multiplier on trade size. */
  vol: number;
  /** Per-step noise. */
  noise: number;
  /** Where the leg started (SOL market cap). Set when the leg is entered; used by pre-migration scripts. */
  from?: number;
}

/** A coin you launched in Dev mode: your wallets in it, what it cost and returned, and its demand settings. */
interface DevLaunch {
  scenarioId: string;
  check: LaunchCheck;
  corr: number;
  share: number;
  /** First with the right coin. */
  first: boolean;
  heat0: number;
  ceilingUsd: number;
  launchedAt: number;
  deployMs: number;
  /** Tokens in your deployer wallet and in your other launch wallets. */
  deployer: number;
  holders: number;
  /** Most you have held across them (for how much you have sold). */
  initialTokens: number;
  /** Tokens held by the organic market (what it can sell back). */
  marketTokens: number;
  spentSol: number;
  gotSol: number;
  rewards: "creator" | "cashback";
  rewardsSol: number;
  claimedSol: number;
  peakMcUsd: number;
  ended: boolean;
  endReason: "died" | "closed" | null;
  /** Attention burst (DEX paid, a boost, KOLs): peak heat, when, and how fast it fades (ms). */
  promo: { peak: number; at: number; tauMs: number };
  /** The right name and ticker (KOLs only ever touch those). */
  rightCoin: boolean;
  /** Next market cap milestone (index into KOL_MILESTONES) where KOLs may pile in. */
  kolStage: number;
  /** Market cap (USD) once a second, last 10 s, for momentum. */
  hist: number[];
  lastSample: number;
}

/** A Dev mode tweet and what rides on it. */
interface DevScenario {
  id: string;
  meme: Meme;
  plan: RoundPlan;
  tweetAt: number;
  options: LaunchOptions;
  firstCorrect: { by: "you" | "rival"; at: number } | null;
  /** Your coin off this tweet, if you launched one. */
  launched: string | null;
  source: TweetSource;
}

interface Coin {
  id: string;
  spec: CoinSpec;
  createdAt: number;
  curve: Curve;
  migrated: boolean;
  migratedAt: number | null;
  lockUntil: number;
  /** Where this coin's post-migration run should peak (SOL market cap), if it has a target. */
  athSol: number | null;
  /** Set for big coins: the round's outcome and its targets. */
  big: BigPlan | null;
  moonDrift: number;
  /** Scripted post-migration path for ATH runs: pushes, pullbacks and consolidation. */
  legs: Leg[];
  /** Scripted pre-migration path for big coins (steps through the bonding curve). */
  preLegs: Leg[];
  scriptStart: number;
  postMc: number;
  moonUntil: number | null;
  stage: Stage;
  stageAt: number;
  txCount: number;
  buys: number;
  sells: number;
  earlyVol: number;
  earlyMcW: number;
  buyVolSol: number;
  sellVolSol: number;
  source: TweetSource | null;
  devMigrated: number;
  proFrac: number;
  bundlers: number;
  dexPaid: boolean;
  pair: string;
  botBuys: number;
  holders: number;
  /** Top-10 holders' average entry (SOL mc). Starts at the early buyers' average and ratchets up as they add higher. */
  top10Avg: number;
  /** Volume-bot bounce around the scripted level, in log space. Fast-reverting, so the chart wiggles instead of stepping. */
  osc: number;
  /** Dev / KOL / boost events for the chart. */
  social: SocialEvent[];
  /** KOLs that bought this coin and still hold (index into KOLS). */
  kolsIn: number[];
  devSold: boolean;
  /** The dev sells just before migration (true) or just after it (false). */
  devSellPre: boolean;
  /** Share of supply the dev still holds (%), for the hover card. */
  devPct: number;
  /** Saga: which chapter of the story this coin plays. Null outside saga. */
  sagaChapter: number | null;
  /**
   * Before migration, script time lost while one of your wallets holds 5%+ (the script runs at quarter speed):
   * pre-migration scripts read the clock as `at - pausedMs`.
   */
  pausedMs: number;
  /** A pump laid over the script (a boost or DEX payment that worked): glide up to `peak`, then back to the script. */
  overlay: { start: number; peakAt: number; end: number; from: number; peak: number } | null;
  /**
   * Lasting shift (log) laid on the script: paying the DEX, a boost that worked, and part of your own buys and sells
   * bend where the coin goes from then on. `course` glides towards `courseTarget`.
   */
  course: number;
  courseTarget: number;
  /** Climb lost (log, never positive) while one of your wallets held 5%+: it only got a quarter of each rise. */
  drag: number;
  /** The script's level on the last step (before course and drag), to measure each step's rise. */
  lastWant: number;
  /** Anonymous top wallets (% of supply), biggest first. Normal coins: none over ~3%. Coins set to rug: 1-2 whales. */
  anon: number[];
  /** Your followers who tailed you into this coin: what each holds, paid, and when they bought. */
  tailers: { tokens: number; sol: number; at: number; dumped: boolean }[];
  /** Your call on this coin, if you posted one. */
  thesis: string | null;
  /** Dev mode: a coin you launched (its organic market is simulated, not scripted). */
  dev: DevLaunch | null;
  /** KOLs holding this coin: share of supply (%) and what they paid (SOL). */
  kolHold: Map<number, { pct: number; sol: number }>;
  volumeSol: number;
  candles: Candle[];
  tape: TapeEntry[];
  tapeView: TapeEntry[];
  tapeRev: number;
  mint: string;
  creator: string;
  stats: CoinView["stats"];
  flowUntil: number | null;
  rev: number;
  view: CoinView | null;
  viewRev: number;
}

interface ScoredState {
  phase: RoundPhase;
  tStart: number;
  tArm: number;
  tTweet: number;
  tEnd: number | null;
  firstBuy: { trade: PlayerTrade; coinId: string; isTarget: boolean; flaw: Flaw | "unrelated" | null } | null;
  misses: WrongBuy[];
  vamps: VampView[];
  result: RoundResult | null;
  view: ScoredView;
}

interface QueuedEvent {
  at: number;
  seq: number;
  run: (at: number) => void;
}

const FINAL_AT = 0.35;
/** What a DEX profile costs, USD. */
export const DEX_USD = 299;
/** Dev mode: market caps (USD) where KOLs may pile into a right coin you launched. */
const KOL_MILESTONES = [25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6, 6.4e6, 12.8e6, Infinity];
/** Your wallets, and the one limit: a single wallet at 5%+ of supply drags the coin. There is no cap on the total. */
/** Trader wallets: main plus up to four side wallets. A campaign may allow fewer (opts.walletCount). */
export const WALLETS = 5;
export const BIG_WALLET_PCT = 5;

interface PosState {
  tokens: number;
  /** Tokens in each of your wallets (sums to `tokens`). */
  wallets: number[];
  boughtTokens: number;
  boughtSol: number;
  soldSol: number;
  promoSol: number;
}
const newPos = (): PosState => ({ tokens: 0, wallets: Array(WALLETS).fill(0), boughtTokens: 0, boughtSol: 0, soldSol: 0, promoSol: 0 });
const MAX_NEW = 40;
const MAX_FINAL = 14;
const MAX_MIGRATED = 30;
const FEED_CAP = 50;
const EMIT_EVERY_MS = 100;
/** During a scored round the board updates every frame so reaction times stay honest. */
const EMIT_SCORED_MS = 15;
const TAPE_CAP = 60;
/** The earliest buys, in SOL, that define the "early holders' average buy" line. */
const EARLY_VOL_SOL = 30;
const CANDLE_CAP = 2400;
const MAX_GAP_FILL = 300;

export class Engine {
  readonly difficulty: Difficulty;
  readonly rng: Rng;
  private pack: Meme[];
  private opts: EngineOptions;

  private queue: QueuedEvent[] = [];
  private seq = 0;
  private simNow = 0;
  private clock: () => number;
  private t0 = 0;
  private raf: number | null = null;
  private lastEmit = 0;

  private coins = new Map<string, Coin>();
  private nextId = 1;
  private feed: TweetView[] = [];
  private closedLog: ClosedTrade[] = [];
  private logged = new Map<string, { bought: number; sold: number }>();
  private tweetId = 1;

  private wallet: number;
  private positions = new Map<
    string,
    PosState
  >();
  /** Which of your wallets trade (buys split evenly across them; sells come out of each). */
  private walletSel: number[] = [0];
  private walletCount: number;
  /** Why the last buy was trimmed or refused, for a toast. Read once with takeBuyNote(). */
  private buyNote: string | null = null;
  private focusId: string | null = null;
  private tapeSeq = 1;
  private trades: PlayerTrade[] = [];

  private scored: ScoredState | null = null;
  private emitEvery = EMIT_EVERY_MS;
  private roundPlan: RoundPlan | null = null;
  private roundView: RoundView | null = null;

  private dirty = true;
  private version = 0;
  private snap: Snapshot;
  private listeners = new Set<() => void>();

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.rng = new Rng(opts.seed);
    this.difficulty = DIFFICULTIES[opts.difficulty];
    this.pack = opts.pack ?? MEME_PACK;
    this.wallet = opts.startingSol ?? 100;
    this.walletCount = Math.max(1, Math.min(WALLETS, opts.walletCount ?? WALLETS));
    this.clock = opts.clock ?? (() => performance.now());
    this.seedAmbient();
    this.scheduleAmbientLoops();
    if (opts.autoRounds) this.at(this.rng.range(8000, 50000), () => this.startRound());
    if (opts.dev) {
      this.devSol = opts.dev.sol;
      this.at(this.rng.range(3000, 6000), () => this.startDevScenario());
    }
    this.snap = this.buildSnapshot();
  }

  // ---------------------------------------------------------------- clock

  /** Begin real-time playback. Browser only. */
  start(): void {
    if (this.raf !== null) return;
    this.t0 = this.clock() - this.simNow;
    const frame = () => {
      this.advanceTo(this.clock() - this.t0);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  /** Convert an input event timestamp (same origin as performance.now) to engine time. */
  fromEventTime(ts: number): number {
    return ts - this.t0;
  }

  now(): number {
    return this.simNow;
  }

  /**
   * Run every event due up to time t, in order. Frame jitter never changes
   * outcomes because each event runs at its own scheduled time.
   */
  advanceTo(t: number): void {
    while (this.queue.length && this.queue[0].at <= t) {
      const ev = this.queue.shift()!;
      this.simNow = Math.max(this.simNow, ev.at);
      ev.run(ev.at);
    }
    this.simNow = Math.max(this.simNow, t);
    if (this.dirty && t - this.lastEmit >= this.emitEvery) this.emit();
  }

  private at(at: number, run: (at: number) => void): void {
    const ev: QueuedEvent = { at, seq: this.seq++, run };
    // Binary insert keeps the queue ordered by (at, seq).
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const m = this.queue[mid];
      if (m.at < at || (m.at === at && m.seq < ev.seq)) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, ev);
  }

  // ---------------------------------------------------------- subscription

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snap;

  private emit(): void {
    this.dirty = false;
    this.lastEmit = this.simNow;
    this.version++;
    this.snap = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  /** Discrete events (player actions, tweets) skip the throttle. */
  private emitNow(): void {
    this.emit();
  }

  // ------------------------------------------------------------------ coins

  private spawn(spec: CoinSpec, at: number, source?: TweetSource | null, mine = false): Coin {
    const id = `c${this.nextId++}`;
    const curve = curveLib.newCurve();
    // Cosmetic extras come from their own generator so they never shift the simulation's random stream.
    const x = new Rng(this.nextId * 2246822519 + 374761393);
    const src = source !== undefined ? source : fillerSource(x, spec.name);
    const coin: Coin = {
      id,
      spec,
      createdAt: at,
      curve,
      migrated: false,
      migratedAt: null,
      lockUntil: -Infinity,
      athSol: null,
      big: null,
      moonDrift: 0.009,
      legs: [],
      preLegs: [],
      scriptStart: 0,
      postMc: 0,
      moonUntil: null,
      stage: "new",
      stageAt: at,
      txCount: 0,
      buys: 0,
      sells: 0,
      earlyVol: 0,
      earlyMcW: 0,
      buyVolSol: 0,
      sellVolSol: 0,
      source: src,
      devMigrated: x.chance(0.55) ? 0 : x.int(1, 9),
      proFrac: x.range(0.03, 0.2),
      bundlers: x.chance(0.6) ? 0 : x.int(1, 14),
      dexPaid: x.chance(0.3),
      pair: `${x.addr(4)}...${x.addr(4)}`,
      botBuys: 0,
      holders: 0,
      top10Avg: 0,
      osc: 0,
      social: [],
      kolsIn: [],
      devSold: false,
      devSellPre: false,
      devPct: 0,
      sagaChapter: null,
      pausedMs: 0,
      overlay: null,
      course: 0,
      courseTarget: 0,
      drag: 0,
      lastWant: 0,
      anon: [],
      kolHold: new Map(),
      tailers: [],
      thesis: null,
      dev: null,
      volumeSol: 0,
      candles: [],
      tape: [],
      tapeView: [],
      tapeRev: -1,
      mint: `${this.rng.addr(3)}...pump`,
      creator: `${this.rng.addr(3)}...${this.rng.addr(3)}`,
      stats: {
        // Filled from the holder list at view time. (The draw keeps the random stream as it was.)
        top10: this.rng.range(5, 40) * 0,
        dev: this.rng.chance(0.6) ? 0 : Math.round(this.rng.range(1, 5)),
        snipers: this.rng.chance(0.5) ? 0 : Math.round(this.rng.range(1, 14)),
        insiders: this.rng.chance(0.7) ? 0 : Math.round(this.rng.range(1, 8)),
      },
      flowUntil: spec.ttlMs === null ? null : at + spec.ttlMs,
      rev: 0,
      view: null,
      viewRev: -1,
    };
    // Holder spread comes from its own stream so it never shifts the market's randomness.
    const hr = new Rng([...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7));
    coin.anon = this.makeAnon(hr.chance(0.15) ? hr.int(1, 2) : 0, hr);
    this.coins.set(id, coin);
    // Your own launches make their own dev buy and run on the dev demand model (see devDeploy).
    if (!mine) {
      // Dev buy on launch, like the real thing.
      this.applyBuy(coin, this.rng.range(0.2, 2.5), at, "bot");
      this.scheduleFlow(coin, at);
    }
    this.dirty = true;
    return coin;
  }

  private mc(c: Coin): number {
    return c.migrated ? c.postMc : curveLib.mcSol(c.curve);
  }

  private record(c: Coin, at: number, solVolume: number): void {
    this.pushCandle(c, at, this.mc(c), solVolume, true);
  }

  /**
   * Fold a price into the 1 s candle series. `fill` pads quiet seconds with flat
   * candles so live charts have no holes; synthetic history skips it.
   */
  private pushCandle(c: Coin, at: number, price: number, solVolume: number, fill: boolean): void {
    const last = c.candles[c.candles.length - 1];
    const sec = last ? Math.max(Math.floor(at / 1000), last.t) : Math.floor(at / 1000);
    if (last && last.t === sec) {
      last.h = Math.max(last.h, price);
      last.l = Math.min(last.l, price);
      last.c = price;
      last.v += solVolume;
      return;
    }
    const open = last ? last.c : price;
    if (fill && last && sec - last.t > 1) {
      for (let s = Math.max(last.t + 1, sec - MAX_GAP_FILL); s < sec; s++) {
        c.candles.push({ t: s, o: open, h: open, l: open, c: open, v: 0 });
      }
    }
    c.candles.push({ t: sec, o: open, h: Math.max(open, price), l: Math.min(open, price), c: price, v: solVolume });
    if (c.candles.length > CANDLE_CAP) c.candles.splice(0, 400);
  }

  private pushTape(c: Coin, at: number, by: "bot" | "player", side: "buy" | "sell", sol: number, trader?: string): void {
    const id = this.tapeSeq++;
    c.tape.unshift({
      id,
      at,
      by: by === "player" ? "you" : "bot",
      trader: trader ?? (by === "player" ? "You" : new Rng(id * 2654435761).addr(4)),
      side,
      sol,
      mcUsd: toUsd(this.mc(c)),
    });
    if (c.tape.length > TAPE_CAP) c.tape.length = TAPE_CAP;
  }

  private touch(c: Coin): void {
    c.rev++;
    this.dirty = true;
    if (this.openOrders > 0 && !this.filling) this.fillOrders(c);
  }

  // ------------------------------------------------------------------ saga

  private saga: SagaPlan | null = null;
  private sagaMeme: Meme | null = null;
  /** Sim ms the saga's last scripted beat ends. Rounds do not auto-end on a sell-out before this. */
  private sagaEndAt = -Infinity;
  /** The coin playing the saga's last chapter, once it has migrated (its script clock decides when the story ends). */
  private sagaEndCoin: Coin | null = null;
  /** Coins the story is about (original and vamps): never pruned while the round runs. */
  private sagaCoins = new Set<string>();

  private get length(): RoundLength {
    return this.opts.length ?? "blitz";
  }

  /**
   * The dev dumps the whole bag at (or just before) migration, as a real market sell: the candle is exactly as big as
   * that much supply hitting the curve or the pool. Later nukes are other sellers, never the dev.
   */
  private devSell(c: Coin, at: number): void {
    if (c.devSold || c.devPct <= 0) return;
    c.devSold = true;
    const mc = this.mc(c);
    const pct = c.devPct;
    const want = (SUPPLY * pct) / 100;
    const tokens = c.migrated ? want : Math.min(c.curve.realTok * 0.5, want);
    const sol = this.marketSell(c, at, tokens, "DEV");
    c.devPct = 0;
    c.stats.dev = 0;
    this.social(c, at, { kind: "dev", side: "sell", name: "Dev", hue: 45, sol, mc, pct, all: true }, false);
  }

  /** A market sell by someone else (dev, KOL) with real price impact. Returns the SOL it got. */
  private marketSell(c: Coin, at: number, tokens: number, who?: string): number {
    if (tokens <= 0) return 0;
    const sol = this.applySell(c, tokens, at, "bot", true);
    if (who && c.tape[0]) c.tape[0].trader = who;
    return sol;
  }

  /**
   * Share of supply sitting in the DEX pool. Constant product: about 20% at migration, and it thins as the price
   * climbs (x4 the market cap, half the tokens), so the same sell hits a big coin harder than people expect.
   */
  private poolShare(c: Coin): number {
    const mig = MIGRATION_MC_USD / SOL_USD;
    return Math.min(0.3, Math.max(0.004, 0.2 * Math.sqrt(mig / Math.max(1, c.postMc))));
  }

  private boost(c: Coin, at: number): void {
    if (!this.coins.has(c.id)) return;
    const tier = this.rng.pick([...BOOST_TIERS]);
    this.social(c, at, { kind: "boost", side: null, name: "Boost", hue: 50, sol: 0, label: tier.label, usd: tier.usd, hours: tier.hours }, false);
  }

  /** Something outside the chart that sends it again: an authority retweet or quote, a KOL tweet, DEX paid, a CTO. */
  private catalyst(c: Coin, at: number, kind: Catalyst): void {
    if (!this.coins.has(c.id)) return;
    const t = c.spec.ticker;
    const authorities = Object.values(AUTHORITIES).filter((a) => a.handle !== "trenchreport" && a.handle !== "lowcaplarry");
    const tweet = (author: Author, text: string, label: string, when = at) => {
      const segs: TweetSeg[] = text.split(/(\$[A-Z0-9]+)/).filter(Boolean).map((x) => ({ text: x, hl: x.startsWith("$") }));
      this.pushTweet(author, segs, false, undefined, when);
      this.social(c, when, { kind: "tweet", side: null, name: label, handle: author.handle, hue: author.hue, sol: 0, avatar: author.avatar, text });
    };
    switch (kind) {
      case "rt": {
        const a = this.rng.pick(authorities);
        const orig = this.roundPlan?.segments.map((x) => x.text).join("") ?? c.spec.name;
        tweet(a, `🔁 RT: ${orig}`, `${a.name} retweeted`);
        break;
      }
      case "quote": {
        const a = this.rng.pick(authorities);
        tweet(a, this.rng.pick([`$${t} 👀`, `this one has legs. $${t}`, `been watching $${t} all day`, `$${t} is the meta`]), `${a.name} posted`);
        break;
      }
      case "kolTweet": {
        const k = this.rng.pick(KOLS);
        tweet(this.kolAuthor(k), this.rng.pick([`im so bullish on $${t}`, `$${t} is going way higher`, `sized into $${t}. not selling`, `$${t} chart is a thing of beauty`]), `${k.name} posted`);
        break;
      }
      case "dex":
        if (c.dexPaid) {
          // The profile is paid once (maybe by you): this time somebody buys a big boost instead.
          const tier = BOOST_TIERS.find((b) => b.label === "x100")!;
          this.social(c, at, { kind: "boost", side: null, name: "Boost", hue: 50, sol: 0, label: tier.label, usd: tier.usd, hours: tier.hours }, false);
        } else {
          c.dexPaid = true;
          this.social(c, at, { kind: "dex", side: null, name: "DEX paid", hue: 200, sol: 0, usd: DEX_USD }, false);
        }
        break;
      case "cto": {
        // Two or three takeover crews claim it within a few seconds of each other.
        const crews = this.rng.shuffle(CTO_LEADERS).slice(0, this.rng.int(2, 3));
        const lines = this.rng.shuffle(CTO_LINES);
        let when = at;
        crews.forEach((crew, k) => {
          const text = lines[k % lines.length].replace(/\$T/g, `$${t}`);
          const w = when;
          if (k === 0) tweet(crew, text, `${crew.name} · CTO`, w);
          else this.at(w, (a) => this.coins.has(c.id) && tweet(crew, text, `${crew.name} · CTO`, a));
          when += this.rng.range(1200, 4000);
        });
        this.social(c, at, { kind: "cto", side: null, name: "CTO", hue: 140, sol: 0 }, false);
        break;
      }
      case "kolBuy":
        this.kolTrade(c, at, "buy", this.rng.range(30, 90));
        break;
    }
  }

  private kolAuthor(k: { name: string; handle: string; hue: number }): Author {
    return { name: k.name, handle: k.handle, followers: `${this.rng.int(80, 900)}K`, verified: true, hue: k.hue, authority: false, avatar: `/kols/${k.handle.toLowerCase()}.jpg` };
  }

  /**
   * Turn this coin's chapter of the saga into price legs, and schedule what happens along the way: KOL waves and
   * boosts on pumps, KOL exits on fades, catalysts on revivals, the vamp tweet, the dev selling everything.
   */
  private sagaLegs(c: Coin, start: number): Leg[] {
    const beats: Beat[] = this.saga!.chapters[c.sagaChapter!] ?? [];
    const r = this.rng;
    const sol = (usd: number) => usd / SOL_USD;
    const legs: Leg[] = [];
    let t = start;
    let level = c.postMc;
    const add = (kind: Leg["kind"], ms: number, to: number, vol: number, noise: number) => {
      t += ms;
      legs.push({ kind, end: t, to, vol, noise });
      level = to;
    };
    const at = (when: number, fn: (a: number) => void) => this.at(when, (a) => this.coins.has(c.id) && fn(a));
    for (const b of beats) {
      const t0 = t;
      const P = sol(b.toUsd);
      switch (b.kind) {
        case "revival":
        case "pump": {
          if (b.kind === "revival" && b.catalyst) {
            // The catalyst hits and prints a giga candle straight away: no time to front-run it.
            const kind = b.catalyst;
            at(t0, (a) => this.catalyst(c, a, kind));
            add("spike", 250, level * r.range(1.2, 1.5), 3, 0);
            // Then heavy volume either way: sometimes the first spike gets sold into before it goes.
            if (r.chance(0.3)) add("dip", r.range(2500, 5000), level * r.range(0.72, 0.88), 2.2, 0.03);
          }
          // KOLs pile in early and somebody buys a boost; the run climbs in steps with shakeouts between.
          for (let i = 0, n = r.int(2, 4); i < n; i++) at(t0 + r.range(0, b.ms * 0.6), (a) => this.kolTrade(c, a, "buy", r.range(3, 25)));
          if (r.chance(0.65)) at(t0 + r.range(2000, b.ms * 0.5), (a) => this.boost(c, a));
          const steps = r.int(2, 3);
          const from = level;
          const each = (b.ms - (t - t0)) / steps;
          for (let k = 1; k <= steps; k++) {
            const to = from * Math.pow(P / from, k / steps);
            add("push", each * 0.75, to, 1.8, 0.024);
            if (k < steps) add("dip", each * 0.25, to * r.range(0.85, 0.93), 1.2, 0.024);
          }
          break;
        }
        case "fade": {
          // Boosts run out, KOLs take profit, the bid thins out.
          for (let i = 0, n = r.int(1, 3); i < n; i++) at(t0 + r.range(0, b.ms * 0.4), (a) => this.kolTrade(c, a, "sell", r.range(3, 25)));
          const mid = Math.sqrt(level * P);
          add("dip", b.ms * 0.35, mid, 1.2, 0.024);
          add("base", b.ms * 0.25, mid * r.range(1.0, 1.1), 0.5, 0.016);
          add("dip", b.ms * 0.4, P, 0.9, 0.02);
          break;
        }
        case "vamp": {
          // The new narrative lands; this coin's dev dumps everything and it rugs underneath.
          const wave = c.sagaChapter! + 1;
          at(t0, (a) => this.vampWave(c, a, wave));
          add("base", r.range(2500, 5000), level * r.range(0.92, 1.0), 0.8, 0.02);
          add("rug", 1200, level * r.range(0.12, 0.22), 1, 0);
          add("dip", b.ms - (t - t0), P, 0.6, 0.025);
          break;
        }
        case "rug": {
          add("base", r.range(3000, 6000), level * r.range(0.9, 1.0), 0.8, 0.02);
          add("rug", 1200, Math.max(P * 2, level * r.range(0.1, 0.2)), 1, 0);
          add("dip", b.ms - (t - t0), P, 0.6, 0.025);
          break;
        }
        case "bleed": {
          add("dip", b.ms * 0.5, Math.sqrt(level * P), 0.9, 0.022);
          add("base", b.ms * 0.15, level * r.range(1.0, 1.08), 0.5, 0.016);
          add("dip", b.ms * 0.35, P, 0.8, 0.022);
          break;
        }
      }
    }
    // The round ends a few seconds after the last coin reaches its final stage (dead or consolidating).
    if (c.sagaChapter === this.saga!.chapters.length - 1) {
      this.sagaEndAt = t + 3000;
      this.sagaEndCoin = c;
    }
    return legs;
  }

  /** A new narrative: its tweet, then its right coin and look-alikes. Buying the right one fast is scored. */
  private vampWave(from: Coin, at: number, wave: number): void {
    const meme = this.sagaMeme;
    const def = meme?.vamps?.[wave - 1];
    if (!meme || !def) return;
    const vampMeme: Meme = {
      id: `${meme.id}~${wave}`,
      name: def.name,
      tickers: def.tickers,
      art: { ...meme.art, ...def.art },
      author: def.author,
      tweets: def.tweets,
      highlight: def.highlight,
      noHighlight: def.noHighlight,
    };
    const plan = makeRound(this.rng, vampMeme, this.difficulty);
    const source: TweetSource = { author: plan.author, segments: plan.segments };
    this.pushTweet(plan.author, plan.segments, true, vampMeme.art, at);
    const sc = this.scored;
    const view: VampView = { ticker: def.tickers[0], name: def.name, tweetAt: at, appearAt: null, coinId: null, reactionMs: null, wrong: 0 };
    if (sc) {
      sc.vamps.push(view);
      sc.view = { ...sc.view, vamps: sc.vamps.map((v) => ({ ...v })) };
    }
    plan.spawns.forEach((s, i) => {
      s.spec.wave = wave;
      this.at(at + s.at, (a) => {
        const coin = this.spawn(s.spec, a, source);
        if (i !== plan.targetIndex) return;
        coin.sagaChapter = wave;
        this.sagaCoins.add(coin.id);
        view.appearAt = a;
        view.coinId = coin.id;
        if (sc) sc.view = { ...sc.view, vamps: sc.vamps.map((v) => ({ ...v })) };
        this.scriptLaunch(coin, a);
        for (let k = 0; k < plan.snipers; k++) {
          this.at(a + this.rng.range(plan.sniperReactMs[0], plan.sniperReactMs[1]), (b) => this.applyBuy(coin, Math.min(1.5, this.rng.lognormal(0.35, 0.6)), b, "bot"));
        }
      });
    });
    void from;
    this.emitNow();
  }

  // ------------------------------------------------------------------ dev mode

  private devSol = 0;
  private scenarios = new Map<string, DevScenario>();
  private scenarioSeq = 1;
  private launchIds: string[] = [];

  /**
   * A Dev mode tweet: it lands on the Tracker with a Dev button, and rival devs deploy their versions of it (the
   * right coin and look-alikes) a few seconds behind. Whoever lands the right coin first gets the narrative.
   */
  private startDevScenario(): void {
    const meme = this.rng.pick(this.pack);
    const plan = makeRound(this.rng, meme, this.difficulty);
    const id = `s${this.scenarioSeq++}`;
    const at = this.simNow;
    const options = makeLaunchOptions(new Rng(this.scenarioSeq * 7919 + 13), meme, this.pack, OPTION_COUNT[this.opts.difficulty]);
    const [lo, hi] = RIVAL_LAG_S[this.opts.difficulty];
    const sc: DevScenario = {
      id,
      meme,
      plan,
      tweetAt: at,
      options,
      firstCorrect: null,
      launched: null,
      source: { author: plan.author, segments: plan.segments },
    };
    this.scenarios.set(id, sc);
    this.pushTweet(plan.author, plan.segments, true, meme.art, at, { scenarioId: id });
    const rivalAt = at + this.rng.range(lo, hi) * 1000;
    plan.spawns.forEach((s, i) => {
      this.at(rivalAt + s.at, (a) => {
        if (i !== plan.targetIndex) {
          this.spawn(s.spec, a, sc.source);
          return;
        }
        // You beat them to it: their copy only gets scraps.
        if (sc.firstCorrect?.by === "you") {
          this.spawn({ ...s.spec, role: "noise", profile: "bleed", ttlMs: 30_000 }, a, sc.source);
          return;
        }
        const coin = this.spawn(s.spec, a, sc.source);
        sc.firstCorrect = { by: "rival", at: a };
        if (plan.athMcUsd) coin.athSol = plan.athMcUsd / SOL_USD;
        this.scriptLaunch(coin, a);
        if (meme.big) this.scriptBigCoin(coin, a, meme.big);
      });
    });
    this.at(at + this.rng.range(35_000, 55_000), () => this.startDevScenario());
    this.emitNow();
  }

  /** What the launch panel needs for a tweet (no answers). */
  getDevScenario(id: string): DevScenarioView | null {
    const sc = this.scenarios.get(id);
    if (!sc) return null;
    return {
      id,
      tweetAt: sc.tweetAt,
      authorName: sc.plan.author.name,
      names: sc.options.names.map((n) => ({ ...n })),
      images: sc.options.images,
      launchedCoinId: sc.launched,
      rivalFirst: sc.firstCorrect?.by === "rival",
    };
  }

  /** Market cap and supply share a launch would open at, before anyone else trades it. */
  quoteLaunch(devBuySol: number, organicSol: number): { mcUsd: number; supplyPct: number } {
    let c = curveLib.newCurve();
    let tokens = 0;
    for (const s of [devBuySol, organicSol]) {
      if (s <= 0) continue;
      const r = curveLib.buy(c, s);
      c = r.curve;
      tokens += r.tokens;
    }
    return { mcUsd: toUsd(curveLib.mcSol(c)), supplyPct: (tokens / SUPPLY) * 100 };
  }

  /**
   * Launch your coin off a Dev mode tweet. Costs the deploy fee, your dev buy and any organic buys, all from the
   * dev wallet. How it goes from there is down to the demand model: how right you got it, how early you were,
   * and what you do with your bag.
   */
  devDeploy(scenarioId: string, choice: DevChoice): { ok: boolean; reason?: string; coinId?: string } {
    const sc = this.scenarios.get(scenarioId);
    if (!this.opts.dev || !sc) return { ok: false, reason: "That tweet is gone" };
    if (sc.launched) return { ok: false, reason: "You already launched this one" };
    const devBuy = Math.max(0, choice.devBuySol);
    const organic = choice.mode === "organic" ? Math.max(0, choice.organicSol) : 0;
    const cost = DEPLOY_FEE_SOL + devBuy + organic;
    if (cost > this.devSol + 1e-9) return { ok: false, reason: `Not enough SOL in the dev wallet (${cost.toFixed(2)} needed)` };
    const at = this.simNow;
    // Dividends are out of Dev mode for now: every launch gets the right setting.
    choice = { ...choice, dividends: sc.plan.rightConfig.dividends };
    const check = checkLaunch(choice, sc.options, sc.plan.rightConfig);
    const corr = correctness(check);
    const rightCoin = check.name && check.ticker;
    const first = rightCoin && !sc.firstCorrect;
    if (first) sc.firstCorrect = { by: "you", at };
    const share = rightCoin ? (first ? 1 : 0.45) : 1;
    const nm = sc.options.names[choice.nameIdx] ?? sc.options.names[0];
    const spec: CoinSpec = {
      ticker: nm.ticker,
      name: nm.name,
      art: sc.options.images[choice.imageIdx] ?? sc.options.images[0],
      config: { launchpad: choice.launchpad, dividends: choice.dividends, pair: choice.pair },
      role: "mine",
      profile: "flat",
      ttlMs: null,
    };
    this.devSol -= DEPLOY_FEE_SOL;
    const c = this.spawn(spec, at, sc.source, true);
    c.dexPaid = false;
    c.dev = {
      scenarioId,
      check,
      corr,
      share,
      first,
      heat0: (sc.meme.big ? 1.15 : 1) * narrativeLuck(this.rng),
      ceilingUsd: devCeilingUsd(this.rng, sc.meme, corr, share),
      launchedAt: at,
      deployMs: at - sc.tweetAt,
      deployer: 0,
      holders: 0,
      initialTokens: 0,
      marketTokens: 0,
      spentSol: DEPLOY_FEE_SOL,
      gotSol: 0,
      rewards: choice.rewards,
      rewardsSol: 0,
      claimedSol: 0,
      peakMcUsd: 0,
      ended: false,
      endReason: null,
      promo: { peak: 0, at: at, tauMs: 1 },
      rightCoin,
      kolStage: 0,
      hist: [],
      lastSample: at,
    };
    sc.launched = c.id;
    this.launchIds.push(c.id);
    if (devBuy > 0) {
      const r = this.devWalletBuy(c, devBuy, at, "deployer");
      c.devPct = (r / SUPPLY) * 100;
      c.stats.dev = +c.devPct.toFixed(2);
      this.social(c, at, { kind: "dev", side: "buy", name: "Dev", hue: 45, sol: devBuy, pct: c.devPct });
    }
    // Organic mode: a handful of fresh wallets of yours buy in over the first few seconds.
    if (organic > 0) {
      const n = this.rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        this.at(at + this.rng.range(300, 3000), (a) => {
          if (this.coins.has(c.id)) this.devWalletBuy(c, organic / n, a, "holders");
        });
      }
    }
    this.scheduleRoasts(c, sc);
    this.at(at + 200, (a) => this.devFlow(c, a));
    this.emitNow();
    return { ok: true, coinId: c.id };
  }

  /** Buy your own coin from the dev wallet into one of your launch wallets. Returns tokens bought. */
  private devWalletBuy(c: Coin, sol: number, at: number, into: "deployer" | "holders"): number {
    const d = c.dev!;
    const spend = Math.min(sol, this.devSol);
    if (spend <= 0) return 0;
    const r = this.applyBuy(c, spend, at, "bot");
    if (r.tokens <= 0) return 0;
    if (into === "deployer" && c.tape[0]) c.tape[0].trader = "DEV";
    this.devSol -= r.spent;
    d.spentSol += r.spent;
    d[into] += r.tokens;
    d.initialTokens = Math.max(d.initialTokens, d.deployer + d.holders);
    return r.tokens;
  }

  /** The Tracker tells you when a launch is off: wrong name or ticker, wrong picture, wrong config. */
  private scheduleRoasts(c: Coin, sc: DevScenario): void {
    const d = c.dev!;
    const t = c.spec.ticker;
    const right = sc.options.names[sc.options.rightName];
    const lines: string[] = [];
    if (!d.check.ticker) lines.push(`$${t}? wrong ticker lol. it's $${right.ticker}`, `who aped $${t}. tweet says ${right.name}, not that`);
    else if (!d.check.name) lines.push(`dev couldn't even spell ${right.name}. $${t} is cooked`);
    if (!d.check.image) lines.push(`$${t} launched with the wrong pic. nobody's touching that`);
    if (!d.check.launchpad) lines.push(`$${t} on bonk? that crowd lives on pump`);
    if (!d.check.dividends) lines.push(`$${t} launched with dividends off. pass`);
    if (!d.check.pair) lines.push(`$${t} paired /${c.spec.config.pair}? ${sc.plan.author.name} coins pair /${sc.plan.rightConfig.pair}`);
    const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
    this.rng
      .shuffle(lines)
      .slice(0, 2)
      .forEach((text, i) => {
        this.at(d.launchedAt + this.rng.range(4000, 9000) + i * this.rng.range(3000, 7000), (a) => {
          const author = this.rng.pick(NOISE_AUTHORS);
          const segs: TweetSeg[] = text.split(/(\$[A-Za-z0-9]+)/).filter(Boolean).map((x) => ({ text: x, hl: x.startsWith("$") }));
          this.pushTweet({ ...author, followers: author.followers ?? fmt(this.rng.int(800, 40000)) }, segs, false, undefined, a);
        });
      });
  }

  /** One step of the organic market around a coin you launched (see devDemand). */
  private devFlow(c: Coin, at: number): void {
    const d = c.dev;
    if (!d || !this.coins.has(c.id)) return;
    if (c.migrated && at < c.lockUntil) {
      this.at(at + 250, (a) => this.devFlow(c, a));
      return;
    }
    const mcUsd = toUsd(this.mc(c));
    d.peakMcUsd = Math.max(d.peakMcUsd, mcUsd);
    if (at - d.lastSample >= 1000) {
      d.hist.push(mcUsd);
      if (d.hist.length > 10) d.hist.shift();
      d.lastSample = at;
    }
    const momentum = d.hist.length >= 3 ? Math.log(mcUsd / d.hist[0]) : 0;
    const sc = this.scenarios.get(d.scenarioId)!;
    const dem = devDemand({
      sinceTweetS: (at - sc.tweetAt) / 1000,
      heat0: d.heat0,
      corr: d.corr,
      share: d.share,
      rep: this.opts.dev?.rep ?? 1,
      devSoldFrac: d.initialTokens > 0 ? 1 - (d.deployer + d.holders) / d.initialTokens : 0,
      cashback: d.rewards === "cashback",
      mcUsd,
      ceilingUsd: d.ceilingUsd,
      momentum,
      migrated: c.migrated,
      promo: d.promo.peak * Math.exp(-(at - d.promo.at) / d.promo.tauMs),
    });
    // A right coin that is running draws KOLs at each milestone: real buys, sometimes a tweet. They take profit
    // when it bleeds.
    if (d.rightCoin && mcUsd >= KOL_MILESTONES[d.kolStage]) {
      d.kolStage++;
      // KOLs check the details too: a wrong picture or pair puts some of them off.
      if (this.rng.chance(Math.pow(d.corr, 1.5))) this.kolWave(c, at);
    }
    if (c.kolsIn.length && (mcUsd < d.peakMcUsd * 0.55 || momentum < -0.25 || dem.heat < 0.1) && this.rng.chance(0.03)) this.kolTrade(c, at, "sell");
    const fee = c.migrated ? CREATOR_FEE_POOL : CREATOR_FEE_CURVE;
    if (this.rng.chance(dem.buyP)) {
      const r = this.applyBuy(c, this.rng.lognormal(dem.buySol, 0.7), at, "bot");
      d.marketTokens += r.tokens;
      if (d.rewards === "creator") d.rewardsSol += r.spent * fee;
    }
    if (this.rng.chance(dem.sellP) && d.marketTokens > 0) {
      const price = this.mc(c) / SUPPLY;
      const tokens = Math.min(d.marketTokens * 0.3, this.rng.lognormal(dem.sellSol, 0.7) / price);
      const got = this.applySell(c, tokens, at, "bot");
      d.marketTokens -= tokens;
      if (d.rewards === "creator") d.rewardsSol += got * fee;
    }
    // A launch is over once it has bled out and nobody is talking about it.
    if (!d.ended && at - d.launchedAt > 45_000 && mcUsd < 4500 && dem.heat < 0.25) this.endLaunch(c, "died");
    const quiet = dem.heat < 0.05 && mcUsd < 6000;
    this.at(at + (quiet ? 1500 : this.rng.range(180, 320)), (a) => this.devFlow(c, a));
  }

  /** A burst of attention on one of your launches; a stronger one replaces a weaker one still running. */
  private devPromo(c: Coin, peak: number, tauMs: number, ceilingMult = 1): void {
    const d = c.dev!;
    const now = d.promo.peak * Math.exp(-(this.simNow - d.promo.at) / d.promo.tauMs);
    if (peak > now) d.promo = { peak, at: this.simNow, tauMs };
    d.ceilingUsd *= ceilingMult;
  }

  /** KOLs find your coin: one to three buy in over the next few seconds, and sometimes one tweets it. */
  private kolWave(c: Coin, at: number): void {
    const r = this.rng;
    for (let i = 0, n = r.int(1, 3); i < n; i++) {
      this.at(at + r.range(1000, 8000), (a) => {
        if (!this.coins.has(c.id)) return;
        this.kolTrade(c, a, "buy", r.range(3, 25));
        this.devPromo(c, 0.45, 60_000);
      });
    }
    if (r.chance(0.6)) {
      this.at(at + r.range(2000, 12_000), (a) => {
        if (!this.coins.has(c.id)) return;
        this.catalyst(c, a, r.chance(0.6) ? "kolTweet" : "quote");
        this.devPromo(c, 0.6, 75_000);
      });
    }
  }

  private endLaunch(c: Coin, reason: "died" | "closed"): void {
    const d = c.dev!;
    if (d.ended) return;
    d.ended = true;
    d.endReason = reason;
    this.emitNow();
  }

  /** Sell from your deployer wallet or your other launch wallets: a % of total supply, or everything ("max"). */
  devSellFrom(coinId: string, from: "deployer" | "holders", pctOfSupply: number | "max"): { ok: boolean; reason?: string; sol?: number } {
    const c = this.coins.get(coinId);
    const d = c?.dev;
    if (!c || !d) return { ok: false, reason: "Not your launch" };
    if (this.simNow < c.lockUntil) return { ok: false, reason: "Migrating: wait a moment" };
    const held = d[from];
    const tokens = pctOfSupply === "max" ? held : Math.min(held, (SUPPLY * pctOfSupply) / 100);
    if (tokens <= 1) return { ok: false, reason: "Nothing left in that wallet" };
    // Deployer sells are public (DEV on the tape and chart); your other wallets look like anyone else.
    const sol = this.marketSell(c, this.simNow, tokens, from === "deployer" ? "DEV" : undefined);
    d[from] -= tokens;
    this.devSol += sol;
    d.gotSol += sol;
    if (from === "deployer") {
      const pct = (tokens / SUPPLY) * 100;
      c.devPct = (d.deployer / SUPPLY) * 100;
      c.stats.dev = +c.devPct.toFixed(2);
      this.social(c, this.simNow, { kind: "dev", side: "sell", name: "Dev", hue: 45, sol, pct, all: d.deployer <= 1 }, false);
    }
    this.emitNow();
    return { ok: true, sol };
  }

  /** Buy more of your own coin from the dev wallet (it goes to the deployer wallet). Forcing a bond works; it won't make it run. */
  devBuy(coinId: string, sol: number, into: "deployer" | "holders" = "deployer"): { ok: boolean; reason?: string } {
    const c = this.coins.get(coinId);
    if (!c?.dev) return { ok: false, reason: "Not your launch" };
    if (this.simNow < c.lockUntil) return { ok: false, reason: "Migrating: wait a moment" };
    if (sol > this.devSol + 1e-9) return { ok: false, reason: "Not enough SOL in the dev wallet" };
    const tokens = this.devWalletBuy(c, sol, this.simNow, into);
    if (tokens <= 0) return { ok: false, reason: "Buy failed" };
    // Only the deployer's buys are public; your other wallets look like anyone.
    if (into === "deployer") {
      c.devPct = (c.dev.deployer / SUPPLY) * 100;
      c.stats.dev = +c.devPct.toFixed(2);
      this.social(c, this.simNow, { kind: "dev", side: "buy", name: "Dev", hue: 45, sol, pct: (tokens / SUPPLY) * 100 });
    }
    this.emitNow();
    return { ok: true };
  }

  /** Sell everything you hold in the launch, every wallet, at once. */
  nuke(coinId: string): { ok: boolean; reason?: string; sol?: number } {
    const a = this.devSellFrom(coinId, "holders", "max");
    const b = this.devSellFrom(coinId, "deployer", "max");
    if (!a.ok && !b.ok) return { ok: false, reason: b.reason ?? a.reason };
    return { ok: true, sol: (a.sol ?? 0) + (b.sol ?? 0) };
  }

  /** Move your accrued creator rewards into the dev wallet. */
  claimRewards(coinId: string): { ok: boolean; sol?: number } {
    const d = this.coins.get(coinId)?.dev;
    if (!d || d.rewardsSol <= 0) return { ok: false };
    const sol = d.rewardsSol;
    this.devSol += sol;
    d.claimedSol += sol;
    d.rewardsSol = 0;
    this.emitNow();
    return { ok: true, sol };
  }

  /** Stop managing a launch (it stays on the board; what you still hold is counted at its value). */
  closeLaunch(coinId: string): void {
    const c = this.coins.get(coinId);
    if (c?.dev) this.endLaunch(c, "closed");
  }

  getLaunches(): LaunchView[] {
    const out: LaunchView[] = [];
    for (const id of this.launchIds) {
      const c = this.coins.get(id);
      const d = c?.dev;
      if (!c || !d) continue;
      const sc = this.scenarios.get(d.scenarioId)!;
      const price = this.mc(c) / SUPPLY;
      const right = sc.options.names[sc.options.rightName];
      out.push({
        coinId: id,
        scenarioId: d.scenarioId,
        ticker: c.spec.ticker,
        name: c.spec.name,
        art: c.spec.art,
        mcUsd: toUsd(this.mc(c)),
        peakMcUsd: d.peakMcUsd,
        bonded: c.migrated,
        ended: d.ended,
        endReason: d.endReason,
        deployerPct: (d.deployer / SUPPLY) * 100,
        holdersPct: (d.holders / SUPPLY) * 100,
        holdingsSol: (d.deployer + d.holders) * price,
        spentSol: d.spentSol,
        gotSol: d.gotSol,
        rewardsMode: d.rewards,
        rewardsSol: d.rewardsSol,
        claimedSol: d.claimedSol,
        pnlSol: d.gotSol + d.claimedSol - d.spentSol,
        launchedAt: d.launchedAt,
        deployMs: d.deployMs,
        first: d.first,
        check: d.check,
        right: { name: right.name, ticker: right.ticker, art: sc.options.images[sc.options.rightImage], config: sc.plan.rightConfig },
        config: c.spec.config,
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ player extras

  /**
   * The top anonymous wallets. Healthy coins are spread out: nobody over ~3%. A coin that is going to be rugged
   * carries one or two whales (5-9%) at the top: the ones who dump it.
   */
  private makeAnon(whales: number, r: Rng = this.rng): number[] {
    const out = Array.from({ length: 10 }, (_, i) => Math.min(3.2, r.range(1.6, 3.1) * Math.pow(0.88, i)));
    for (let k = 0; k < whales; k++) out[k] = r.range(5, 9);
    return out.sort((a, b) => b - a);
  }

  /** Top 10 holders' share of supply (pool excluded): you, the dev, KOLs and the anonymous wallets. */
  private top10(c: Coin): number {
    const all = [...c.anon, c.devPct || c.stats.dev, ...[...c.kolHold.values()].map((h) => h.pct), ...this.walletPcts(c.id)]
      .filter((x) => x > 0)
      .sort((a, b) => b - a)
      .slice(0, 10);
    return Math.round(all.reduce((n, x) => n + x, 0) * 10) / 10;
  }

  /** One of your wallets holds 5%+ of supply: buyers see it and hold back. */
  private bigHolder(c: Coin): boolean {
    const p = this.positions.get(c.id);
    return !!p && Math.max(...p.wallets) / SUPPLY >= BIG_WALLET_PCT / 100;
  }

  /** Each wallet's share of this coin's supply, in %. */
  walletPcts(coinId: string): number[] {
    const p = this.positions.get(coinId);
    return p ? p.wallets.map((t) => (t / SUPPLY) * 100) : Array(WALLETS).fill(0);
  }

  getWalletSel(): readonly number[] {
    return this.walletSel;
  }

  /** Choose which wallets trade. At least one. */
  setWalletSel(sel: number[]): void {
    const clean = [...new Set(sel.filter((i) => Number.isInteger(i) && i >= 0 && i < this.walletCount))].sort();
    if (!clean.length) return;
    this.walletSel = clean;
    this.emitNow();
  }

  /** Spread this coin's bag evenly over your first `n` wallets (2 or 3), and trade from all of them. */
  splitPosition(coinId: string, n: number): boolean {
    const pos = this.positions.get(coinId);
    if (!pos || pos.tokens <= 1e-6 || n < 2 || n > this.walletCount) return false;
    pos.wallets = Array.from({ length: WALLETS }, (_, i) => (i < n ? pos.tokens / n : 0));
    this.walletSel = Array.from({ length: n }, (_, i) => i);
    this.emitNow();
    return true;
  }

  /** Move this coin's bag into one wallet (the first one you trade from), and trade from just that one. */
  consolidate(coinId: string): boolean {
    const pos = this.positions.get(coinId);
    if (!pos || pos.tokens <= 1e-6) return false;
    const into = this.walletSel[0] ?? 0;
    pos.wallets = pos.wallets.map((_, i) => (i === into ? pos.tokens : 0));
    this.walletSel = [into];
    this.emitNow();
    return true;
  }

  takeBuyNote(): string | null {
    const n = this.buyNote;
    this.buyNote = null;
    return n;
  }


  /** Your share of this coin's supply, in %. */
  holdingPct(coinId: string): number {
    const p = this.positions.get(coinId);
    return p ? (p.tokens / SUPPLY) * 100 : 0;
  }

  /** Who holds what: you, the dev, and any KOLs in it (% of supply). */
  getHolders(coinId: string): { youPct: number; you: number[]; devPct: number; kols: { name: string; handle: string; pct: number }[]; anon: number[] } {
    const c = this.coins.get(coinId);
    if (!c) return { youPct: 0, you: [], devPct: 0, kols: [], anon: [] };
    return {
      anon: c.anon,
      youPct: this.holdingPct(coinId),
      you: this.walletPcts(coinId),
      devPct: c.stats.dev,
      kols: [...c.kolHold.entries()].map(([i, h]) => ({ name: KOLS[i].name, handle: KOLS[i].handle, pct: h.pct })),
    };
  }

  /** A pump laid over the script: up to `mult` x the current level in `upMs`, then back to the script over `backMs`. */
  private overlayPump(c: Coin, at: number, mult: number, upMs: number, backMs: number): void {
    const from = c.postMc / Math.exp(c.osc);
    c.overlay = { start: at, peakAt: at + upMs, end: at + upMs + backMs, from, peak: from * mult };
  }

  /**
   * Buy a DEX boost out of your wallet. On the round's coins, while it is still alive, it has a chance to send it
   * (bigger boosts, better odds) back towards its high; sometimes it does nothing at all.
   */
  buyBoost(coinId: string, label: string): { ok: boolean; reason?: string } {
    const c = this.coins.get(coinId);
    const tier = BOOST_TIERS.find((t) => t.label === label);
    if (!c || !tier) return { ok: false, reason: "No such boost" };
    if (c.dev) return this.devPromote(c, "boost", tier);
    if (!c.migrated || this.simNow < c.lockUntil) return { ok: false, reason: "Boosts need a DEX pair: wait for migration" };
    const cost = tier.usd / SOL_USD;
    if (cost > this.wallet + 1e-9) return { ok: false, reason: "Not enough SOL" };
    this.chargePromo(coinId, cost);
    this.social(c, this.simNow, { kind: "boost", side: null, name: "Boost (you)", hue: 50, sol: cost, label: tier.label, usd: tier.usd, hours: tier.hours }, false);
    const odds: Record<string, number> = { x10: 0.2, x30: 0.3, x50: 0.4, x100: 0.55, x500: 0.7 };
    const alive = toUsd(c.postMc) > 12_000;
    if (c.legs.length && alive && this.rng.chance(odds[tier.label] ?? 0.2)) {
      // Towards the high if there is room, otherwise a fresh leg up.
      let ath = 0;
      for (const k of c.candles) ath = Math.max(ath, k.h);
      const level = c.postMc;
      let mult = Math.min(4, Math.max(1.3, (ath / level) * this.rng.range(0.85, 1.1)));
      if (this.bigHolder(c)) mult = 1 + (mult - 1) * 0.25;
      this.overlayPump(c, this.simNow, mult, this.rng.range(6000, 15000), this.rng.range(15000, 35000));
      this.bendCourse(c, Math.log(this.rng.range(1.05, 1.25)));
    }
    this.emitNow();
    return { ok: true };
  }

  /**
   * DEX profile or a boost on a coin you launched: paid from the dev wallet, any time (curve or pool), and it shows
   * up as attention in the demand model, plus a little more room to run.
   */
  private devPromote(c: Coin, kind: "dex" | "boost", tier?: (typeof BOOST_TIERS)[number]): { ok: boolean; reason?: string } {
    const d = c.dev!;
    const usd = kind === "dex" ? DEX_USD : tier!.usd;
    const cost = usd / SOL_USD;
    if (cost > this.devSol + 1e-9) return { ok: false, reason: "Not enough SOL in the dev wallet" };
    this.devSol -= cost;
    d.spentSol += cost;
    if (kind === "dex") {
      c.dexPaid = true;
      this.social(c, this.simNow, { kind: "dex", side: null, name: "DEX paid (you)", hue: 200, sol: cost, usd }, false);
      this.devPromo(c, 0.7, 90_000, 1.3);
    } else {
      const k = BOOST_TIERS.findIndex((t) => t.label === tier!.label);
      this.social(c, this.simNow, { kind: "boost", side: null, name: "Boost (you)", hue: 50, sol: cost, label: tier!.label, usd, hours: tier!.hours }, false);
      this.devPromo(c, 0.35 + 0.13 * k, 45_000 + 25_000 * k, 1.05 + 0.1 * k);
    }
    this.emitNow();
    return { ok: true };
  }

  /** Shift the coin's course (log units), within limits. */
  private bendCourse(c: Coin, by: number): void {
    c.courseTarget = Math.max(-1.5, Math.min(1.5, c.courseTarget + by));
  }

  // ------------------------------------------------------------------ your following (KOL Rep)

  private kolStats = { tailers: 0, tailSol: 0, dumpedOn: 0, called: false };

  /**
   * Followers copy a buy of yours a few seconds later: more of them, and bigger, the higher your tier. Real buys
   * with real impact, but never more than twice what you bought (a call brings a bigger wave).
   */
  private tailBuy(c: Coin, sol: number, at: number, wave = 1): void {
    const k = this.opts.kol;
    if (!k || k.tier < 1 || sol <= 0) return;
    const r = this.rng;
    const tier = Math.min(5, Math.floor(k.tier));
    const counts: [number, number][] = [[0, 0], [0, 1], [1, 3], [2, 4], [3, 6], [5, 10]];
    const sizes: [number, number][] = [[0, 0], [0.05, 0.3], [0.1, 0.5], [0.2, 1], [0.3, 1.5], [0.5, 2]];
    let n = tier === 1 ? (r.chance(0.35) ? 1 : 0) : r.int(counts[tier][0], counts[tier][1]);
    n = Math.round(n * wave);
    let budget = sol * 2 * wave;
    // Small buys get a crowd of small tailers, not one big one: sizes shrink so the whole crowd fits the cap.
    const avg = (sizes[tier][0] + sizes[tier][1]) / 2;
    const scale = n > 0 ? Math.min(1, budget / (n * avg)) : 1;
    for (let i = 0; i < n && budget > 0.005; i++) {
      const s = Math.min(budget, r.range(sizes[tier][0], sizes[tier][1]) * scale);
      budget -= s;
      this.at(at + r.range(1500, 6000), (a) => {
        if (!this.coins.has(c.id)) return;
        const got = this.applyBuy(c, s, a, "bot");
        if (got.tokens <= 0) return;
        if (c.tape[0]) c.tape[0].trader = "Tailer";
        c.tailers.push({ tokens: got.tokens, sol: got.spent, at: a, dumped: false });
        this.kolStats.tailers++;
        this.kolStats.tailSol += got.spent;
        this.touch(c);
      });
    }
  }

  /**
   * You sold `fraction` of your bag: your tailers follow you out a few seconds later. Selling a real chunk within
   * 20 s of them buying in is dumping on your followers.
   */
  private tailSell(c: Coin, fraction: number, at: number): void {
    if (!c.tailers.length || fraction <= 0) return;
    for (const t of c.tailers) {
      if (t.tokens <= 1e-6) continue;
      if (fraction >= 0.25 && !t.dumped && at - t.at < 20_000) {
        t.dumped = true;
        this.kolStats.dumpedOn++;
      }
      const tok = t.tokens * Math.min(1, fraction);
      t.tokens -= tok;
      this.at(at + this.rng.range(2000, 8000), (a) => {
        if (this.coins.has(c.id)) this.marketSell(c, a, tok, "Tailer");
      });
    }
  }

  /**
   * Post a call on a coin you hold: it goes out to your followers on the Tracker and on the chart, and pulls in a
   * bigger wave of tailers. One call per coin.
   */
  postThesis(coinId: string, text: string): { ok: boolean; reason?: string } {
    const k = this.opts.kol;
    const c = this.coins.get(coinId);
    if (!k || k.tier < 1) return { ok: false, reason: "Nobody follows you yet: build KOL Rep first" };
    if (!c) return { ok: false, reason: "Coin is gone" };
    if (!this.holding(coinId)) return { ok: false, reason: "Buy it first: a call is a coin you're in" };
    if (c.thesis !== null) return { ok: false, reason: "You already called this one" };
    const tag = `$${c.spec.ticker}`;
    let body = text.trim().slice(0, 160) || tag;
    if (!body.toUpperCase().includes(tag.toUpperCase())) body = `${body} ${tag}`;
    c.thesis = body;
    this.kolStats.called = true;
    const fmt = k.followers >= 1000 ? `${(k.followers / 1000).toFixed(k.followers >= 10000 ? 0 : 1)}K` : String(Math.round(k.followers));
    const author: Author = { name: k.name, handle: k.handle, followers: fmt, verified: k.tier >= 4, hue: 45, authority: false };
    const segs: TweetSeg[] = body.split(/(\$[A-Za-z0-9]+)/).filter(Boolean).map((x) => ({ text: x, hl: x.startsWith("$") }));
    this.pushTweet(author, segs, false, undefined, this.simNow, { mine: true });
    this.social(c, this.simNow, { kind: "tweet", side: null, name: `${k.name} called it`, handle: k.handle, hue: 45, sol: 0, text: body });
    const pos = this.positions.get(coinId)!;
    this.tailBuy(c, pos.boughtSol, this.simNow, 1.5);
    this.emitNow();
    return { ok: true };
  }

  getKol(): { tier: number; followers: number; name: string; handle: string } | null {
    return this.opts.kol && this.opts.kol.tier >= 1 ? this.opts.kol : null;
  }

  /** Boosts and DEX payments come out of the wallet and count against that coin's PnL. */
  private chargePromo(coinId: string, cost: number): void {
    this.wallet -= cost;
    const pos = this.positions.get(coinId) ?? newPos();
    pos.promoSol += cost;
    this.positions.set(coinId, pos);
  }

  /** Pay for the DEX profile, if nobody has. Sometimes that alone gets it noticed. */
  payDex(coinId: string): { ok: boolean; reason?: string } {
    const c = this.coins.get(coinId);
    if (!c) return { ok: false, reason: "Coin is gone" };
    if (c.dexPaid) return { ok: false, reason: "DEX is already paid" };
    if (c.dev) return this.devPromote(c, "dex");
    if (!c.migrated) return { ok: false, reason: "Wait for migration" };
    const cost = DEX_USD / SOL_USD;
    if (cost > this.wallet + 1e-9) return { ok: false, reason: "Not enough SOL" };
    this.chargePromo(coinId, cost);
    c.dexPaid = true;
    this.social(c, this.simNow, { kind: "dex", side: null, name: "DEX paid (you)", hue: 200, sol: cost, usd: DEX_USD }, false);
    // Paying the DEX almost always turns it: a fresh leg up, and the story carries on from a higher level.
    if (c.legs.length && this.rng.chance(0.85)) {
      // A 5%+ wallet blunts it to a quarter.
      const q = this.bigHolder(c) ? 0.25 : 1;
      const lift = Math.exp(Math.log(this.rng.range(1.2, 1.5)) * q);
      this.bendCourse(c, Math.log(lift));
      this.overlayPump(c, this.simNow, lift * Math.exp(Math.log(this.rng.range(1.25, 1.8)) * q), this.rng.range(12000, 25000), this.rng.range(30000, 60000));
    }
    this.emitNow();
    return { ok: true };
  }

  // ------------------------------------------------------------------ socials

  private socialSeq = 1;

  private social(c: Coin, at: number, e: Omit<SocialEvent, "id" | "at" | "mc"> & { mc?: number }, tape = true): void {
    const ev: SocialEvent = { id: this.socialSeq++, at, mc: e.mc ?? this.mc(c), ...e };
    c.social.push(ev);
    if (c.social.length > 200) c.social.shift();
    if (tape && e.side && e.sol > 0) this.pushTape(c, at, "bot", e.side, e.sol, e.kind === "dev" ? "DEV" : e.name);
    this.touch(c);
  }

  /**
   * A KOL apes in or takes profit. Buys are real market buys unless `impact` is false (naming a move that already
   * printed). No KOL ever holds 4% of supply. Sells always dump the KOL's whole bag at market, with real impact.
   */
  private kolTrade(c: Coin, at: number, side: "buy" | "sell", sol = 0, impact = true): void {
    if (side === "buy") {
      if (c.social.filter((e) => e.kind === "kol" && e.side === "buy").length >= 10) return;
      const free = KOLS.map((_, i) => i).filter((i) => !c.kolsIn.includes(i));
      if (!free.length || c.kolsIn.length >= 6) return;
      const mc = this.mc(c);
      sol = Math.min(sol, mc * 0.035);
      if (sol < 0.2) return;
      const i = this.rng.pick(free);
      let tokens: number;
      if (impact) {
        const r = this.applyBuy(c, sol, at, "bot");
        if (r.tokens <= 0) return;
        tokens = r.tokens;
        sol = r.spent;
        if (c.tape[0]) c.tape[0].trader = KOLS[i].name;
      } else {
        tokens = (sol * (1 - FEE)) / (mc / SUPPLY);
      }
      const pct = (tokens / SUPPLY) * 100;
      c.kolsIn.push(i);
      c.kolHold.set(i, { pct, sol });
      this.social(c, at, { kind: "kol", side, name: KOLS[i].name, handle: KOLS[i].handle, hue: KOLS[i].hue, sol, mc, pct }, !impact);
    } else {
      if (!c.kolsIn.length) return;
      const i = c.kolsIn.splice(this.rng.int(0, c.kolsIn.length - 1), 1)[0];
      const h = c.kolHold.get(i);
      c.kolHold.delete(i);
      if (!h) return;
      const mc = this.mc(c);
      const got = this.marketSell(c, at, (SUPPLY * h.pct) / 100, KOLS[i].name);
      this.social(c, at, { kind: "kol", side, name: KOLS[i].name, handle: KOLS[i].handle, hue: KOLS[i].hue, sol: got, mc, pct: h.pct, cost: h.sol }, false);
    }
  }

  getSocial(coinId: string): readonly SocialEvent[] {
    return this.coins.get(coinId)?.social ?? [];
  }

  // ------------------------------------------------------------------ orders

  private orders: Order[] = [];
  private orderSeq = 1;
  private openOrders = 0;
  private filling = false;

  /** Place a TP or SL on a coin you hold. Returns null if you hold none. */
  addOrder(coinId: string, kind: Order["kind"], triggerMcUsd: number, fraction: number): Order | null {
    if (!this.holding(coinId) || !(triggerMcUsd > 0)) return null;
    const o: Order = {
      id: this.orderSeq++,
      coinId,
      kind,
      triggerMcUsd,
      fraction: Math.min(1, Math.max(0.01, fraction)),
      status: "open",
      createdAt: this.simNow,
      filledAt: null,
      filledSol: null,
    };
    this.orders.unshift(o);
    this.openOrders++;
    this.emitNow();
    return o;
  }

  cancelOrder(id: number): void {
    const o = this.orders.find((x) => x.id === id);
    if (!o || o.status !== "open") return;
    o.status = "cancelled";
    this.openOrders--;
    this.emitNow();
  }

  /** Fill any open TP/SL on this coin whose trigger has been crossed. Orders on a coin you no longer hold are cancelled. */
  private fillOrders(c: Coin): void {
    const mcUsd = toUsd(this.mc(c));
    for (const o of this.orders) {
      if (o.status !== "open" || o.coinId !== c.id) continue;
      if (!this.holding(c.id)) {
        o.status = "cancelled";
        this.openOrders--;
        continue;
      }
      const hit = o.kind === "tp" ? mcUsd >= o.triggerMcUsd : mcUsd <= o.triggerMcUsd;
      if (!hit || this.simNow < c.lockUntil) continue;
      this.filling = true;
      const trade = this.sell(c.id, o.fraction, this.simNow, "all");
      this.filling = false;
      if (!trade) continue;
      o.status = "filled";
      o.filledAt = this.simNow;
      o.filledSol = trade.sol;
      this.openOrders--;
    }
  }

  private setStage(c: Coin, stage: Stage, at: number): void {
    if (c.stage === stage) return;
    c.stage = stage;
    c.stageAt = at;
  }

  private migrate(c: Coin, at: number): void {
    c.migrated = true;
    c.migratedAt = at;
    c.lockUntil = at + MIGRATION_LOCK_MS;
    c.postMc = curveLib.mcSol(c.curve);
    // The winner keeps running for a while after it migrates.
    if (c.spec.role === "target" || c.spec.profile === "run") {
      c.moonUntil = at + this.rng.range(18000, 30000);
    }
    // Saga coins play their chapter of the story; others run their outcome script.
    if (c.sagaChapter !== null && this.saga) {
      c.legs = this.sagaLegs(c, c.lockUntil);
      c.moonUntil = c.legs[c.legs.length - 1].end;
    } else if (c.big) {
      c.legs = this.planBigRun(c.big, c.lockUntil);
      c.moonUntil = c.legs[c.legs.length - 1].end;
    } else if (c.athSol && c.athSol > c.postMc) {
      c.legs = this.planRun(c.postMc, c.athSol, c.lockUntil);
      c.moonUntil = c.legs[c.legs.length - 1].end;
    }
    // A script that ends in a rug has its rugger in the top holders.
    if (c.legs.some((l) => l.kind === "rug") && !c.anon.some((x) => x >= 5)) c.anon = this.makeAnon(this.rng.int(1, 2));
    this.setStage(c, "migrated", at);
    // Otherwise the dev sells within a few seconds of the pool opening: a sharp red candle the script then absorbs.
    if (c.preLegs.length && !c.devSold) {
      this.at(c.lockUntil + this.rng.range(300, 2500), (a) => {
        if (this.coins.has(c.id)) this.devSell(c, a);
      });
    }
    // Somebody always pays for a boost once it is on the DEX.
    if ((c.big || c.legs.length) && c.sagaChapter === null) {
      for (let i = 0, n = this.rng.int(1, 3); i < n; i++) {
        this.at(at + MIGRATION_LOCK_MS + this.rng.range(1000, 40000), (a) => this.boost(c, a));
      }
      // Half the time the dev (or the community) pays for the DEX profile too.
      if (this.rng.chance(0.5)) {
        this.at(at + MIGRATION_LOCK_MS + this.rng.range(2000, 30000), (a) => {
          if (!this.coins.has(c.id) || c.dexPaid) return;
          c.dexPaid = true;
          this.social(c, a, { kind: "dex", side: null, name: "DEX paid", hue: 200, sol: 0, usd: 299 }, false);
        });
      }
    }
  }

  /**
   * Script a run from `p0` to `ath`: 3-4 pushes, each followed by a pullback and a base, with the odd deep
   * flush before the final blast. The player never knows whether a push is the last one.
   */
  private planRun(p0: number, ath: number, start: number): Leg[] {
    const legs: Leg[] = [];
    const pushes = this.rng.int(3, 4);
    const span = Math.log(ath / p0);
    let t = start;
    let high = p0;
    const flushAt = this.rng.chance(0.55) ? this.rng.int(1, pushes - 1) : -1;
    for (let k = 1; k <= pushes; k++) {
      const last = k === pushes;
      const level = last ? ath : p0 * Math.exp((span * k) / pushes);
      t += this.rng.range(6000, 12000);
      legs.push({ kind: "push", end: t, to: level, vol: 1.8, noise: 0.022 });
      high = level;
      if (last) break;
      // Pullback: shallow normally, brutal on the flush.
      const deep = k === flushAt;
      const retrace = deep ? this.rng.range(0.38, 0.55) : this.rng.range(0.12, 0.3);
      const low = Math.max(p0 * 0.9, high * (1 - retrace));
      t += deep ? this.rng.range(5000, 8000) : this.rng.range(4000, 9000);
      legs.push({ kind: "dip", end: t, to: low, vol: 1.1, noise: 0.02 });
      // Base: chop sideways on low volume, sometimes just under the high, then break out.
      const baseTo = deep ? low * this.rng.range(0.97, 1.05) : Math.min(high * 0.97, low * this.rng.range(1.05, 1.25));
      t += this.rng.range(6000, 13000);
      legs.push({ kind: "base", end: t, to: baseTo, vol: 0.4, noise: 0.012 });
    }
    // Some tops are the end: the dev rugs and it bleeds out to ~$5K.
    if (this.rng.chance(0.3)) {
      const dead = Math.max(5000 / SOL_USD, ath * this.rng.range(0.015, 0.03));
      t += this.rng.range(3000, 7000);
      legs.push({ kind: "base", end: t, to: ath * this.rng.range(0.85, 0.95), vol: 0.6, noise: 0.02 });
      t += this.rng.range(1000, 1500);
      legs.push({ kind: "rug", end: t, to: dead * this.rng.range(2, 4), vol: 1, noise: 0 });
      t += this.rng.range(15000, 25000);
      legs.push({ kind: "dip", end: t, to: dead, vol: 0.6, noise: 0.025 });
    }
    return legs;
  }

  /**
   * The winner's launch, scripted through the bonding curve: $3-10K at deploy, then over the migration line in 3-15 s.
   * Fast ones are one straight burst; slower ones burst to $30-35K, pull back, base, then finish.
   */
  private scriptLaunch(c: Coin, at: number): void {
    const r = this.rng;
    const sol = (usd: number) => usd / SOL_USD;
    const over = sol(MIGRATION_MC_USD * 1.15);
    let t = at;
    const leg = (kind: Leg["kind"], ms: number, to: number, vol: number, noise: number) => {
      t += ms;
      return { kind, end: t, to, vol, noise } satisfies Leg;
    };
    // A few seconds in New (under ~$5K), a few in Almost bonded, then over the line: about 5-12 s in all.
    const legs: Leg[] = [leg("push", r.range(200, 400), sol(r.range(3200, 4600)), 1, 0.01)];
    legs.push(leg("base", r.range(2000, 4000), sol(r.range(3400, 4800)), 0.8, 0.02));
    const burst = sol(r.range(14000, 26000));
    legs.push(leg("push", r.range(700, 1500), burst, 1, 0.03));
    if (r.chance(0.5)) legs.push(leg("dip", r.range(800, 1800), burst * r.range(0.82, 0.93), 1, 0.02));
    legs.push(leg("base", r.range(800, 2000), burst * r.range(0.9, 1.05), 0.6, 0.015));
    legs.push(leg("push", r.range(1000, 2500), over, 1, 0.025));
    // The round's coin starts without a paid DEX profile, so somebody (maybe you) can pay for it.
    c.dexPaid = false;
    c.scriptStart = at;
    c.preLegs = legs;
    this.at(at, (a) => this.driveStep(c, a));
    // The dev's own buy at launch shows on the chart.
    this.at(legs[0].end, (a) => {
      c.devPct = this.rng.range(2, 6);
      c.stats.dev = +c.devPct.toFixed(2);
      this.social(c, a, { kind: "dev", side: "buy", name: "Dev", hue: 45, sol: this.rng.range(0.5, 4), pct: c.devPct });
    });
    c.devSellPre = this.rng.chance(0.5);
  }

  /**
   * Pick a big coin's outcome (see BigOutcome). The launch itself is `scriptLaunch`; this decides everything after
   * migration. ATHs land 13-50 s after launch.
   */
  private scriptBigCoin(c: Coin, at: number, big: NonNullable<Meme["big"]>): void {
    const r = this.rng;
    const sol = (usd: number) => usd / SOL_USD;
    const outcome = this.pickOutcome();
    // Peaks and how fast they land, from launch. Calibrated to txgym sweat rounds: 300K by 17 s then rugged,
    // 6M by 34 s, 1.5M by 45 s.
    let peak: number;
    let trip: number;
    let athIn: number;
    switch (outcome) {
      case "standard":
        peak = r.range(big.peak[0], big.peak[1]);
        trip = r.range(big.trip[0], big.trip[1]);
        athIn = r.range(18000, 32000);
        break;
      case "runner":
        peak = Math.exp(r.range(Math.log(700000), Math.log(2500000)));
        trip = peak * r.range(0.08, 0.15);
        athIn = r.range(28000, 50000);
        break;
      case "moon":
        peak = Math.exp(r.range(Math.log(3000000), Math.log(50000000)));
        trip = peak * r.range(0.45, 0.55);
        athIn = r.range(30000, 45000) + Math.log10(peak / 3000000) * 4000;
        break;
      case "toprug":
        peak = r.range(200000, 400000);
        trip = r.range(5000, 9000);
        athIn = r.range(13000, 21000);
        break;
    }
    c.athSol = sol(peak);
    c.big = { outcome, peak: sol(peak), trip: sol(trip), athBy: at + athIn };
  }

  private pickOutcome(): BigOutcome {
    const entries = Object.entries(BIG_OUTCOME_WEIGHTS) as [BigOutcome, number][];
    let x = this.rng.next() * entries.reduce((n, [, w]) => n + w, 0);
    for (const [o, w] of entries) if ((x -= w) < 0) return o;
    return "standard";
  }

  /** One 100 ms step of a scripted pre-migration path: trade through the curve to stay on the glide. */
  private driveStep(c: Coin, at: number): void {
    if (!this.coins.has(c.id) || c.migrated) return;
    // A 5%+ wallet makes buyers hesitate: the launch script runs at a quarter of its speed while you hold it.
    if (this.bigHolder(c)) c.pausedMs += 75;
    const st = at - c.pausedMs;
    const legs = c.preLegs;
    const i = legs.findIndex((l) => st < l.end);
    const leg = i === -1 ? legs[legs.length - 1] : legs[i];
    const legStart = i <= 0 ? c.scriptStart : legs[i - 1].end;
    const now = curveLib.mcSol(c.curve);
    if (leg.from === undefined) leg.from = now;
    const frac = i === -1 ? 1 : Math.min(1, (st - legStart) / Math.max(1, leg.end - legStart));
    const desired = leg.from * Math.pow(leg.to / leg.from, frac) * Math.exp(leg.noise * 0.2 * this.rng.gauss());
    const k = c.curve.vSol * c.curve.vTok;
    const vWant = Math.sqrt((desired * k) / SUPPLY);
    if (vWant > c.curve.vSol * 1.002) {
      let gross = (vWant - c.curve.vSol) / (1 - FEE);
      const parts = this.rng.int(1, 3);
      for (let p = 0; p < parts && !c.migrated; p++) {
        const share = p === parts - 1 ? gross : gross * this.rng.range(0.3, 0.6);
        gross -= share;
        this.applyBuy(c, share, at, "bot");
      }
    } else if (leg.kind !== "push" && vWant < c.curve.vSol * 0.998) {
      const tokens = Math.min(k / vWant - c.curve.vTok, c.curve.realTok);
      if (tokens > 0) this.applySell(c, tokens, at, "bot");
    }
    // The dev dumps a chunk just before it bonds (half the time; the rest just after migration).
    if (c.devSellPre && !c.devSold && curveLib.progress(c.curve) > 0.82 && !c.migrated) {
      this.devSell(c, at);
    }
    // KOLs aping the launch.
    if (c.spec.role === "target" && this.rng.chance(0.02)) this.kolTrade(c, at, "buy", this.rng.range(1, 8));
    this.at(at + 100, (a) => this.driveStep(c, a));
  }

  /**
   * Post-migration path for a big coin: a ladder of pushes, dips and bases up to the ATH (scaled so it lands by
   * `athBy`), then the outcome's ending. Standard runs never dip under ~$100K before the top.
   */
  private planBigRun(b: BigPlan, start: number): Leg[] {
    const r = this.rng;
    const sol = (usd: number) => usd / SOL_USD;
    const standard = b.outcome === "standard";
    const first = standard ? sol(r.range(106000, 114000)) : Math.min(b.peak * 0.7, sol(r.range(95000, 140000)));
    const floor = standard ? sol(103000) : 0;
    const pushes = Math.min(7, Math.max(3, Math.round(Math.log10(b.peak / first) * 2.2) + 2));
    const flushAt = r.int(1, pushes - 1);

    // Climb, with relative durations; scaled to the deadline below.
    const climb: (Omit<Leg, "end"> & { ms: number })[] = [];
    let high = first;
    for (let k = 1; k <= pushes; k++) {
      const last = k === pushes;
      const level = last ? b.peak : first * Math.pow(b.peak / first, (k - 1) / (pushes - 1));
      climb.push({ kind: "push", ms: r.range(7, 13), to: level, vol: 1.8, noise: 0.022 });
      high = level;
      if (last) break;
      const deep = k === flushAt;
      const retrace = deep ? (standard ? r.range(0.2, 0.3) : r.range(0.28, 0.42)) : r.range(0.06, 0.18);
      const low = Math.max(floor, high * (1 - retrace));
      climb.push({ kind: "dip", ms: r.range(4, 9), to: low, vol: 1.2, noise: 0.022 });
      climb.push({ kind: "base", ms: r.range(7, 15), to: Math.min(high * 0.97, low * r.range(1.02, 1.12)), vol: 0.4, noise: 0.012 });
    }
    const budget = Math.max(5000, b.athBy - start);
    const unit = budget / climb.reduce((n, l) => n + l.ms, 0);
    const legs: Leg[] = [];
    let t = start;
    for (const { ms, ...l } of climb) {
      t += ms * unit;
      legs.push({ ...l, end: t });
    }

    const add = (kind: Leg["kind"], ms: number, to: number, vol: number, noise: number) => {
      t += ms;
      legs.push({ kind, end: t, to, vol, noise });
    };
    const P = b.peak;
    switch (b.outcome) {
      case "standard": {
        // A coin that tops this early never just sits: it either rugs out or goes for a second leg (and then rugs).
        const dump = (from: number) => {
          add("dip", r.range(3000, 5000), from * r.range(0.5, 0.6), 1.6, 0.028);
          add("base", r.range(1500, 3000), from * r.range(0.6, 0.68), 0.8, 0.02);
          add("dip", r.range(3000, 6000), sol(r.range(25000, 40000)), 1.5, 0.03);
          add("rug", r.range(1000, 1500), sol(r.range(10000, 15000)), 1, 0);
          add("dip", r.range(25000, 40000), sol(r.range(4000, 7000)), 0.6, 0.025);
        };
        if (r.chance(0.5)) {
          add("base", r.range(2000, 4000), P * r.range(0.86, 0.94), 0.8, 0.02);
          dump(P);
        } else {
          const P2 = P * r.range(1.4, 2.2);
          add("dip", r.range(3000, 5000), P * r.range(0.72, 0.8), 1.5, 0.026);
          add("base", r.range(4000, 7000), P * r.range(0.78, 0.86), 0.6, 0.02);
          add("push", r.range(5000, 8000), P * r.range(1.05, 1.15), 1.8, 0.024);
          add("dip", r.range(2000, 3500), P * r.range(0.92, 1.0), 1.2, 0.024);
          add("push", r.range(5000, 9000), P2, 1.9, 0.026);
          add("base", r.range(2000, 4000), P2 * r.range(0.86, 0.94), 0.8, 0.02);
          dump(P2);
        }
        break;
      }
      case "runner":
        // Sharp first flush, a lower-high bounce, then a long slow bleed.
        add("dip", r.range(3000, 5000), P * r.range(0.65, 0.75), 1.6, 0.026);
        add("base", r.range(3000, 6000), P * r.range(0.72, 0.8), 0.7, 0.02);
        add("dip", r.range(30000, 45000), b.trip * r.range(1.05, 1.15), 0.9, 0.022);
        add("base", r.range(10000, 15000), b.trip, 0.4, 0.014);
        break;
      case "moon":
        // Lower high, then a slow trickle to about half (6M -> 3M by the 1 min mark). Half the time the dev
        // dumps on the people still holding.
        add("dip", r.range(3000, 5000), P * r.range(0.7, 0.8), 1.6, 0.026);
        add("base", r.range(4000, 7000), P * r.range(0.75, 0.85), 0.8, 0.02);
        add("dip", r.range(18000, 26000), b.trip * r.range(1.02, 1.1), 0.9, 0.02);
        if (r.chance(0.5)) {
          add("base", r.range(6000, 12000), b.trip, 0.5, 0.016);
          add("rug", r.range(1000, 1500), P * r.range(0.05, 0.1), 1, 0);
          add("dip", r.range(15000, 25000), P * r.range(0.03, 0.05), 0.8, 0.025);
        } else {
          add("base", r.range(12000, 20000), b.trip, 0.4, 0.016);
        }
        break;
      case "toprug":
        if (r.chance(0.45)) {
          // One red candle off the top.
          add("base", r.range(1500, 3000), P * r.range(0.88, 0.95), 0.8, 0.018);
          add("rug", r.range(1000, 1500), sol(r.range(20000, 30000)), 1, 0);
        } else {
          // Fast staircase: 300K to ~25K in about 8 s.
          add("dip", r.range(2000, 3000), P * r.range(0.55, 0.65), 1.6, 0.028);
          add("base", r.range(1000, 2000), P * r.range(0.66, 0.74), 0.8, 0.02);
          add("dip", r.range(2000, 3000), P * r.range(0.22, 0.3), 1.5, 0.03);
          add("rug", r.range(1000, 1500), sol(r.range(20000, 30000)), 1, 0);
        }
        add("dip", r.range(20000, 30000), b.trip * r.range(1.02, 1.1), 0.6, 0.025);
        add("base", r.range(8000, 12000), b.trip, 0.3, 0.016);
        break;
    }
    return legs;
  }

  /** Returns tokens bought and SOL spent. */
  private applyBuy(c: Coin, sol: number, at: number, by: "bot" | "player"): { tokens: number; spent: number } {
    // Buys are paused while a coin migrates.
    if (at < c.lockUntil) return { tokens: 0, spent: 0 };
    let tokens = 0;
    let spent = 0;
    if (c.migrated) {
      // Constant-product pool: the SOL side is worth the pool's share of the market cap.
      const f = this.poolShare(c);
      const S = f * c.postMc;
      const net = sol * (1 - FEE);
      tokens = (f * SUPPLY * net) / (S + net);
      spent = sol;
      const ratio = ((S + net) / S) ** 2;
      c.postMc *= ratio;
      // Your size is not just faded back: about half of what it moved sticks.
      if (by === "player" && c.legs.length) this.bendCourse(c, Math.log(ratio) * 0.5);
    } else {
      const r = curveLib.buy(c.curve, sol);
      c.curve = r.curve;
      tokens = r.tokens;
      spent = r.spent;
      if (curveLib.isComplete(c.curve)) this.migrate(c, at);
      else if (curveLib.progress(c.curve) >= FINAL_AT) this.setStage(c, "final", at);
    }
    if (spent <= 0) return { tokens: 0, spent: 0 };
    c.txCount++;
    c.buys++;
    c.buyVolSol += spent;
    c.volumeSol += spent;
    if (c.earlyVol < EARLY_VOL_SOL) {
      c.earlyVol += spent;
      c.earlyMcW += spent * this.mc(c);
    }
    if (by === "bot") {
      c.botBuys++;
      if (this.rng.chance(0.7)) c.holders++;
    } else {
      c.holders++;
    }
    this.record(c, at, spent);
    this.pushTape(c, at, by, "buy", spent);
    this.touch(c);
    return { tokens, spent };
  }

  private applySell(c: Coin, tokens: number, at: number, by: "bot" | "player", force = false): number {
    // The chart is frozen while a coin migrates. Only the end-of-round cash-out may override.
    if (!force && at < c.lockUntil) return 0;
    let sol = 0;
    if (c.migrated) {
      const f = this.poolShare(c);
      const T = f * SUPPLY;
      const gross = (f * c.postMc * tokens) / (T + tokens);
      sol = gross * (1 - FEE);
      const ratio = (T / (T + tokens)) ** 2;
      c.postMc *= ratio;
      if (by === "player" && c.legs.length && !force) this.bendCourse(c, Math.log(ratio) * 0.5);
    } else {
      const r = curveLib.sell(c.curve, tokens);
      c.curve = r.curve;
      sol = r.sol;
      if (curveLib.progress(c.curve) < FINAL_AT) this.setStage(c, "new", at);
    }
    c.txCount++;
    c.sells++;
    c.sellVolSol += sol;
    c.volumeSol += sol;
    if (by === "bot" && this.rng.chance(0.3)) c.holders = Math.max(1, c.holders - 1);
    this.record(c, at, sol);
    this.pushTape(c, at, by, "sell", sol);
    this.touch(c);
    return sol;
  }

  // ------------------------------------------------------------ organic flow

  private scheduleFlow(c: Coin, from: number): void {
    const hot = c.spec.profile === "run" && c.spec.role === "target";
    const lively = c.moonUntil !== null && from < c.moonUntil;
    const gap = hot
      ? this.rng.range(120, 400)
      : c.migrated
        ? lively || c.spec.role === "target"
          ? 250
          : 1200
        : this.rng.range(400, 1500);
    // Seeded coins have negative creation times; never replay history.
    this.at(Math.max(from, this.simNow) + gap, (at) => this.flow(c, at));
  }

  private flow(c: Coin, at: number): void {
    // Pruned coins must stop generating events or they leak forever.
    if (!this.coins.has(c.id)) return;
    if (c.flowUntil !== null && at > c.flowUntil && !c.migrated && !c.preLegs.length) return;

    if (c.migrated) {
      if (at < c.lockUntil) {
        // Frozen: no price movement while the pool is being created.
        this.scheduleFlow(c, at);
        return;
      }
      if (!this.walkMigrated(c, at)) return;
      this.scheduleFlow(c, at);
      return;
    }

    // Scripted coins are moved by driveStep; flow just keeps the chain alive for after migration.
    if (c.preLegs.length) {
      this.scheduleFlow(c, at);
      return;
    }

    const p = c.spec.profile;
    const progress = curveLib.progress(c.curve);
    if (p === "runLite" && progress > 0.3) return;

    const pBuy = p === "run" ? 0.8 : p === "runLite" ? 0.6 : p === "flat" ? 0.5 : 0.35;
    const median = p === "run" ? (c.spec.role === "target" ? 1.1 : 0.45) : p === "runLite" ? 0.6 : 0.35;

    if (this.rng.chance(pBuy)) {
      this.applyBuy(c, Math.min(6, this.rng.lognormal(median, 0.6)), at, "bot");
    } else if (c.curve.realTok > 0) {
      // Size sells in SOL so they scale with price, like real flow does.
      const price = curveLib.mcSol(c.curve) / SUPPLY;
      const wantSol = this.rng.lognormal(median * 0.8, 0.6);
      const tokens = Math.min(c.curve.realTok * 0.3, wantSol / price);
      this.applySell(c, tokens, at, "bot");
    }
    if (!c.migrated || c.moonUntil !== null) this.scheduleFlow(c, at);
  }

  /** Post-migration random walk. Returns false when the coin should go quiet. */
  private walkMigrated(c: Coin, at: number): boolean {
    const moon = c.moonUntil !== null && at < c.moonUntil;
    const quiet = c.spec.role !== "target" && c.moonUntil === null;
    const scripted = c.legs.length > 0;
    let drift = moon ? c.moonDrift : c.spec.role === "target" && !scripted ? -0.0025 : this.rng.range(-0.0005, 0.0005);
    let vol = moon ? 0.02 : quiet ? 0.006 : 0.015;
    let volMul = 1;
    // Million-plus runs move violently: the odd giga candle, mostly with the trend.
    let shock = 0;
    if (moon && c.big && c.big.peak * SOL_USD >= 1_000_000) {
      const leg = c.legs.find((l) => at < l.end);
      vol *= 1.7;
      if (leg && leg.kind !== "base" && this.rng.chance(0.06)) {
        const withTrend = this.rng.chance(0.7);
        const dir = (leg.kind === "push") === withTrend ? 1 : -1;
        shock = dir * this.rng.range(0.12, 0.35);
        volMul *= 5;
      }
    }

    const before = c.postMc;
    const heavy = scripted && this.bigHolder(c);
    const st = at;
    if (scripted) {
      const leg = c.legs.find((l) => st < l.end);
      if ((leg?.kind === "rug" || leg?.kind === "spike") && leg.from === undefined) {
        // The whole move prints in one step: an insider dump, or a catalyst's giga candle.
        const up = leg.kind === "spike";
        c.postMc = leg.to * Math.exp(c.course + c.drag);
        c.osc = 0;
        leg.from = leg.to;
        const size = Math.max(before, leg.to) * this.rng.range(0.04, 0.08);
        this.record(c, at, size);
        c.volumeSol += size;
        if (up) {
          c.buyVolSol += size;
          c.buys++;
        } else {
          c.sellVolSol += size;
          c.sells++;
        }
        c.txCount++;
        this.pushTape(c, at, "bot", up ? "buy" : "sell", size, up ? undefined : "Insider");
        this.touch(c);
        return true;
      }
      // Where the script says the price should be by now.
      let want: number;
      if (leg) {
        const idx = c.legs.indexOf(leg);
        if (leg.from === undefined) leg.from = c.postMc / Math.exp(c.osc);
        const start = idx === 0 ? c.lockUntil : c.legs[idx - 1].end;
        // Aim a little ahead on the script: the level trails it (it only moves on size), and this lead cancels the lag
        // so tops and bottoms are actually reached.
        const frac = Math.min(1, Math.max(0, (st + 750 - start) / Math.max(1, leg.end - start)));
        want = leg.from * Math.pow(leg.to / leg.from, frac);
        volMul *= leg.vol;
      } else {
        // Script over: nothing sits still. It keeps bleeding (halving every ~90 s) with the bot chopping around it.
        const last = c.legs[c.legs.length - 1];
        want = Math.max(Math.min(last.to, 4500 / SOL_USD), last.to * Math.exp((-(st - last.end) * Math.LN2) / 90000));
      }
      // While one of your wallets holds 5%+, the coin only gets a quarter of each rise the script asks for; the rest
      // is lost for good (drops land in full).
      if (c.lastWant > 0 && heavy && want > c.lastWant) c.drag -= Math.log(want / c.lastWant) * 0.75;
      c.lastWant = want;
      // Your DEX payment, boosts and trades bend the course: the script now plays out from a different level.
      c.course += (c.courseTarget - c.course) * 0.05;
      want *= Math.exp(c.course + c.drag);
      // A boost or DEX payment that worked lays a pump over the script, then hands back to it.
      const o = c.overlay;
      if (o && at < o.end) {
        if (at < o.peakAt) want = Math.max(want, o.from * Math.pow(o.peak / o.from, (at - o.start) / (o.peakAt - o.start)));
        else want = Math.max(want, o.peak * Math.pow(want / o.peak, (at - o.peakAt) / (o.end - o.peakAt)));
      } else if (o) c.overlay = null;
      // Two layers. The level only moves with real size: a slow drift plus whale buys/sells that close most of the
      // gap to the script in one go (the further behind, the more likely). On top, a volume bot keeps the price
      // bouncing around that level, so candles wiggle both ways instead of stepping. Player trades move the level.
      const level = c.postMc / Math.exp(c.osc);
      const gap = Math.log(want / level);
      let move = gap * 0.15;
      let whaleSide: "buy" | "sell" | null = null;
      if (Math.abs(gap) > 0.008 && this.rng.chance(Math.min(0.5, (leg?.kind === "base" ? 0.08 : 0.2) + Math.abs(gap) * 3))) {
        move = gap * this.rng.range(0.3, 0.6);
        volMul *= 2 + Math.abs(gap) * 20;
        whaleSide = move > 0 ? "buy" : "sell";
      } else if (leg && leg.kind !== "rug" && this.rng.chance(leg.kind === "base" ? 0.05 : 0.09)) {
        // Against the trend: panic sells into a pump, FOMO buys into a dip. The script pulls it back, so these print
        // as sharp counter-candles that shake out the weak hands.
        const against = leg.kind === "push" ? -1 : leg.kind === "dip" ? 1 : this.rng.chance(0.5) ? 1 : -1;
        move = against * this.rng.range(0.025, 0.07);
        volMul *= 3;
        whaleSide = move > 0 ? "buy" : "sell";
      }
      const bounce = leg ? leg.noise * 0.75 : 0.006;
      c.osc = c.osc * 0.55 + bounce * this.rng.gauss();
      const next = Math.max(1, level * Math.exp(move + shock + c.osc));
      // Volume-bot micro trades between steps: lots of small fills both sides of the level, so every candle has
      // wicks and the tape never stops.
      const ticks = this.rng.int(4, 7);
      const microSol = this.rng.lognormal(0.2, 0.6) * Math.max(0.3, toUsd(next) / 40000);
      for (let k = 0; k < ticks; k++) {
        const px = Math.exp(Math.log(before) + (Math.log(next) - Math.log(before)) * this.rng.range(0.1, 0.95) + bounce * 1.3 * this.rng.gauss());
        const sz = microSol * this.rng.range(0.3, 1.7);
        this.pushCandle(c, at, px, sz, true);
        c.volumeSol += sz;
        c.txCount++;
        const buy = this.rng.chance(0.5);
        if (buy) {
          c.buys++;
          c.buyVolSol += sz;
        } else {
          c.sells++;
          c.sellVolSol += sz;
        }
        if (k < 2) this.pushTape(c, at, "bot", buy ? "buy" : "sell", sz);
      }
      c.postMc = next;
      // A big green step is sometimes a KOL: name it, sized to the move it made in the pool.
      if (whaleSide === "buy" && move > 0 && this.rng.chance(0.18)) {
        const sol = this.poolShare(c) * (1 - Math.exp(-move / 2)) * next;
        if (sol >= 3) this.kolTrade(c, at, "buy", sol, false);
      }
      // KOLs get out before it breaks: ahead of an insider dump, or as the script heads back under the migration
      // line. By the time it is sub-migration they have all sold, each one a real market sell.
      if (c.kolsIn.length) {
        const migSol = MIGRATION_MC_USD / SOL_USD;
        const nextLeg = leg ? c.legs[c.legs.indexOf(leg) + 1] : undefined;
        const exiting = !leg || nextLeg?.kind === "rug" || leg.to < migSol * 1.3 || c.postMc < migSol * 1.3;
        if (exiting ? this.rng.chance(0.3) : leg?.kind === "dip" && this.rng.chance(0.004)) this.kolTrade(c, at, "sell");
      }
      c.postMc = next;
    } else {
      c.postMc = Math.max(1, c.postMc * Math.exp(drift + shock + vol * this.rng.gauss()));
    }
    // Holders track size: they pile in on the way up and only trickle out on the way down.
    const wantHolders = 30 * Math.pow(Math.max(1, toUsd(c.postMc)) / 1000, 0.85);
    c.holders = Math.max(1, Math.round(c.holders + (wantHolders - c.holders) * (wantHolders > c.holders ? 0.04 : 0.004)));
    // Top holders keep adding as it runs, so their average entry ratchets up behind price.
    if (c.top10Avg === 0) c.top10Avg = c.earlyVol > 0 ? c.earlyMcW / c.earlyVol : c.postMc;
    if (c.postMc * 0.4 > c.top10Avg) c.top10Avg += (c.postMc * 0.4 - c.top10Avg) * 0.015;
    c.txCount += this.rng.int(0, 3);
    // Runners trade real size: volume scales with market cap while the coin is running.
    const scale = (moon ? Math.min(400, Math.max(4, c.postMc * 0.004)) : c.spec.role === "target" ? Math.max(1, c.postMc * 0.0015) : 1) * volMul;
    const size = this.rng.lognormal(0.5, 0.7) * scale;
    this.record(c, at, size);
    c.volumeSol += size;
    this.pushTape(c, at, "bot", c.postMc >= before ? "buy" : "sell", size);
    this.touch(c);
    // The round's coin never freezes: it keeps trading (and bleeding) for as long as it is on the board.
    return true;
  }

  // ---------------------------------------------------------------- ambient

  private seedAmbient(): void {
    // Almost bonded: only a few at the start, so the runner stands out when it gets there.
    for (let i = 0, n = this.rng.int(3, 4); i < n; i++) {
      const spec: CoinSpec = { ...makeFillerCoin(this.rng, "ambient"), profile: "run", ttlMs: null };
      const c = this.spawn(spec, -this.rng.range(60000, 600000));
      this.fastForward(c, this.rng.range(0.4, 0.9), -500);
    }
    // Migrated: old coins drifting around.
    for (let i = 0; i < 12; i++) {
      const spec: CoinSpec = { ...makeFillerCoin(this.rng, "ambient"), profile: "flat", ttlMs: null };
      const c = this.spawn(spec, -this.rng.range(300000, 86400000));
      this.fastForward(c, 1, -120000);
      this.driftTo(c, Math.exp(this.rng.range(Math.log(500), Math.log(20000))), 28, -500);
      // Old coins have traded for hours: give them volume in proportion to their size.
      const extra = c.postMc * this.rng.range(0.4, 2.5);
      c.volumeSol += extra;
      c.buyVolSol += extra * 0.52;
      c.sellVolSol += extra * 0.48;
      c.buys += Math.round(extra * 1.5);
      c.sells += Math.round(extra * 1.3);
      c.txCount = c.buys + c.sells;
      c.holders += Math.round(c.postMc * 0.4);
    }
    // New Pairs: a full column of earlier launches (seconds to minutes old). New ones only trickle in until the tweet.
    for (let i = 0, n = this.rng.int(11, 14); i < n; i++) {
      this.spawn(makeFillerCoin(this.rng), -Math.exp(this.rng.range(Math.log(3000), Math.log(240000))));
    }
    // Tracker: a scroll of earlier chatter, so the feed is never empty when you arrive.
    const times = Array.from({ length: this.rng.int(8, 11) }, () => -this.rng.range(2000, 150000)).sort((a, b) => a - b);
    const seen = new Set<string>();
    for (const at of times) {
      let t = makeNoiseTweet(this.rng);
      for (let k = 0; k < 4 && seen.has(t.segments.map((x) => x.text).join("")); k++) t = makeNoiseTweet(this.rng);
      seen.add(t.segments.map((x) => x.text).join(""));
      this.pushTweet(t.author, t.segments, false, undefined, at);
    }
  }

  /**
   * Push a coin up its curve and lay the climb out as synthetic chart history
   * between its creation and `endAt`, so older coins open with a real chart.
   */
  private fastForward(c: Coin, target: number, endAt: number): void {
    const path: { mc: number; vol: number }[] = [];
    while (!c.migrated && curveLib.progress(c.curve) < target) {
      const r = curveLib.buy(c.curve, this.rng.range(1, 4));
      c.curve = r.curve;
      c.txCount++;
      c.volumeSol += r.spent;
      c.holders += this.rng.chance(0.7) ? 1 : 0;
      path.push({ mc: curveLib.mcSol(c.curve), vol: r.spent });
      if (curveLib.isComplete(c.curve)) {
        this.migrate(c, c.createdAt + 60000);
        c.moonUntil = null;
      }
    }
    if (!c.migrated && curveLib.progress(c.curve) >= FINAL_AT) c.stage = "final";
    c.buys += path.length;
    const pathVol = path.reduce((a, p) => a + p.vol, 0);
    c.buyVolSol += pathVol;
    c.sellVolSol += pathVol * 0.25;
    c.sells += Math.floor(path.length * this.rng.range(0.1, 0.4));
    c.txCount = c.buys + c.sells;
    for (const p of path) {
      if (c.earlyVol >= EARLY_VOL_SOL) break;
      c.earlyVol += p.vol;
      c.earlyMcW += p.vol * p.mc;
    }
    const start = c.createdAt + 1000;
    const span = Math.max(1000, endAt - start);
    path.forEach((p, i) => this.pushCandle(c, start + (i / path.length) * span, p.mc, p.vol, false));
    this.touch(c);
  }

  /** Walk a migrated coin from its migration price to `targetMc`, drawn as chart history. */
  private driftTo(c: Coin, targetMc: number, steps: number, endAt: number): void {
    const from = c.candles.length ? (c.candles[c.candles.length - 1].t + 1) * 1000 : endAt - steps * 5000;
    const a = Math.log(Math.max(1, c.postMc));
    const b = Math.log(targetMc);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const noise = i === steps ? 0 : 0.07 * this.rng.gauss();
      const mc = Math.exp(a + (b - a) * f + noise);
      this.pushCandle(c, from + f * (endAt - from), mc, this.rng.range(0, 3), false);
    }
    c.postMc = targetMc;
    this.touch(c);
  }

  private scheduleAmbientLoops(): void {
    const launch = (at: number) => {
      this.spawn(makeFillerCoin(this.rng), at);
      this.at(at + this.rng.range(8000, 20000), launch);
    };
    this.at(this.rng.range(3000, 9000), launch);

    const finalStretch = (at: number) => {
      const spec: CoinSpec = { ...makeFillerCoin(this.rng, "ambient"), profile: "run", ttlMs: null };
      const c = this.spawn(spec, at - this.rng.range(60000, 300000));
      this.fastForward(c, this.rng.range(0.4, 0.75), at - 500);
      this.at(at + this.rng.range(30000, 60000), finalStretch);
    };
    this.at(this.rng.range(30000, 60000), finalStretch);

    const chatter = (at: number) => {
      const t = makeNoiseTweet(this.rng);
      this.pushTweet(t.author, t.segments, false, undefined, at);
      this.at(at + this.rng.range(2000, 4500), chatter);
    };
    this.at(300, chatter);

    const prune = (at: number) => {
      this.prune();
      this.at(at + 2000, prune);
    };
    this.at(2000, prune);
  }

  private prune(): void {
    const byStage = (s: Stage) => [...this.coins.values()].filter((c) => c.stage === s);
    const drop = (c: Coin) => {
      if (this.positions.has(c.id)) return;
      if (this.focusId === c.id) return;
      if (this.roundView?.targetCoinId === c.id) return;
      if (this.sagaCoins.has(c.id)) return;
      // Your own launches stay on the board for as long as the session runs.
      if (c.dev) return;
      this.coins.delete(c.id);
      this.dirty = true;
    };
    const news = byStage("new").sort((a, b) => b.createdAt - a.createdAt);
    news.forEach((c, i) => {
      const old = this.simNow - c.createdAt > 300000;
      if (i >= MAX_NEW || (old && c.spec.role !== "target")) drop(c);
    });
    byStage("final")
      .sort((a, b) => b.stageAt - a.stageAt)
      .forEach((c, i) => i >= MAX_FINAL && drop(c));
    byStage("migrated")
      .sort((a, b) => (b.migratedAt ?? 0) - (a.migratedAt ?? 0))
      .forEach((c, i) => i >= MAX_MIGRATED && drop(c));
  }

  // ------------------------------------------------------------------ tweets

  private pushTweet(author: Author, segments: TweetSeg[], memeTweet: boolean, art: ArtSpec | undefined, at: number, extra: { mine?: boolean; scenarioId?: string } = {}): void {
    this.feed.unshift({ id: `t${this.tweetId++}`, at, author, segments, art, memeTweet, ...extra });
    if (this.feed.length > FEED_CAP) this.feed.length = FEED_CAP;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ rounds

  /**
   * Queue a round: the tweet lands `leadMs` from now, then the flood follows.
   * Returns the tweet time so callers can detect false starts.
   */
  startRound(opts: { memeId?: string; leadMs?: number } = {}): number {
    const meme = opts.memeId
      ? this.pack.find((m) => m.id === opts.memeId) ?? this.rng.pick(this.pack)
      : this.rng.pick(this.pack);
    const plan = makeRound(this.rng, meme, this.difficulty);
    const tTweet = this.simNow + (opts.leadMs ?? 0);
    if (this.length === "saga") {
      this.saga = planSaga(this.rng, meme.vamps?.length ?? 0);
      this.sagaMeme = meme;
      this.sagaEndAt = tTweet + this.saga.totalMs + 60_000;
      this.sagaCoins.clear();
    }
    this.roundPlan = plan;
    this.roundView = {
      memeId: meme.id,
      tTweet,
      tTargetAppear: null,
      targetCoinId: null,
      rightPair: plan.rightPair,
    };

    const mainSource: TweetSource = { author: plan.author, segments: plan.segments };
    this.at(tTweet, (at) => {
      this.pushTweet(plan.author, plan.segments, true, meme.art, at);
      this.emitNow();
    });

    plan.spawns.forEach((s, i) => {
      this.at(tTweet + s.at, (at) => {
        // Look-alikes and the right coin were all deployed off the round's tweet; fillers were not.
        const coin = this.spawn(s.spec, at, s.spec.role === "noise" ? undefined : mainSource);
        if (i === plan.targetIndex) this.onTargetSpawn(coin, at, plan);
      });
    });

    plan.distractors.forEach((d) => {
      this.at(tTweet + d.at, (at) => {
        this.pushTweet(d.author, d.segments, true, d.art, at);
      });
      const dSource: TweetSource = { author: d.author, segments: d.segments };
      d.spawns.forEach((s) => this.at(tTweet + s.at, (at) => this.spawn(s.spec, at, dSource)));
    });

    if (this.opts.autoRounds) {
      this.at(tTweet + this.rng.range(30000, 60000), () => this.startRound());
    }
    return tTweet;
  }

  private onTargetSpawn(coin: Coin, at: number, plan: RoundPlan): void {
    if (this.roundView) {
      this.roundView = { ...this.roundView, tTargetAppear: at, targetCoinId: coin.id };
    }
    if (plan.athMcUsd) coin.athSol = plan.athMcUsd / SOL_USD;
    this.scriptLaunch(coin, at);
    if (this.saga && this.length === "saga") {
      coin.sagaChapter = 0;
      this.sagaCoins.add(coin.id);
    } else if (plan.meme.big) this.scriptBigCoin(coin, at, plan.meme.big);
    // Snipers: each lands once, at its own reaction time after the coin appears.
    const times = Array.from({ length: plan.snipers }, () =>
      this.rng.range(plan.sniperReactMs[0], plan.sniperReactMs[1]),
    ).sort((a, b) => a - b);
    for (const dt of times) {
      this.at(at + dt, (t) => {
        this.applyBuy(coin, Math.min(1.5, this.rng.lognormal(0.35, 0.6)), t, "bot");
      });
    }
  }

  getRound(): RoundView | null {
    return this.roundView;
  }

  // ------------------------------------------------------------------ player

  /**
   * Buy at the current price. `at` should come from the input event timestamp
   * (via fromEventTime) so click latency is not charged to the player.
   * In a scored round this is also where false starts and wrong coins are judged.
   */
  /**
   * `sol` is per wallet, like GMGN's multi-wallet buy: with three wallets selected, 1 SOL buys 1 SOL in each
   * (three separate fills, 3 SOL in all). `wallets` overrides the selection (the per-wallet trade column).
   */
  quickBuy(coinId: string, sol: number, at: number = this.simNow, wallets?: number[]): PlayerTrade | null {
    // Catch the simulation up to the moment of the click, so the phase and the
    // price are the ones the player actually saw.
    if (at > this.simNow) this.advanceTo(at);
    const sc = this.scored;
    if (sc?.phase === "ended") return null;
    const c = this.coins.get(coinId);
    if (!c) return null;
    if (sc && (sc.phase === "countdown" || sc.phase === "armed")) {
      this.endScored("false_start", { buyAt: at });
      return null;
    }
    const which = (wallets ?? this.walletSel).filter((i) => i >= 0 && i < this.walletCount);
    if (!which.length || sol <= 0) return null;
    const total = sol * which.length;
    if (total > this.wallet + 1e-9) {
      this.buyNote = which.length > 1 ? `Not enough SOL: ${sol} × ${which.length} wallets is ${total.toFixed(2)} SOL` : null;
      return null;
    }
    const pos = this.positions.get(coinId) ?? newPos();
    const rank = c.botBuys;
    // One fill per wallet, each moving the price for the next.
    let tokens = 0;
    let spent = 0;
    for (const i of which) {
      const r = this.applyBuy(c, total / which.length, this.simNow, "player");
      if (r.tokens <= 0) continue;
      pos.wallets[i] += r.tokens;
      tokens += r.tokens;
      spent += r.spent;
    }
    if (tokens <= 0) return null;
    this.wallet -= spent;
    pos.tokens += tokens;
    pos.boughtTokens += tokens;
    pos.boughtSol += spent;
    this.positions.set(coinId, pos);
    const trade: PlayerTrade = { coinId, side: "buy", at, execAt: this.simNow, sol: spent, tokens, rank };
    this.trades.push(trade);
    this.tailBuy(c, spent, this.simNow);

    // Saga vamps: getting onto the new narrative is timed; its look-alikes cost points but never end the round.
    if (sc && sc.phase === "live" && (c.spec.wave ?? 0) > 0) {
      const v = sc.vamps[(c.spec.wave ?? 1) - 1];
      if (v) {
        if (c.spec.role === "target" && v.reactionMs === null && v.appearAt !== null) {
          v.reactionMs = Math.max(0, at - v.appearAt);
          sc.view = { ...sc.view, hit: { reactionMs: v.reactionMs, rating: ratingFor(v.reactionMs), buyNumber: rank + 1, ticker: c.spec.ticker } };
        } else if (c.spec.role === "decoy") {
          v.wrong++;
          sc.misses.push({ ticker: c.spec.ticker, flaw: c.spec.flaw ?? "unrelated", atMs: at - sc.tTweet, vamp: true });
          sc.view = { ...sc.view, misses: [...sc.misses] };
        }
        sc.view = { ...sc.view, vamps: sc.vamps.map((x) => ({ ...x })) };
      }
      this.emitNow();
      return trade;
    }
    if (sc && sc.phase === "live" && !sc.firstBuy) {
      const isTarget = c.spec.role === "target";
      const flaw = isTarget ? null : (c.spec.flaw ?? "unrelated");
      if (isTarget) {
        sc.firstBuy = { trade, coinId, isTarget, flaw };
        const appear = this.roundView?.tTargetAppear ?? at;
        const reactionMs = Math.max(0, at - appear);
        const hit: Hit = { reactionMs, rating: ratingFor(reactionMs), buyNumber: rank + 1, ticker: c.spec.ticker };
        sc.view = { ...sc.view, hit };
      } else {
        const miss: WrongBuy = { ticker: c.spec.ticker, flaw: flaw!, atMs: at - sc.tTweet };
        sc.misses.push(miss);
        sc.view = { ...sc.view, misses: [...sc.misses] };
        if (!this.opts.training) {
          sc.firstBuy = { trade, coinId, isTarget, flaw };
          this.endScored("wrong_coin");
        }
      }
    }
    this.emitNow();
    return trade;
  }

  /**
   * Sell `fraction` of what the trading wallets hold (or of every wallet with `from: "all"`, as TP/SL orders do).
   * If the trading wallets hold none of it, it sells from all of them rather than doing nothing.
   */
  sell(coinId: string, fraction: number, at: number = this.simNow, from: "selected" | "all" = "selected", wallets?: number[]): PlayerTrade | null {
    if (at > this.simNow) this.advanceTo(at);
    const c = this.coins.get(coinId);
    const pos = this.positions.get(coinId);
    if (!c || !pos || pos.tokens <= 0) return null;
    const f = Math.min(1, Math.max(0, fraction));
    let which = wallets ?? (from === "all" ? pos.wallets.map((_, i) => i) : this.walletSel);
    // Only when no wallet was named: if the trading wallets hold none of it, sell from all of them.
    if (!wallets && which.every((i) => pos.wallets[i] <= 1e-6)) which = pos.wallets.map((_, i) => i);
    const parts = pos.wallets.map((t, i) => (which.includes(i) ? t * f : 0));
    const tokens = parts.reduce((n, x) => n + x, 0);
    if (tokens <= 0) return null;
    if (this.simNow < c.lockUntil) return null;
    const sol = this.applySell(c, tokens, this.simNow, "player");
    pos.wallets = pos.wallets.map((t, i) => Math.max(0, t - parts[i]));
    pos.tokens = Math.max(0, pos.tokens - tokens);
    pos.soldSol += sol;
    this.wallet += sol;
    this.logIfClosed(coinId, c, pos);
    const trade: PlayerTrade = { coinId, side: "sell", at, execAt: this.simNow, sol, tokens, rank: c.botBuys };
    this.trades.push(trade);
    this.tailSell(c, tokens / (tokens + pos.tokens), this.simNow);

    // Selling out of the right coin finishes a successful round.
    const sc = this.scored;
    // (A saga keeps going until its story is told; selling out between chapters is allowed.)
    if (sc?.phase === "live" && sc.firstBuy?.isTarget && this.allClosed() && this.simNow >= this.sagaEndAt) this.endScored("success");
    this.emitNow();
    return trade;
  }

  /** Record a fully sold position for the Portfolio. Re-buys of the same coin log only their own part. */
  private logIfClosed(coinId: string, c: Coin, pos: { tokens: number; boughtSol: number; soldSol: number; promoSol: number }): void {
    if (pos.tokens >= 1e-6) return;
    const done = this.logged.get(coinId) ?? { bought: 0, sold: 0 };
    const spent = pos.boughtSol + pos.promoSol;
    const invested = spent - done.bought;
    if (invested <= 0) return;
    this.closedLog.push({
      id: this.closedLog.length + 1,
      coinId,
      ticker: c.spec.ticker,
      name: c.spec.name,
      art: c.spec.art,
      invested,
      returned: pos.soldSol - done.sold,
    });
    this.logged.set(coinId, { bought: spent, sold: pos.soldSol });
  }

  private holding(coinId: string): boolean {
    return (this.positions.get(coinId)?.tokens ?? 0) > 1e-6;
  }

  private allClosed(): boolean {
    return [...this.positions.values()].every((p) => p.tokens < 1e-6);
  }

  // ------------------------------------------------------------ scored round

  /**
   * Start a scored FIRST TX round: 3 s countdown, a random armed wait, then the
   * tweet and the flood. Safe to call twice (React strict mode).
   */
  startScored(opts: { memeId?: string } = {}): void {
    if (this.scored) return;
    const tStart = this.simNow;
    const tArm = tStart + COUNTDOWN_MS;
    const tTweet = tArm + this.rng.range(ARMED_WAIT_MS[0], ARMED_WAIT_MS[1]);
    const sc: ScoredState = {
      phase: "countdown",
      tStart,
      tArm,
      tTweet,
      tEnd: null,
      firstBuy: null,
      misses: [],
      vamps: [],
      result: null,
      view: { phase: "countdown", tStart, tArm, tTweet, tEnd: null, result: null, hit: null, misses: [], training: !!this.opts.training, length: this.length, vamps: [] },
    };
    this.scored = sc;
    this.emitEvery = EMIT_SCORED_MS;
    this.startRound({ memeId: opts.memeId, leadMs: tTweet - this.simNow });

    this.at(tArm, () => {
      if (sc.phase !== "countdown") return;
      this.setPhase(sc, "armed");
    });
    this.at(tTweet, () => {
      if (sc.phase !== "armed" && sc.phase !== "countdown") return;
      this.setPhase(sc, "live");
    });
    this.at(tTweet + MISS_AFTER_MS, () => {
      if (sc.phase === "live" && !sc.firstBuy) this.endScored("missed");
    });
    // Past the soft limit the round ends as soon as you are flat. While you hold, it runs until you sell out (or Space).
    this.at(tTweet + MAX_ROUND_MS, () => {
      if (sc.phase === "live" && this.allClosed() && this.simNow >= this.sagaEndAt) this.finishLive();
    });
    // Saga: once the last coin has played out (dead or consolidating), the story is over and so is the round,
    // holding or not (anything left is market-sold). Before its script is known, end only when you are flat.
    if (this.length === "saga") {
      const check = (a: number) => {
        if (sc.phase !== "live") return;
        const last = this.sagaEndCoin;
        if (last && a >= this.sagaEndAt) this.finishLive();
        else if (!last && a >= this.sagaEndAt && this.allClosed()) this.finishLive();
        else this.at(a + 1000, check);
      };
      this.at(tTweet + 60_000, check);
    }
    this.emitNow();
  }

  /**
   * End a live round on request (Space). Only allowed when you are flat: while you hold anything the round
   * runs until you sell 100%. Returns false when refused.
   */
  endRound(): boolean {
    if (this.scored?.phase !== "live" || !this.allClosed()) return false;
    this.finishLive();
    return true;
  }

  isScoredOver(): boolean {
    return this.scored?.phase === "ended";
  }

  private finishLive(): void {
    const sc = this.scored;
    if (!sc || sc.phase !== "live") return;
    this.endScored(sc.firstBuy?.isTarget ? "success" : "missed");
  }

  private setPhase(sc: ScoredState, phase: RoundPhase): void {
    sc.phase = phase;
    sc.view = { ...sc.view, phase };
    this.emitNow();
  }

  private endScored(outcome: RoundOutcome, extra: { buyAt?: number } = {}): void {
    const sc = this.scored;
    if (!sc || sc.phase === "ended") return;
    this.closeAllPositions();
    sc.phase = "ended";
    sc.tEnd = this.simNow;
    sc.result = this.buildResult(sc, outcome, extra.buyAt ?? null);
    sc.view = { ...sc.view, phase: "ended", tEnd: sc.tEnd, result: sc.result };
    this.emitEvery = EMIT_EVERY_MS;
    this.emitNow();
  }

  /** Market-sell everything so the round's PnL is realised, slippage and fees included. */
  private closeAllPositions(): void {
    for (const [coinId, pos] of this.positions) {
      const c = this.coins.get(coinId);
      if (!c || pos.tokens < 1e-6) continue;
      const tokens = pos.tokens;
      const sol = this.applySell(c, tokens, this.simNow, "player", true);
      pos.tokens = 0;
      pos.wallets = pos.wallets.map(() => 0);
      pos.soldSol += sol;
      this.wallet += sol;
      this.logIfClosed(coinId, c, pos);
      this.trades.push({ coinId, side: "sell", at: this.simNow, execAt: this.simNow, sol, tokens, rank: c.botBuys });
    }
  }

  private summary(spec: CoinSpec): CoinSummary {
    return { ticker: spec.ticker, name: spec.name, art: spec.art, config: spec.config };
  }

  private buildResult(sc: ScoredState, outcome: RoundOutcome, falseStartAt: number | null): RoundResult {
    const plan = this.roundPlan!;
    const view = this.roundView!;
    const right = plan.spawns[plan.targetIndex].spec;
    const elapsed = this.simNow - sc.tTweet;
    const decoys = plan.spawns
      .filter((s) => s.spec.role === "decoy" && s.at <= elapsed)
      .map((s) => ({ ...this.summary(s.spec), flaw: s.spec.flaw! }));

    const fb = sc.firstBuy;
    const boughtCoin = fb ? this.coins.get(fb.coinId) : undefined;
    const pos = fb ? this.positions.get(fb.coinId) : undefined;
    // Saga PnL covers the whole story: the original, every vamp and anything else you traded in the round.
    const saga = this.length === "saga";
    const all = [...this.positions.values()];
    const boughtSol = saga ? all.reduce((n, p) => n + p.boughtSol, 0) : (pos?.boughtSol ?? 0);
    const closedSol = saga ? all.reduce((n, p) => n + p.soldSol, 0) : (pos?.soldSol ?? 0);
    // Boosts and DEX payments you bought are part of the trade.
    const promoSol = saga ? all.reduce((n, p) => n + p.promoSol, 0) : (pos?.promoSol ?? 0);
    const pnlSol = closedSol - boughtSol - promoSol;
    const costSol = boughtSol + promoSol;
    const success = outcome === "success" && fb?.isTarget === true;
    const reactionMs = success && view.tTargetAppear !== null ? Math.max(0, fb.trade.at - view.tTargetAppear) : null;

    return {
      outcome,
      memeName: plan.meme.name,
      authorName: plan.author.name,
      authorHandle: plan.author.handle,
      tweetSegments: plan.segments,
      rightCoin: this.summary(right),
      rightAppearMs: view.tTargetAppear !== null ? view.tTargetAppear - sc.tTweet : null,
      decoys,
      bought: fb && boughtCoin ? { ...this.summary(boughtCoin.spec), flaw: fb.flaw } : null,
      earlyMs: falseStartAt !== null ? Math.max(0, sc.tTweet - falseStartAt) : null,
      reactionMs,
      tweetToBuyMs: success ? fb.trade.at - sc.tTweet : null,
      buyNumber: fb ? fb.trade.rank + 1 : null,
      entryMcUsd: fb ? (fb.trade.sol / fb.trade.tokens) * SUPPLY * SOL_USD : null,
      boughtSol,
      promoSol,
      closedSol,
      pnlSol,
      pnlPct: costSol > 0 ? (pnlSol / costSol) * 100 : 0,
      rating: reactionMs !== null ? ratingFor(reactionMs) : null,
      ...(() => {
        const plain = sc.misses.filter((m) => !m.vamp).length;
        const pnlPct = costSol > 0 ? (pnlSol / costSol) * 100 : 0;
        if (saga) {
          const { total, ...rest } = scoreSaga({
            success,
            reactionMs,
            buyNumber: fb ? fb.trade.rank + 1 : null,
            pnlPct,
            wrongBuys: plain,
            vampReactions: sc.vamps.map((v) => v.reactionMs),
            vampWrong: sc.vamps.reduce((n, v) => n + v.wrong, 0),
          });
          return { score: total, scoreParts: rest };
        }
        const { total, ...rest } = scoreRound({ success, reactionMs, buyNumber: fb ? fb.trade.rank + 1 : null, pnlPct, wrongBuys: plain });
        return { score: total, scoreParts: { ...rest, vamps: 0 } };
      })(),
      wrongBuys: this.opts.training || saga ? [...sc.misses] : [],
      training: !!this.opts.training,
      length: this.length,
      vamps: sc.vamps.map((v) => ({ ...v })),
      kol: { tailers: this.kolStats.tailers, tailSol: this.kolStats.tailSol, dumpedOn: this.kolStats.dumpedOn, called: this.kolStats.called },
    };
  }

  getTrades(): readonly PlayerTrade[] {
    return this.trades;
  }

  // ------------------------------------------------------------------ views

  getCandles(coinId: string): readonly Candle[] {
    return this.coins.get(coinId)?.candles ?? [];
  }

  /** Current view of any coin on the board, whatever column it is in. */
  getCoinView(coinId: string): CoinView | null {
    const c = this.coins.get(coinId);
    return c ? this.coinView(c) : null;
  }

  /** Recent trades on a coin, newest first. Identity changes only when the coin does. */
  getTape(coinId: string): readonly TapeEntry[] {
    const c = this.coins.get(coinId);
    if (!c) return [];
    if (c.tapeRev !== c.rev) {
      c.tapeView = [...c.tape];
      c.tapeRev = c.rev;
    }
    return c.tapeView;
  }

  /** Your trades on one coin, oldest first (for chart markers). */
  getTradesFor(coinId: string): PlayerTrade[] {
    return this.trades.filter((t) => t.coinId === coinId);
  }

  /** True while a coin's migration pause is running (player buys are refused). */
  isMigrating(coinId: string): boolean {
    const c = this.coins.get(coinId);
    return !!c && this.simNow < c.lockUntil;
  }

  /** Keep a coin alive while its page is open. Pass null to release. */
  focus(coinId: string | null): void {
    this.focusId = coinId;
  }

  /** Test and results helper. The UI must not use this: roles are hidden in play. */
  debugCoins(): { id: string; ticker: string; role: CoinSpec["role"]; flaw?: CoinSpec["flaw"]; stage: Stage }[] {
    return [...this.coins.values()].map((c) => ({
      id: c.id,
      ticker: c.spec.ticker,
      role: c.spec.role,
      flaw: c.spec.flaw,
      stage: c.stage,
    }));
  }

  private coinView(c: Coin): CoinView {
    if (c.view && c.viewRev === c.rev) return c.view;
    const mcSol = this.mc(c);
    c.view = {
      id: c.id,
      ticker: c.spec.ticker,
      name: c.spec.name,
      art: c.spec.art,
      config: c.spec.config,
      createdAt: c.createdAt,
      stage: c.stage,
      mcSol,
      mcUsd: toUsd(mcSol),
      volumeUsd: toUsd(c.volumeSol),
      progress: c.migrated ? 1 : curveLib.progress(c.curve),
      txCount: c.txCount,
      buys: c.buys,
      sells: c.sells,
      holders: c.holders,
      feesSol: c.volumeSol * FEE,
      liqUsd: c.migrated ? toUsd(this.mc(c)) * 2 * this.poolShare(c) : toUsd(c.curve.realSol),
      earlyAvgMcUsd: toUsd(Math.max(c.top10Avg, c.earlyVol > 0 ? c.earlyMcW / c.earlyVol : this.mc(c))),
      migratedAt: c.migratedAt,
      changePct: c.candles.length && c.candles[0].o > 0 ? (mcSol / c.candles[0].o - 1) * 100 : 0,
      migratingUntil: Number.isFinite(c.lockUntil) ? c.lockUntil : null,
      buyVolUsd: toUsd(c.buyVolSol),
      sellVolUsd: toUsd(c.sellVolSol),
      source: c.source,
      devMigrated: c.devMigrated,
      proTraders: Math.round(c.holders * c.proFrac),
      bundlers: c.bundlers,
      dexPaid: c.dexPaid,
      called: c.thesis !== null,
      tailers: c.tailers.length,
      tailSol: c.tailers.reduce((n, t) => n + t.sol, 0),
      pair: c.pair,
      mint: c.mint,
      creator: c.creator,
      stats: { ...c.stats, top10: this.top10(c) },
      held: (this.positions.get(c.id)?.tokens ?? 0) > 0,
    };
    c.viewRev = c.rev;
    return c.view;
  }

  private buildSnapshot(): Snapshot {
    const all = [...this.coins.values()];
    const stage = (s: Stage) => all.filter((c) => c.stage === s);
    const newPairs = stage("new").sort((a, b) => b.createdAt - a.createdAt).map((c) => this.coinView(c));
    const finalStretch = stage("final").sort((a, b) => b.stageAt - a.stageAt).map((c) => this.coinView(c));
    const migrated = stage("migrated")
      .sort((a, b) => (b.migratedAt ?? 0) - (a.migratedAt ?? 0))
      .map((c) => this.coinView(c));
    const positions: Position[] = [...this.positions.entries()].map(([coinId, p]) => {
      const c = this.coins.get(coinId);
      const price = c ? this.mc(c) / SUPPLY : 0;
      return { coinId, ...p, valueSol: p.tokens * price };
    });
    return {
      version: this.version,
      now: this.simNow,
      newPairs,
      finalStretch,
      migrated,
      feed: [...this.feed],
      walletSol: this.wallet,
      positions,
      walletSel: [...this.walletSel],
      devSol: this.opts.dev ? this.devSol : null,
      launches: this.getLaunches(),
      walletCount: this.walletCount,
      closed: [...this.closedLog],
      orders: this.orders.map((o) => ({ ...o })),
      round: this.roundView,
      scored: this.scored?.view ?? null,
    };
  }
}
