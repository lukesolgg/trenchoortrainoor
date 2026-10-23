import { describe, expect, it } from "vitest";
import * as curve from "./curve";
import { Engine } from "./engine";
import { DIFFICULTIES } from "./difficulty";
import { Rng } from "./rng";
import { MIGRATION_LOCK_MS, MIGRATION_MC_USD } from "./curve";
import { MEME_PACK, highlightPhrases, makeRound, splitTemplate, validateMeme } from "./scenario";
import type { Meme } from "./types";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
  it("differs across seeds", () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
});

describe("bonding curve", () => {
  it("starts near $3k market cap and prices rise as people buy", () => {
    const c0 = curve.newCurve();
    const usd0 = curve.toUsd(curve.mcSol(c0));
    expect(usd0).toBeGreaterThan(2500);
    expect(usd0).toBeLessThan(3500);
    const { curve: c1 } = curve.buy(c0, 5);
    expect(curve.mcSol(c1)).toBeGreaterThan(curve.mcSol(c0));
  });
  it("later buyers get fewer tokens for the same SOL", () => {
    const c0 = curve.newCurve();
    const first = curve.buy(c0, 3);
    const second = curve.buy(first.curve, 3);
    expect(second.tokens).toBeLessThan(first.tokens);
  });
  it("completes at roughly 85 SOL net and refuses further buys", () => {
    let c = curve.newCurve();
    let spent = 0;
    while (!curve.isComplete(c)) {
      const r = curve.buy(c, 5);
      c = r.curve;
      spent += r.spent;
    }
    expect(spent).toBeGreaterThan(80);
    expect(spent).toBeLessThan(95);
    expect(curve.buy(c, 5).tokens).toBe(0);
  });
  it("a round trip loses fees", () => {
    const b = curve.buy(curve.newCurve(), 10);
    const s = curve.sell(b.curve, b.tokens);
    expect(s.sol).toBeLessThan(10);
    expect(s.sol).toBeGreaterThan(9);
  });
});

describe("meme pack", () => {
  it("ships valid memes", () => {
    expect(MEME_PACK.length).toBeGreaterThan(0);
  });
  it("rejects a tweet without {name}", () => {
    const bad = { ...MEME_PACK[0], tweets: ["no placeholder"] } as Meme;
    expect(() => validateMeme(bad)).toThrow();
  });
  it("highlights the meme name in pink segments", () => {
    const segs = splitTemplate("Sending a hamster. His name is {name}", "Neil");
    expect(segs.find((s) => s.hl)?.text).toBe("Neil");
  });
});

describe("round generation", () => {
  const meme = MEME_PACK[0];
  for (const diff of Object.values(DIFFICULTIES)) {
    it(`${diff.id}: exactly one right coin, decoys each have one flaw`, () => {
      const plan = makeRound(new Rng(7), meme, diff);
      const target = plan.spawns[plan.targetIndex].spec;
      expect(target.role).toBe("target");
      expect(target.ticker).toBe(meme.tickers[0]);
      expect(target.config).toEqual(plan.rightConfig);

      const exact = plan.spawns.filter(
        (s) =>
          s.spec.ticker === target.ticker &&
          s.spec.config.launchpad === plan.rightConfig.launchpad &&
          s.spec.config.dividends === plan.rightConfig.dividends &&
          s.spec.config.pair === plan.rightConfig.pair &&
          s.spec.name === meme.name,
      );
      expect(exact).toHaveLength(1);

      for (const s of plan.spawns.filter((x) => x.spec.role === "decoy")) {
        let wrong = 0;
        if (s.spec.ticker !== target.ticker) wrong++;
        if (s.spec.config.launchpad !== plan.rightConfig.launchpad) wrong++;
        if (s.spec.config.dividends !== plan.rightConfig.dividends) wrong++;
        if (s.spec.config.pair !== plan.rightConfig.pair) wrong++;
        expect(wrong).toBe(1);
      }
      const count = plan.spawns.length;
      expect(count).toBeGreaterThanOrEqual(diff.deploys[0]);
      expect(count).toBeLessThanOrEqual(diff.deploys[1]);
      expect(plan.spawns.every((s) => s.at >= 0 && s.at <= diff.floodMs)).toBe(true);
    });
  }
  it("pairs follow the author", () => {
    const d = DIFFICULTIES.sniper;
    const mk = (author: Meme["author"], tag?: "tesla"): Meme =>
      validateMeme({ id: "t", name: "Test", tickers: ["TST", "TSTX"], art: { hue: 0, glyph: "?" }, author, tag, tweets: ["{name}"] });
    expect(makeRound(new Rng(1), mk("elon"), d).rightPair).toBe("SPACEX");
    expect(makeRound(new Rng(1), mk("elon", "tesla"), d).rightPair).toBe("TESLA");
    expect(makeRound(new Rng(1), mk("toly"), d).rightPair).toBe("SOL");
    expect(makeRound(new Rng(1), mk("alon"), d).rightPair).toBe("PUMP");
    expect(makeRound(new Rng(1), mk("truthterminal"), d).rightPair).toBe("PUMP");
  });
});

describe("engine", () => {
  const make = (seed = 1, difficulty: "paper" | "trencher" | "sniper" = "sniper") =>
    new Engine({ seed, difficulty, clock: () => 0 });

  it("seeds all three columns", () => {
    const s = make().getSnapshot();
    expect(s.newPairs.length).toBeGreaterThan(0);
    expect(s.finalStretch.length).toBeGreaterThan(0);
    expect(s.migrated.length).toBeGreaterThan(0);
  });

  it("is deterministic: same seed and timeline, same board", () => {
    const run = () => {
      const e = make(99);
      e.startRound({ leadMs: 1000 });
      e.advanceTo(15000);
      return e.debugCoins().map((c) => `${c.ticker}:${c.role}:${c.stage}`).sort();
    };
    expect(run()).toEqual(run());
  });

  it("frame jitter does not change outcomes", () => {
    const steady = make(5);
    steady.startRound({ leadMs: 500 });
    for (let t = 16; t <= 20000; t += 16) steady.advanceTo(t);
    const jumpy = make(5);
    jumpy.startRound({ leadMs: 500 });
    jumpy.advanceTo(7000);
    jumpy.advanceTo(20000);
    const key = (e: Engine) => e.debugCoins().map((c) => `${c.ticker}:${c.role}:${c.stage}`).sort();
    expect(key(jumpy)).toEqual(key(steady));
  });

  it("round: tweet lands, right coin appears, snipers hit it, it migrates and runs", () => {
    const e = make(3);
    const tTweet = e.startRound({ leadMs: 1000 });
    expect(tTweet).toBe(1000);
    e.advanceTo(999);
    expect(e.getSnapshot().feed.some((t) => t.memeTweet)).toBe(false);
    e.advanceTo(1000);
    e.advanceTo(1100);
    expect(e.getSnapshot().feed.some((t) => t.memeTweet && t.author.authority)).toBe(true);

    e.advanceTo(8000);
    const round = e.getRound()!;
    expect(round.targetCoinId).not.toBeNull();
    expect(round.tTargetAppear).toBeGreaterThanOrEqual(1000);

    e.advanceTo(60000);
    const snap = e.getSnapshot();
    const target = snap.migrated.find((c) => c.id === round.targetCoinId);
    expect(target).toBeDefined();
    expect(target!.mcUsd).toBeGreaterThan(25000);
  });

  it("only one coin matches the right config exactly", () => {
    const e = make(11);
    e.startRound();
    e.advanceTo(10000);
    const plan = e.getRound()!;
    const all = e.getSnapshot();
    const views = [...all.newPairs, ...all.finalStretch, ...all.migrated];
    const meme = MEME_PACK.find((m) => m.id === plan.memeId)!;
    const exact = views.filter(
      (v) =>
        v.name === meme.name &&
        v.ticker === meme.tickers[0] &&
        v.config.pair === plan.rightPair &&
        v.config.launchpad === "pump" &&
        v.config.dividends,
    );
    expect(exact).toHaveLength(1);
  });

  it("quick-buy updates wallet, position and ranks the player behind earlier bot buys", () => {
    const e = make(3);
    e.startRound({ leadMs: 0 });
    e.advanceTo(6000);
    const id = e.getRound()!.targetCoinId!;
    const before = e.getSnapshot().walletSol;
    const trade = e.quickBuy(id, 3, e.now());
    expect(trade).not.toBeNull();
    expect(trade!.rank).toBeGreaterThan(0);
    const after = e.getSnapshot();
    expect(after.walletSol).toBeCloseTo(before - 3, 5);
    expect(after.positions[0].tokens).toBeGreaterThan(0);
    const sold = e.sell(id, 1);
    expect(sold).not.toBeNull();
    expect(e.getSnapshot().positions[0].tokens).toBeCloseTo(0, 5);
  });

  it("rejects a buy bigger than the wallet", () => {
    const e = make(3);
    e.startRound();
    e.advanceTo(6000);
    expect(e.quickBuy(e.getRound()!.targetCoinId!, 1e6)).toBeNull();
  });

  it("snapshot identity is stable between emits", () => {
    const e = make();
    expect(e.getSnapshot()).toBe(e.getSnapshot());
  });

  it("keeps the board bounded over a long session", () => {
    const e = new Engine({ seed: 8, difficulty: "sniper", autoRounds: true, clock: () => 0 });
    e.advanceTo(180000);
    const s = e.getSnapshot();
    expect(s.newPairs.length).toBeLessThanOrEqual(40);
    expect(s.finalStretch.length).toBeLessThanOrEqual(14);
    expect(s.migrated.length).toBeLessThanOrEqual(30);
    expect(s.feed.length).toBeLessThanOrEqual(50);
  });
});

describe("token page data", () => {
  const make = (seed = 3) => new Engine({ seed, difficulty: "sniper", clock: () => 0 });

  it("gives ambient coins in every column a chart history", () => {
    const e = make();
    const s = e.getSnapshot();
    for (const c of [s.finalStretch[0], s.migrated[0], s.migrated[5]]) {
      const candles = e.getCandles(c.id);
      expect(candles.length).toBeGreaterThan(5);
      for (let i = 1; i < candles.length; i++) {
        expect(candles[i].t).toBeGreaterThanOrEqual(candles[i - 1].t);
      }
    }
  });

  it("migrated ambient coins end their history near their current price", () => {
    const e = make();
    const c = e.getSnapshot().migrated[0];
    const last = e.getCandles(c.id).at(-1)!;
    expect(Math.abs(last.c - c.mcSol) / c.mcSol).toBeLessThan(0.01);
  });

  it("live candles have no holes", () => {
    const e = make();
    e.startRound({ leadMs: 0 });
    e.advanceTo(12000);
    const id = e.getRound()!.targetCoinId!;
    const candles = e.getCandles(id);
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].t - candles[i - 1].t).toBeLessThanOrEqual(1);
    }
  });

  it("records bot and player trades on the tape, newest first and capped", () => {
    const e = make();
    e.startRound({ leadMs: 0 });
    e.advanceTo(6000);
    const id = e.getRound()!.targetCoinId!;
    e.quickBuy(id, 2);
    const tape = e.getTape(id);
    expect(tape[0].by).toBe("you");
    expect(tape[0].side).toBe("buy");
    expect(tape.some((t) => t.by === "bot")).toBe(true);
    for (let i = 1; i < tape.length; i++) expect(tape[i].at).toBeLessThanOrEqual(tape[i - 1].at);
    e.advanceTo(40000);
    expect(e.getTape(id).length).toBeLessThanOrEqual(60);
  });

  it("tape identity is stable until the coin changes", () => {
    const e = make();
    const id = e.getSnapshot().newPairs[0].id;
    expect(e.getTape(id)).toBe(e.getTape(id));
  });

  it("tracks average entry through boughtTokens and marks trades with execAt", () => {
    const e = make();
    e.startRound({ leadMs: 0 });
    e.advanceTo(6000);
    const id = e.getRound()!.targetCoinId!;
    e.quickBuy(id, 2);
    e.quickBuy(id, 3);
    const pos = e.getSnapshot().positions[0];
    expect(pos.boughtSol).toBeCloseTo(5, 5);
    expect(pos.boughtTokens).toBeGreaterThan(pos.tokens - 1e-6);
    expect(e.getTradesFor(id)).toHaveLength(2);
    expect(e.getTradesFor(id)[0].execAt).toBe(e.now());
  });

  it("keeps a focused coin alive and stops events for pruned coins", () => {
    const e = make();
    const id = e.getSnapshot().newPairs.at(-1)!.id;
    e.focus(id);
    e.advanceTo(120000);
    expect(e.getCoinView(id)).not.toBeNull();
    e.focus(null);
    e.advanceTo(130000);
    expect(e.getCoinView(id)).toBeNull();
  });
});

describe("scored round", () => {
  const make = (seed = 3, difficulty: "paper" | "trencher" | "sniper" = "sniper") =>
    new Engine({ seed, difficulty, clock: () => 0 });

  /** Run to the moment just after the tweet lands. */
  const toLive = (e: Engine) => {
    e.startScored();
    const sc = e.getSnapshot().scored!;
    e.advanceTo(sc.tTweet + 1);
    return sc;
  };
  /** Run until the right coin exists, then return its id. */
  const toTarget = (e: Engine) => {
    toLive(e);
    for (let t = e.now(); t < e.now() + 20000 && !e.getRound()?.targetCoinId; t += 50) e.advanceTo(t);
    return e.getRound()!.targetCoinId!;
  };
  const decoyId = (e: Engine) => {
    const s = e.getSnapshot();
    const targetId = e.getRound()!.targetCoinId;
    const decoy = e.debugCoins().find((c) => c.role === "decoy" && c.id !== targetId);
    expect(decoy).toBeDefined();
    return { id: decoy!.id, flaw: decoy!.flaw, snap: s };
  };

  it("walks countdown, armed, live", () => {
    const e = make();
    e.startScored();
    const sc = e.getSnapshot().scored!;
    expect(sc.phase).toBe("countdown");
    expect(sc.tArm).toBe(3000);
    // The big tweet lands at a random point in the first minute.
    expect(sc.tTweet).toBeGreaterThanOrEqual(7000);
    expect(sc.tTweet).toBeLessThanOrEqual(58000);
    e.advanceTo(3001);
    expect(e.getSnapshot().scored!.phase).toBe("armed");
    e.advanceTo(sc.tTweet - 1);
    expect(e.getSnapshot().scored!.phase).toBe("armed");
    e.advanceTo(sc.tTweet);
    expect(e.getSnapshot().scored!.phase).toBe("live");
  });

  it("is safe to start twice", () => {
    const e = make();
    e.startScored();
    const tTweet = e.getSnapshot().scored!.tTweet;
    e.startScored();
    expect(e.getSnapshot().scored!.tTweet).toBe(tTweet);
    e.advanceTo(tTweet + 3000);
    expect(e.getSnapshot().feed.filter((t) => t.memeTweet && t.author.authority)).toHaveLength(1);
  });

  it("a buy during the countdown is a false start and spends nothing", () => {
    const e = make();
    e.startScored();
    e.advanceTo(1000);
    const id = e.getSnapshot().newPairs[0].id;
    expect(e.quickBuy(id, 3, 1000)).toBeNull();
    const sc = e.getSnapshot().scored!;
    expect(sc.phase).toBe("ended");
    expect(sc.result!.outcome).toBe("false_start");
    expect(sc.result!.earlyMs).toBeGreaterThan(3000);
    expect(e.getSnapshot().walletSol).toBe(100);
    expect(e.getSnapshot().positions).toHaveLength(0);
  });

  it("a buy while armed is a false start", () => {
    const e = make();
    e.startScored();
    const sc = e.getSnapshot().scored!;
    e.advanceTo(sc.tTweet - 200);
    e.quickBuy(e.getSnapshot().newPairs[0].id, 1, sc.tTweet - 100);
    const r = e.getSnapshot().scored!.result!;
    expect(r.outcome).toBe("false_start");
    expect(r.earlyMs).toBeCloseTo(100, 0);
  });

  it("judges by click time: a click just before the tweet is early even if the frame ran late", () => {
    const e = make();
    e.startScored();
    const sc = e.getSnapshot().scored!;
    e.advanceTo(sc.tTweet - 50); // last frame before the tweet
    const id = e.getSnapshot().newPairs[0].id;
    e.quickBuy(id, 1, sc.tTweet - 10); // click 10 ms before the tweet
    expect(e.getSnapshot().scored!.result!.outcome).toBe("false_start");
  });

  it("a click just after the tweet counts as live even if the last frame was before it", () => {
    const e = make();
    e.startScored();
    const sc = e.getSnapshot().scored!;
    e.advanceTo(sc.tTweet - 5);
    expect(e.getSnapshot().scored!.phase).toBe("armed");
    const id = e.getSnapshot().newPairs[0].id;
    e.quickBuy(id, 1, sc.tTweet + 20);
    expect(e.getSnapshot().scored!.result!.outcome).toBe("wrong_coin");
  });

  it("buying a look-alike ends the round as the wrong coin and names the flaw", () => {
    const e = make();
    const targetId = toTarget(e);
    e.advanceTo(e.now() + 4000);
    const d = decoyId(e);
    const t = e.quickBuy(d.id, 2);
    expect(t).not.toBeNull();
    const r = e.getSnapshot().scored!.result!;
    expect(r.outcome).toBe("wrong_coin");
    expect(r.bought!.flaw).toBe(d.flaw);
    expect(r.bought!.ticker).not.toBe("");
    expect(r.reactionMs).toBeNull();
    expect(r.decoys.length).toBeGreaterThan(0);
    expect(r.decoys.every((x) => ["ticker", "launchpad", "dividends", "pair"].includes(x.flaw))).toBe(true);
    // position is closed at the end
    expect(e.getSnapshot().positions.every((p) => p.tokens === 0)).toBe(true);
    expect(e.getRound()!.targetCoinId).toBe(targetId);
  });

  it("buying an unrelated coin counts as wrong with an unrelated flaw", () => {
    const e = make();
    toLive(e);
    e.advanceTo(e.now() + 1500);
    const s = e.getSnapshot();
    const filler = e.debugCoins().find((c) => c.role === "noise");
    expect(filler).toBeDefined();
    e.quickBuy(filler!.id, 1);
    expect(s).toBeDefined();
    expect(e.getSnapshot().scored!.result!.outcome).toBe("wrong_coin");
    expect(e.getSnapshot().scored!.result!.bought!.flaw).toBe("unrelated");
  });

  it("buying the right coin keeps the round live and scores reaction from the moment it landed", () => {
    const e = make();
    const id = toTarget(e);
    const appear = e.getRound()!.tTargetAppear!;
    e.advanceTo(appear + 700);
    const trade = e.quickBuy(id, 3, appear + 650)!;
    expect(trade).not.toBeNull();
    expect(e.getSnapshot().scored!.phase).toBe("live");
    e.sell(id, 1);
    const sc = e.getSnapshot().scored!;
    expect(sc.phase).toBe("ended");
    const r = sc.result!;
    expect(r.outcome).toBe("success");
    expect(r.reactionMs).toBeCloseTo(650, 0);
    expect(r.rating).toBe("Fast");
    expect(r.buyNumber).toBe(trade.rank + 1);
    expect(r.buyNumber).toBeGreaterThan(1);
    expect(r.entryMcUsd).toBeGreaterThan(2500);
    expect(r.boughtSol).toBeCloseTo(3, 5);
    expect(r.pnlSol).toBeCloseTo(r.closedSol - r.boughtSol, 8);
    expect(r.bought!.flaw).toBeNull();
    expect(r.tweetToBuyMs).toBeGreaterThan(r.reactionMs!);
  });

  it("selling only part keeps the round live; Space (endRound) closes the bag and scores it", () => {
    const e = make();
    const id = toTarget(e);
    e.advanceTo(e.now() + 500);
    e.quickBuy(id, 4);
    e.sell(id, 0.5);
    expect(e.getSnapshot().scored!.phase).toBe("live");
    e.advanceTo(e.now() + 8000);
    e.endRound();
    const r = e.getSnapshot().scored!.result!;
    expect(r.outcome).toBe("success");
    expect(r.closedSol).toBeGreaterThan(0);
    expect(e.getSnapshot().positions[0].tokens).toBe(0);
    expect(e.getSnapshot().walletSol).toBeCloseTo(100 - r.boughtSol + r.closedSol, 6);
  });

  it("ending without a buy is a miss; waiting too long is a miss", () => {
    const a = make();
    toLive(a);
    a.endRound();
    expect(a.getSnapshot().scored!.result!.outcome).toBe("missed");

    const b = make(4);
    const sc = toLive(b);
    b.advanceTo(sc.tTweet + 19000);
    expect(b.getSnapshot().scored!.phase).toBe("live");
    b.advanceTo(sc.tTweet + 20001);
    expect(b.getSnapshot().scored!.result!.outcome).toBe("missed");
  });

  it("holding the right coin to the time limit still scores a success", () => {
    const e = make();
    const id = toTarget(e);
    e.quickBuy(id, 2);
    e.advanceTo(e.getSnapshot().scored!.tTweet + 91000);
    expect(e.getSnapshot().scored!.result!.outcome).toBe("success");
  });

  it("no trading after the round ends", () => {
    const e = make();
    toLive(e);
    e.endRound();
    expect(e.quickBuy(e.getSnapshot().newPairs[0].id, 1)).toBeNull();
    expect(e.getSnapshot().walletSol).toBe(100);
  });

  it("the result reveals the right coin, the tweet and when it landed", () => {
    const e = make();
    toTarget(e);
    e.advanceTo(e.now() + 2000);
    e.endRound();
    const r = e.getSnapshot().scored!.result!;
    expect(r.rightCoin.ticker).toBe(MEME_PACK.find((m) => m.name === r.memeName)!.tickers[0]);
    expect(r.rightAppearMs).toBeGreaterThan(0);
    expect(r.tweetSegments.some((s) => s.hl && s.text === r.memeName)).toBe(true);
    expect(r.rightCoin.config.launchpad).toBe("pump");
    expect(r.rightCoin.config.dividends).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const run = () => {
      const e = make(21);
      const id = toTarget(e);
      e.advanceTo(e.now() + 600);
      e.quickBuy(id, 2);
      e.advanceTo(e.now() + 3000);
      e.endRound();
      const r = e.getSnapshot().scored!.result!;
      return [r.outcome, r.reactionMs, r.buyNumber, r.entryMcUsd?.toFixed(2), r.pnlSol.toFixed(6)];
    };
    expect(run()).toEqual(run());
  });

  it("unscored engines never expose a scored view", () => {
    expect(make().getSnapshot().scored).toBeNull();
  });
});

describe("rating bands", () => {
  it("maps reaction time to a label", async () => {
    const { ratingFor } = await import("./scoring");
    expect(ratingFor(250)).toBe("Bot speed");
    expect(ratingFor(450)).toBe("Elite");
    expect(ratingFor(900)).toBe("Fast");
    expect(ratingFor(1400)).toBe("Solid");
    expect(ratingFor(2000)).toBe("Slow");
    expect(ratingFor(4000)).toBe("Too slow");
  });
});

describe("migration", () => {
  it("exposes a sensible migration market cap", () => {
    expect(MIGRATION_MC_USD).toBeGreaterThan(30000);
    expect(MIGRATION_MC_USD).toBeLessThan(80000);
  });

  it("pauses player buys for 3 s after a coin migrates, then reopens", () => {
    const e = new Engine({ seed: 7, difficulty: "sniper", autoRounds: false, clock: () => 0 });
    e.startRound({ leadMs: 0 });
    let id: string | null = null;
    for (let t = 0; t < 120000; t += 50) {
      e.advanceTo(t);
      id = e.getRound()?.targetCoinId ?? null;
      if (id && e.getCoinView(id)?.stage === "migrated") break;
    }
    expect(id).not.toBeNull();
    expect(e.getCoinView(id!)?.stage).toBe("migrated");
    expect(e.isMigrating(id!)).toBe(true);
    expect(e.quickBuy(id!, 1)).toBeNull();
    e.advanceTo(e.now() + MIGRATION_LOCK_MS + 100);
    expect(e.isMigrating(id!)).toBe(false);
    expect(e.quickBuy(id!, 1)).not.toBeNull();
  });
});

describe("ath target", () => {
  it("runs the winner toward the meme's suggested ATH", () => {
    const meme = MEME_PACK.find((m) => m.id === "ansem-bag")!;
    for (const seed of [1, 2, 3]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [meme] });
      e.startRound({ memeId: meme.id, leadMs: 0 });
      let peak = 0;
      for (let t = 0; t < 180000; t += 100) {
        e.advanceTo(t);
        const id = e.getRound()?.targetCoinId;
        if (id) peak = Math.max(peak, e.getCoinView(id)?.mcUsd ?? 0);
      }
      // Noise makes the peak approximate: stay within a generous band of the 800K-1.05M range.
      expect(peak).toBeGreaterThan(meme.ath![0] * 0.5);
      expect(peak).toBeLessThan(meme.ath![1] * 2);
    }
  });
});

describe("freeze and history", () => {
  const migrate = () => {
    const e = new Engine({ seed: 7, difficulty: "sniper", autoRounds: false, clock: () => 0 });
    e.startRound({ leadMs: 0 });
    let id = "";
    for (let t = 0; t < 120000; t += 50) {
      e.advanceTo(t);
      id = e.getRound()?.targetCoinId ?? "";
      if (id && e.getCoinView(id)?.stage === "migrated") break;
    }
    return { e, id };
  };

  it("does not move the price at all while migrating", () => {
    const { e, id } = migrate();
    const mc0 = e.getCoinView(id)!.mcSol;
    const n0 = e.getCandles(id).length;
    e.advanceTo(e.now() + 2900);
    expect(e.getCoinView(id)!.mcSol).toBe(mc0);
    expect(e.getCandles(id).length).toBe(n0);
    expect(e.sell(id, 1)).toBeNull();
  });

  it("runners trade real size after migrating", () => {
    const { e, id } = migrate();
    const v0 = e.getCoinView(id)!.volumeUsd;
    e.advanceTo(e.now() + 3100 + 20000);
    expect(e.getCoinView(id)!.volumeUsd - v0).toBeGreaterThan(20000);
  });

  it("logs a closed position once, with its own invested and returned", () => {
    const e = new Engine({ seed: 2, difficulty: "sniper", autoRounds: false, clock: () => 0 });
    const id = e.getSnapshot().newPairs[0].id;
    expect(e.quickBuy(id, 2)).not.toBeNull();
    expect(e.getSnapshot().closed).toHaveLength(0);
    e.sell(id, 1);
    const closed = e.getSnapshot().closed;
    expect(closed).toHaveLength(1);
    expect(closed[0].invested).toBeCloseTo(2, 5);
    e.quickBuy(id, 1);
    e.sell(id, 1);
    const c2 = e.getSnapshot().closed;
    expect(c2).toHaveLength(2);
    expect(c2[1].invested).toBeCloseTo(1, 5);
  });
});

describe("keyword highlighting", () => {
  it("pinks whole-word matches only", () => {
    const segs = highlightPhrases([{ text: "a rubber duck with a dev note, device" }], ["dev", "rubber duck"]);
    expect(segs.filter((x) => x.hl).map((x) => x.text)).toEqual(["rubber duck", "dev"]);
    expect(segs.map((x) => x.text).join("")).toBe("a rubber duck with a dev note, device");
  });
});
