import * as curveLib from "./curve";
import { FEE, SUPPLY, toUsd, type Curve } from "./curve";
import { DIFFICULTIES, type Difficulty } from "./difficulty";
import { Rng } from "./rng";
import {
  MEME_PACK,
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
  CoinView,
  DifficultyId,
  Meme,
  PlayerTrade,
  Position,
  RoundView,
  Snapshot,
  Stage,
  TweetSeg,
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
  postMc: number;
  moonUntil: number | null;
  stage: Stage;
  stageAt: number;
  txCount: number;
  botBuys: number;
  holders: number;
  volumeSol: number;
  candles: Candle[];
  mint: string;
  creator: string;
  stats: CoinView["stats"];
  flowUntil: number | null;
  rev: number;
  view: CoinView | null;
  viewRev: number;
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
  private positions = new Map<string, { tokens: number; boughtSol: number; soldSol: number }>();
  private trades: PlayerTrade[] = [];

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
    if (opts.autoRounds) this.at(4000, () => this.startRound());
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
    if (this.dirty && t - this.lastEmit >= EMIT_EVERY_MS) this.emit();
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

  private spawn(spec: CoinSpec, at: number): Coin {
    const id = `c${this.nextId++}`;
    const curve = curveLib.newCurve();
    const coin: Coin = {
      id,
      spec,
      createdAt: at,
      curve,
      migrated: false,
      migratedAt: null,
      postMc: 0,
      moonUntil: null,
      stage: "new",
      stageAt: at,
      txCount: 0,
      botBuys: 0,
      holders: 0,
      volumeSol: 0,
      candles: [],
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
    const price = this.mc(c);
    const sec = Math.floor(at / 1000);
    const last = c.candles[c.candles.length - 1];
    if (last && last.t === sec) {
      last.h = Math.max(last.h, price);
      last.l = Math.min(last.l, price);
      last.c = price;
      last.v += solVolume;
    } else {
      const open = last ? last.c : price;
      c.candles.push({ t: sec, o: open, h: Math.max(open, price), l: Math.min(open, price), c: price, v: solVolume });
    }
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
    c.postMc = curveLib.mcSol(c.curve);
    // The winner keeps running for a while after it migrates.
    if (c.spec.role === "target" || c.spec.profile === "run") {
      c.moonUntil = at + this.rng.range(18000, 30000);
    }
    this.setStage(c, "migrated", at);
  }

  /** Returns tokens bought and SOL spent. */
  private applyBuy(c: Coin, sol: number, at: number, by: "bot" | "player"): { tokens: number; spent: number } {
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
    c.volumeSol += spent;
    if (by === "bot") {
      c.botBuys++;
      if (this.rng.chance(0.7)) c.holders++;
    } else {
      c.holders++;
    }
    this.record(c, at, spent);
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
    c.volumeSol += sol;
    if (by === "bot" && this.rng.chance(0.3)) c.holders = Math.max(1, c.holders - 1);
    this.record(c, at, sol);
    this.touch(c);
    return sol;
  }

  // ------------------------------------------------------------ organic flow

  private scheduleFlow(c: Coin, from: number): void {
    const hot = c.spec.profile === "run" && c.spec.role === "target";
    const gap = hot ? this.rng.range(120, 400) : c.migrated ? 250 : this.rng.range(400, 1500);
    // Seeded coins have negative creation times; never replay history.
    this.at(Math.max(from, this.simNow) + gap, (at) => this.flow(c, at));
  }

  private flow(c: Coin, at: number): void {
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
    c.postMc = Math.max(1, c.postMc * Math.exp(drift + vol * this.rng.gauss()));
    c.txCount += this.rng.int(0, 3);
    this.record(c, at, 0);
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
      this.fastForward(c, this.rng.range(0.4, 0.9));
    }
    // Migrated: old coins drifting around.
    for (let i = 0; i < 12; i++) {
      const spec: CoinSpec = { ...makeFillerCoin(this.rng, "ambient"), profile: "flat", ttlMs: null };
      const c = this.spawn(spec, -this.rng.range(300000, 86400000));
      this.fastForward(c, 1);
      c.postMc = Math.exp(this.rng.range(Math.log(500), Math.log(20000)));
    }
    // New Pairs: a few launches already on the board.
    for (let i = 0; i < 10; i++) {
      this.spawn(makeFillerCoin(this.rng), -this.rng.range(1000, 30000));
    }
  }

  /** Push a coin up its curve without recording chart history. */
  private fastForward(c: Coin, target: number): void {
    while (!c.migrated && curveLib.progress(c.curve) < target) {
      const r = curveLib.buy(c.curve, this.rng.range(1, 4));
      c.curve = r.curve;
      c.txCount++;
      c.volumeSol += r.spent;
      c.holders += this.rng.chance(0.7) ? 1 : 0;
      if (curveLib.isComplete(c.curve)) {
        this.migrate(c, c.createdAt + 60000);
        c.moonUntil = null;
      }
    }
    if (!c.migrated && curveLib.progress(c.curve) >= FINAL_AT) c.stage = "final";
    c.candles = [];
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
      this.fastForward(c, this.rng.range(0.4, 0.75));
      this.at(at + this.rng.range(6000, 12000), finalStretch);
    };
    this.at(5000, finalStretch);

    const chatter = (at: number) => {
      const t = makeNoiseTweet(this.rng);
      this.pushTweet(t.author, t.segments, false, undefined, at);
      this.at(at + this.rng.range(1200, 3200), chatter);
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

    this.at(tTweet, (at) => {
      this.pushTweet(plan.author, plan.segments, true, meme.art, at);
      this.emitNow();
    });

    plan.spawns.forEach((s, i) => {
      this.at(tTweet + s.at, (at) => {
        const coin = this.spawn(s.spec, at);
        if (i === plan.targetIndex) this.onTargetSpawn(coin, at, plan);
      });
    });

    plan.distractors.forEach((d) => {
      this.at(tTweet + d.at, (at) => {
        this.pushTweet(d.author, d.segments, true, d.art, at);
      });
      d.spawns.forEach((s) => this.at(tTweet + s.at, (at) => this.spawn(s.spec, at)));
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
   */
  quickBuy(coinId: string, sol: number, at: number = this.simNow): PlayerTrade | null {
    const c = this.coins.get(coinId);
    if (!c || sol <= 0 || sol > this.wallet + 1e-9) return null;
    const rank = c.botBuys;
    const { tokens, spent } = this.applyBuy(c, sol, this.simNow, "player");
    if (tokens <= 0) return null;
    this.wallet -= spent;
    const pos = this.positions.get(coinId) ?? { tokens: 0, boughtSol: 0, soldSol: 0 };
    pos.tokens += tokens;
    pos.boughtSol += spent;
    this.positions.set(coinId, pos);
    const trade: PlayerTrade = { coinId, side: "buy", at, sol: spent, tokens, rank };
    this.trades.push(trade);
    this.emitNow();
    return trade;
  }

  sell(coinId: string, fraction: number, at: number = this.simNow): PlayerTrade | null {
    const c = this.coins.get(coinId);
    const pos = this.positions.get(coinId);
    if (!c || !pos || pos.tokens <= 0) return null;
    const tokens = pos.tokens * Math.min(1, Math.max(0, fraction));
    if (tokens <= 0) return null;
    const sol = this.applySell(c, tokens, this.simNow, "player");
    pos.tokens -= tokens;
    pos.soldSol += sol;
    this.wallet += sol;
    const trade: PlayerTrade = { coinId, side: "sell", at, sol, tokens, rank: c.botBuys };
    this.trades.push(trade);
    this.emitNow();
    return trade;
  }

  getTrades(): readonly PlayerTrade[] {
    return this.trades;
  }

  // ------------------------------------------------------------------ views

  getCandles(coinId: string): readonly Candle[] {
    return this.coins.get(coinId)?.candles ?? [];
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
      holders: c.holders,
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
    };
  }
}
