import * as curveLib from "./curve";
import { FEE, MIGRATION_LOCK_MS, SOL_USD, SUPPLY, toUsd, type Curve } from "./curve";
import { DIFFICULTIES, type Difficulty } from "./difficulty";
import { Rng } from "./rng";
import { ARMED_WAIT_MS, COUNTDOWN_MS, MAX_ROUND_MS, MISS_AFTER_MS, ratingFor } from "./scoring";
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
}

interface Coin {
  id: string;
  spec: CoinSpec;
  createdAt: number;
  curve: Curve;
  migrated: boolean;
  migratedAt: number | null;
  lockUntil: number;
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

  private pushTape(c: Coin, at: number, by: "bot" | "player", side: "buy" | "sell", sol: number): void {
    const id = this.tapeSeq++;
    c.tape.unshift({
      id,
      at,
      by: by === "player" ? "you" : "bot",
      trader: by === "player" ? "You" : new Rng(id * 2654435761).addr(4),
      side,
      sol,
      mcUsd: toUsd(this.mc(c)),
    });
    if (c.tape.length > TAPE_CAP) c.tape.length = TAPE_CAP;
  }

  private touch(c: Coin): void {
    c.rev++;
    this.dirty = true;
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
    this.setStage(c, "migrated", at);
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

  private applySell(c: Coin, tokens: number, at: number, by: "bot" | "player"): number {
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
    if (c.flowUntil !== null && at > c.flowUntil && !c.migrated) return;

    if (c.migrated) {
      if (!this.walkMigrated(c, at)) return;
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
    const drift = moon ? 0.009 : c.spec.role === "target" ? -0.0025 : this.rng.range(-0.0005, 0.0005);
    const vol = moon ? 0.02 : quiet ? 0.006 : 0.015;
    const before = c.postMc;
    c.postMc = Math.max(1, c.postMc * Math.exp(drift + vol * this.rng.gauss()));
    c.txCount += this.rng.int(0, 3);
    const size = this.rng.lognormal(0.5, 0.7);
    this.record(c, at, size);
    c.volumeSol += size;
    this.pushTape(c, at, "bot", c.postMc >= before ? "buy" : "sell", size);
    this.touch(c);
    // Targets walk for another minute after the run ends, then go quiet.
    if (c.spec.role === "target" && c.migratedAt !== null && at > c.migratedAt + 90000) return false;
    return true;
  }

  // ---------------------------------------------------------------- ambient

  private seedAmbient(): void {
    // Final Stretch: coins partway up the curve, slowly climbing.
    for (let i = 0; i < 8; i++) {
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
    }
    // New Pairs: a few launches already on the board.
    for (let i = 0; i < 10; i++) {
      this.spawn(makeFillerCoin(this.rng), -this.rng.range(1000, 30000));
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
      this.at(at + this.rng.range(500, 1800), launch);
    };
    this.at(600, launch);

    const finalStretch = (at: number) => {
      const spec: CoinSpec = { ...makeFillerCoin(this.rng, "ambient"), profile: "run", ttlMs: null };
      const c = this.spawn(spec, at - this.rng.range(60000, 300000));
      this.fastForward(c, this.rng.range(0.4, 0.75), at - 500);
      this.at(at + this.rng.range(6000, 12000), finalStretch);
    };
    this.at(5000, finalStretch);

    const chatter = (at: number) => {
      const t = makeNoiseTweet(this.rng);
      this.pushTweet(t.author, t.segments, false, undefined, at);
      this.at(at + this.rng.range(3000, 7000), chatter);
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
      const old = this.simNow - c.createdAt > 45000;
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
      sc.firstBuy = { trade, coinId, isTarget, flaw: isTarget ? null : (c.spec.flaw ?? "unrelated") };
      if (!isTarget) this.endScored("wrong_coin");
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
    const sol = this.applySell(c, tokens, this.simNow, "player");
    pos.tokens -= tokens;
    pos.soldSol += sol;
    this.wallet += sol;
    const trade: PlayerTrade = { coinId, side: "sell", at, execAt: this.simNow, sol, tokens, rank: c.botBuys };
    this.trades.push(trade);

    // Selling out of the right coin finishes a successful round.
    const sc = this.scored;
    if (sc?.phase === "live" && sc.firstBuy?.isTarget && this.allClosed()) this.endScored("success");
    this.emitNow();
    return trade;
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
      result: null,
      view: { phase: "countdown", tStart, tArm, tTweet, tEnd: null, result: null },
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
    this.at(tTweet + MAX_ROUND_MS, () => {
      if (sc.phase === "live") this.finishLive();
    });
    this.emitNow();
  }

  /** End a live round on request (Space): success if you hold the right coin, else missed. */
  endRound(): void {
    if (this.scored?.phase === "live") this.finishLive();
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
    sc.view = { phase: "ended", tStart: sc.tStart, tArm: sc.tArm, tTweet: sc.tTweet, tEnd: sc.tEnd, result: sc.result };
    this.emitEvery = EMIT_EVERY_MS;
    this.emitNow();
  }

  /** Market-sell everything so the round's PnL is realised, slippage and fees included. */
  private closeAllPositions(): void {
    for (const [coinId, pos] of this.positions) {
      const c = this.coins.get(coinId);
      if (!c || pos.tokens < 1e-6) continue;
      const tokens = pos.tokens;
      const sol = this.applySell(c, tokens, this.simNow, "player");
      pos.tokens = 0;
      pos.soldSol += sol;
      this.wallet += sol;
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
      earlyAvgMcUsd: c.earlyVol > 0 ? toUsd(c.earlyMcW / c.earlyVol) : toUsd(this.mc(c)),
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
      round: this.roundView,
      scored: this.scored?.view ?? null,
    };
  }
}
