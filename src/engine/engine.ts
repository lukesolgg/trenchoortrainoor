import * as curveLib from "./curve";
import { FEE, MIGRATION_LOCK_MS, MIGRATION_MC_USD, SOL_USD, SUPPLY, toUsd, type Curve } from "./curve";
import { DIFFICULTIES, type Difficulty } from "./difficulty";
import { Rng } from "./rng";
import { BOOSTS, KOLS } from "./content";
import { ARMED_WAIT_MS, COUNTDOWN_MS, MAX_ROUND_MS, MISS_AFTER_MS, ratingFor, scoreRound } from "./scoring";
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
} from "./types";

export interface EngineOptions {
  seed: number;
  difficulty: DifficultyId;
  pack?: Meme[];
  /** Free-play preview: a tweet and its runner every 30-60 s. */
  autoRounds?: boolean;
  startingSol?: number;
  /** Real clock in ms. Defaults to performance.now. */
  clock?: () => number;
  /** Training style: a wrong buy costs points but does not end the round. */
  training?: boolean;
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
  /** `rug`: the dev dumps; the whole drop lands in one step (one giant red candle). */
  kind: "push" | "dip" | "base" | "rug";
  end: number;
  to: number;
  /** Multiplier on trade size. */
  vol: number;
  /** Per-step noise. */
  noise: number;
  /** Where the leg started (SOL market cap). Set when the leg is entered; used by pre-migration scripts. */
  from?: number;
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
  result: RoundResult | null;
  view: ScoredView;
}

interface QueuedEvent {
  at: number;
  seq: number;
  run: (at: number) => void;
}

const FINAL_AT = 0.35;
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
    { tokens: number; boughtTokens: number; boughtSol: number; soldSol: number }
  >();
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
    this.clock = opts.clock ?? (() => performance.now());
    this.seedAmbient();
    this.scheduleAmbientLoops();
    if (opts.autoRounds) this.at(this.rng.range(8000, 50000), () => this.startRound());
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

  private spawn(spec: CoinSpec, at: number, source?: TweetSource | null): Coin {
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
      volumeSol: 0,
      candles: [],
      tape: [],
      tapeView: [],
      tapeRev: -1,
      mint: `${this.rng.addr(3)}...pump`,
      creator: `${this.rng.addr(3)}...${this.rng.addr(3)}`,
      stats: {
        top10: Math.round(this.rng.range(5, 40)),
        dev: this.rng.chance(0.6) ? 0 : Math.round(this.rng.range(1, 12)),
        snipers: this.rng.chance(0.5) ? 0 : Math.round(this.rng.range(1, 14)),
        insiders: this.rng.chance(0.7) ? 0 : Math.round(this.rng.range(1, 8)),
      },
      flowUntil: spec.ttlMs === null ? null : at + spec.ttlMs,
      rev: 0,
      view: null,
      viewRev: -1,
    };
    this.coins.set(id, coin);
    // Dev buy on launch, like the real thing.
    this.applyBuy(coin, this.rng.range(0.2, 2.5), at, "bot");
    this.scheduleFlow(coin, at);
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

  // ------------------------------------------------------------------ socials

  private socialSeq = 1;

  private social(c: Coin, at: number, e: Omit<SocialEvent, "id" | "at" | "mc"> & { mc?: number }, tape = true): void {
    const ev: SocialEvent = { id: this.socialSeq++, at, mc: e.mc ?? this.mc(c), ...e };
    c.social.push(ev);
    if (c.social.length > 200) c.social.shift();
    if (tape && e.side && e.sol > 0) this.pushTape(c, at, "bot", e.side, e.sol, e.kind === "dev" ? "DEV" : e.name);
    this.touch(c);
  }

  /** A KOL apes in (with a real buy) or takes profit. Buys/sells only make the event; price is moved by the caller. */
  private kolTrade(c: Coin, at: number, side: "buy" | "sell", sol: number): void {
    if (c.social.filter((e) => e.kind === "kol").length >= 10) return;
    if (side === "buy") {
      const free = KOLS.map((_, i) => i).filter((i) => !c.kolsIn.includes(i));
      if (!free.length || c.kolsIn.length >= 6) return;
      const i = this.rng.pick(free);
      c.kolsIn.push(i);
      this.social(c, at, { kind: "kol", side, name: KOLS[i].name, hue: KOLS[i].hue, sol });
    } else {
      if (!c.kolsIn.length) return;
      const i = c.kolsIn.splice(this.rng.int(0, c.kolsIn.length - 1), 1)[0];
      this.social(c, at, { kind: "kol", side, name: KOLS[i].name, hue: KOLS[i].hue, sol });
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
      const trade = this.sell(c.id, o.fraction);
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
    // A coin with an ATH target runs there in pushes with pullbacks and consolidation between them.
    if (c.big) {
      c.legs = this.planBigRun(c.big, c.lockUntil);
      c.moonUntil = c.legs[c.legs.length - 1].end;
    } else if (c.athSol && c.athSol > c.postMc) {
      c.legs = this.planRun(c.postMc, c.athSol, c.lockUntil);
      c.moonUntil = c.legs[c.legs.length - 1].end;
    }
    this.setStage(c, "migrated", at);
    // Somebody always pays for a boost once it is on the DEX.
    if (c.big || c.legs.length) {
      for (let i = 0, n = this.rng.int(1, 3); i < n; i++) {
        this.at(at + MIGRATION_LOCK_MS + this.rng.range(1000, 40000), (a) => {
          if (!this.coins.has(c.id)) return;
          this.social(c, a, { kind: "boost", side: null, name: "Boost", hue: 50, sol: 0, label: this.rng.pick(BOOSTS) }, false);
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
      const dead = Math.max(4000 / SOL_USD, ath * this.rng.range(0.015, 0.03));
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
    const legs: Leg[] = [leg("push", r.range(200, 400), sol(r.range(3000, 10000)), 1, 0.01)];
    // Most runners are over the line in 2.5-5 s (txgym sweat rounds: 3, 4 and 5 s); a few grind for up to 12 s.
    if (r.chance(0.75)) {
      legs.push(leg("push", r.range(2200, 4600), over, 1, 0.03));
    } else {
      const total = r.range(5000, 12000);
      const burst = sol(r.range(30000, 35000));
      legs.push(leg("push", r.range(900, 2400), burst, 1, 0.03));
      const rest = Math.max(1500, at + total - t);
      legs.push(leg("dip", rest * 0.3, burst * r.range(0.84, 0.93), 1, 0.02));
      legs.push(leg("base", rest * 0.35, burst * r.range(0.9, 0.98), 0.5, 0.015));
      legs.push(leg("push", rest * 0.35, over, 1, 0.025));
    }
    c.scriptStart = at;
    c.preLegs = legs;
    this.at(at, (a) => this.driveStep(c, a));
    // The dev's own buy at launch shows on the chart.
    this.at(legs[0].end, (a) => this.social(c, a, { kind: "dev", side: "buy", name: "Dev", hue: 45, sol: this.rng.range(0.5, 4) }));
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
    const legs = c.preLegs;
    const i = legs.findIndex((l) => at < l.end);
    const leg = i === -1 ? legs[legs.length - 1] : legs[i];
    const legStart = i <= 0 ? c.scriptStart : legs[i - 1].end;
    const now = curveLib.mcSol(c.curve);
    if (leg.from === undefined) leg.from = now;
    const frac = i === -1 ? 1 : Math.min(1, (at - legStart) / Math.max(1, leg.end - legStart));
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
      case "standard":
        add("dip", r.range(3000, 5000), P * r.range(0.8, 0.88), 1.6, 0.025);
        add("base", r.range(3000, 5000), P * r.range(0.86, 0.92), 0.6, 0.02);
        add("dip", r.range(12000, 20000), b.trip * r.range(1.02, 1.1), 1.2, 0.022);
        add("base", r.range(8000, 12000), b.trip, 0.4, 0.014);
        break;
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
      const impact = sol / 150;
      tokens = (sol * (1 - FEE)) / (c.postMc / SUPPLY);
      spent = sol;
      c.postMc *= 1 + impact;
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
      const gross = tokens * (c.postMc / SUPPLY);
      sol = gross * (1 - FEE);
      c.postMc /= 1 + gross / 150;
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
    if (scripted) {
      const leg = c.legs.find((l) => at < l.end);
      if (leg?.kind === "rug" && leg.from === undefined) {
        // Dev dump: the whole drop prints in one step.
        if (!c.devSold) {
          c.devSold = true;
          this.social(c, at, { kind: "dev", side: "sell", name: "Dev", hue: 45, sol: before * this.rng.range(0.04, 0.08), mc: before }, false);
        }
        c.postMc = leg.to;
        c.osc = 0;
        leg.from = leg.to;
        const size = before * this.rng.range(0.04, 0.08);
        this.record(c, at, size);
        c.volumeSol += size;
        c.sellVolSol += size;
        c.sells++;
        c.txCount++;
        this.pushTape(c, at, "bot", "sell", size);
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
        const frac = Math.min(1, Math.max(0, (at + 750 - start) / Math.max(1, leg.end - start)));
        want = leg.from * Math.pow(leg.to / leg.from, frac);
        volMul *= leg.vol;
      } else {
        want = c.legs[c.legs.length - 1].to;
      }
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
      // Big moves are sometimes a KOL; the first real dump after migration is sometimes the dev.
      if (whaleSide) {
        const size = Math.max(1, toUsd(next) / 20000) * this.rng.range(0.5, 2);
        if (whaleSide === "sell" && !c.devSold && leg?.kind === "dip" && this.rng.chance(0.25)) {
          c.devSold = true;
          this.social(c, at, { kind: "dev", side: "sell", name: "Dev", hue: 45, sol: size * 2, mc: next });
        } else if (this.rng.chance(0.18)) {
          this.kolTrade(c, at, whaleSide, size);
        }
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
    // Targets walk for another minute after the run ends, then go quiet.
    if (c.spec.role === "target" && c.migratedAt !== null && at > Math.max(c.migratedAt + 90000, (c.moonUntil ?? 0) + 40000) && !this.holding(c.id)) return false;
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

  private pushTweet(author: Author, segments: TweetSeg[], memeTweet: boolean, art: ArtSpec | undefined, at: number): void {
    this.feed.unshift({ id: `t${this.tweetId++}`, at, author, segments, art, memeTweet });
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
    if (plan.meme.big) this.scriptBigCoin(coin, at, plan.meme.big);
    // Snipers: each lands once, at its own reaction time after the coin appears.
    const times = Array.from({ length: plan.snipers }, () =>
      this.rng.range(plan.sniperReactMs[0], plan.sniperReactMs[1]),
    ).sort((a, b) => a - b);
    for (const dt of times) {
      this.at(at + dt, (t) => {
        this.applyBuy(coin, Math.min(8, this.rng.lognormal(1.4, 0.6)), t, "bot");
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
  quickBuy(coinId: string, sol: number, at: number = this.simNow): PlayerTrade | null {
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
    if (sol <= 0 || sol > this.wallet + 1e-9) return null;

    const rank = c.botBuys;
    const { tokens, spent } = this.applyBuy(c, sol, this.simNow, "player");
    if (tokens <= 0) return null;
    this.wallet -= spent;
    const pos = this.positions.get(coinId) ?? { tokens: 0, boughtTokens: 0, boughtSol: 0, soldSol: 0 };
    pos.tokens += tokens;
    pos.boughtTokens += tokens;
    pos.boughtSol += spent;
    this.positions.set(coinId, pos);
    const trade: PlayerTrade = { coinId, side: "buy", at, execAt: this.simNow, sol: spent, tokens, rank };
    this.trades.push(trade);

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

  sell(coinId: string, fraction: number, at: number = this.simNow): PlayerTrade | null {
    if (at > this.simNow) this.advanceTo(at);
    const c = this.coins.get(coinId);
    const pos = this.positions.get(coinId);
    if (!c || !pos || pos.tokens <= 0) return null;
    const tokens = pos.tokens * Math.min(1, Math.max(0, fraction));
    if (tokens <= 0) return null;
    if (this.simNow < c.lockUntil) return null;
    const sol = this.applySell(c, tokens, this.simNow, "player");
    pos.tokens -= tokens;
    pos.soldSol += sol;
    this.wallet += sol;
    this.logIfClosed(coinId, c, pos);
    const trade: PlayerTrade = { coinId, side: "sell", at, execAt: this.simNow, sol, tokens, rank: c.botBuys };
    this.trades.push(trade);

    // Selling out of the right coin finishes a successful round.
    const sc = this.scored;
    if (sc?.phase === "live" && sc.firstBuy?.isTarget && this.allClosed()) this.endScored("success");
    this.emitNow();
    return trade;
  }

  /** Record a fully sold position for the Portfolio. Re-buys of the same coin log only their own part. */
  private logIfClosed(coinId: string, c: Coin, pos: { tokens: number; boughtSol: number; soldSol: number }): void {
    if (pos.tokens >= 1e-6) return;
    const done = this.logged.get(coinId) ?? { bought: 0, sold: 0 };
    const invested = pos.boughtSol - done.bought;
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
    this.logged.set(coinId, { bought: pos.boughtSol, sold: pos.soldSol });
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
      result: null,
      view: { phase: "countdown", tStart, tArm, tTweet, tEnd: null, result: null, hit: null, misses: [], training: !!this.opts.training },
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
      if (sc.phase === "live" && this.allClosed()) this.finishLive();
    });
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
    const boughtSol = pos?.boughtSol ?? 0;
    const closedSol = pos?.soldSol ?? 0;
    const pnlSol = closedSol - boughtSol;
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
      closedSol,
      pnlSol,
      pnlPct: boughtSol > 0 ? (pnlSol / boughtSol) * 100 : 0,
      rating: reactionMs !== null ? ratingFor(reactionMs) : null,
      ...(() => {
        const parts = scoreRound({
          success,
          reactionMs,
          buyNumber: fb ? fb.trade.rank + 1 : null,
          pnlPct: boughtSol > 0 ? (pnlSol / boughtSol) * 100 : 0,
          wrongBuys: sc.misses.length,
        });
        const { total, ...rest } = parts;
        return { score: total, scoreParts: rest };
      })(),
      wrongBuys: this.opts.training ? [...sc.misses] : [],
      training: !!this.opts.training,
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
      liqUsd: c.migrated ? toUsd(this.mc(c)) * 0.12 : toUsd(c.curve.realSol),
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
      pair: c.pair,
      mint: c.mint,
      creator: c.creator,
      stats: c.stats,
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
      closed: [...this.closedLog],
      orders: this.orders.map((o) => ({ ...o })),
      round: this.roundView,
      scored: this.scored?.view ?? null,
    };
  }
}
