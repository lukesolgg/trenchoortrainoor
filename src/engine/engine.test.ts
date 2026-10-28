import { describe, expect, it } from "vitest";
import * as curve from "./curve";
import { Engine, type BigOutcome, type WalletRef } from "./engine";
import type { DevChoice } from "./dev";
import { DIFFICULTIES } from "./difficulty";
import { Rng } from "./rng";
import { MIGRATION_LOCK_MS, MIGRATION_MC_USD } from "./curve";
import { MEME_PACK, highlightPhrases, makeRound, splitTemplate, validateMeme } from "./scenario";
import type { Meme } from "./types";

/** Advance until the round's right coin lands, then a beat more, before it can migrate. */
function landTarget(e: Engine): string {
  for (let t = e.now(); t < 120000; t += 50) {
    e.advanceTo(t);
    const id = e.getRound()?.targetCoinId;
    if (id) {
      e.advanceTo(t + 150);
      return id;
    }
  }
  throw new Error("target never landed");
}

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

    let peak = 0;
    for (let t = 8000; t <= 60000; t += 250) {
      e.advanceTo(t);
      peak = Math.max(peak, e.getCoinView(round.targetCoinId!)?.mcUsd ?? 0);
    }
    const target = e.getSnapshot().migrated.find((c) => c.id === round.targetCoinId);
    expect(target).toBeDefined();
    // It ran past migration (where it is by 60 s depends on the round's outcome).
    expect(peak).toBeGreaterThan(60000);
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
    const id = landTarget(e);
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
    e.advanceTo(60000);
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
    const id = landTarget(e);
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
    const id = landTarget(e);
    e.quickBuy(id, 0.5);
    e.quickBuy(id, 0.3);
    const pos = e.getSnapshot().positions[0];
    expect(pos.boughtSol).toBeCloseTo(0.8, 5);
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

  it("selling only part keeps the round live; Space is refused while holding; selling the rest scores it", () => {
    const e = make();
    const id = toTarget(e);
    e.advanceTo(e.now() + 500);
    e.quickBuy(id, 4);
    e.sell(id, 0.5);
    expect(e.getSnapshot().scored!.phase).toBe("live");
    e.advanceTo(e.now() + 8000);
    expect(e.endRound()).toBe(false);
    expect(e.getSnapshot().scored!.phase).toBe("live");
    // Sells are refused for 3 s while the coin migrates; keep trying until it goes through.
    while (!e.sell(id, 1)) e.advanceTo(e.now() + 250);
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

  it("keeps the round open while you hold, and ends it when you sell out", () => {
    const e = make();
    const id = toTarget(e);
    e.quickBuy(id, 2);
    const tTweet = e.getSnapshot().scored!.tTweet;
    e.advanceTo(tTweet + 150000);
    expect(e.getSnapshot().scored!.phase).toBe("live");
    expect(e.sell(id, 1)).not.toBeNull();
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
    const meme = MEME_PACK.find((m) => m.name === r.memeName)!;
    // Big memes highlight the name; small ones that never spell it highlight their hint phrases instead.
    if (meme.noHighlight) expect(r.tweetSegments.some((s) => s.hl)).toBe((meme.highlight ?? []).length > 0);
    else expect(r.tweetSegments.some((s) => s.hl && s.text === r.memeName)).toBe(true);
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
      e.sell(id, 1);
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

describe("runner path", () => {
  it("pulls back and consolidates on the way to the ATH instead of climbing in a line", () => {
    const meme = MEME_PACK.find((m) => m.id === "ansem-bag")!;
    for (const seed of [1, 2, 3, 4]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [meme] });
      e.startRound({ memeId: meme.id, leadMs: 0 });
      let peak = 0;
      let maxDrawdown = 0;
      let runTime = 0;
      let migratedAt: number | null = null;
      for (let t = 0; t < 240000; t += 250) {
        e.advanceTo(t);
        const id = e.getRound()?.targetCoinId;
        const v = id ? e.getCoinView(id) : null;
        if (!v || v.migratedAt === null) continue;
        migratedAt ??= v.migratedAt;
        peak = Math.max(peak, v.mcUsd);
        maxDrawdown = Math.max(maxDrawdown, 1 - v.mcUsd / peak);
        if (v.mcUsd >= meme.ath![0] * 0.8) runTime = Math.max(runTime, t - migratedAt);
      }
      expect(maxDrawdown).toBeGreaterThan(0.1);
      // The run takes a while: well beyond the old 35-60 s straight line's shortest case.
      expect(runTime).toBeGreaterThan(40000);
    }
  });
});

describe("runner launch", () => {
  it("migrates 3-15 s after it lands, every time", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0 });
      e.startRound({ leadMs: 0 });
      let landed: number | null = null;
      let migrated: number | null = null;
      for (let t = 0; t < 40000 && migrated === null; t += 50) {
        e.advanceTo(t);
        const id = e.getRound()?.targetCoinId;
        const v = id ? e.getCoinView(id) : null;
        if (!v) continue;
        landed ??= t;
        if (v.migratedAt !== null) migrated = v.migratedAt;
      }
      expect(migrated! - landed!).toBeGreaterThan(2000);
      expect(migrated! - landed!).toBeLessThan(16000);
    }
  });
});

describe("big coin script", () => {
  const run = (id: string, seed: number) => {
    const meme = MEME_PACK.find((m) => m.id === id)!;
    const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [meme] });
    e.startRound({ memeId: meme.id, leadMs: 0 });
    let born: number | null = null;
    const series: [number, number][] = [];
    for (let t = 0; t < 420000; t += 100) {
      e.advanceTo(t);
      const cid = e.getRound()?.targetCoinId;
      const v = cid ? e.getCoinView(cid) : null;
      if (!v) continue;
      born ??= t;
      series.push([t - born, v.mcUsd]);
    }
    const coin = [...(e as unknown as { coins: Map<string, { big: { outcome: BigOutcome } | null }> }).coins.values()].find((c) => c.big)!;
    const peak = Math.max(...series.map(([, m]) => m));
    return {
      meme,
      outcome: coin.big!.outcome,
      series,
      burstMc: Math.max(...series.filter(([t]) => t <= 3500).map(([, m]) => m)),
      peak,
      peakAt: series.find(([, m]) => m === peak)![0],
      last: series[series.length - 1][1],
    };
  };

  it("migrates fast and tops out within a minute, whatever the outcome", () => {
    for (const id of ["pnut", "goat", "fartcoin", "wif", "popcat"]) {
      for (const seed of [1, 2, 3]) {
        const r = run(id, seed);
        // A few seconds in New (under ~$5.3K) before it climbs; over the line well inside 15 s.
        const inNew = r.series.filter(([t, m]) => t <= 6000 && m < 5300).length * 100;
        expect(inNew).toBeGreaterThan(1500);
        expect(r.series.find(([, m]) => m > 43000)![0]).toBeLessThan(15000);
        expect(r.peakAt).toBeLessThan(75000);
      }
    }
  });

  it("plays out every outcome with its own top and ending", () => {
    const seen = new Set<BigOutcome>();
    for (let seed = 1; seed <= 24; seed++) {
      const r = run("pnut", seed);
      seen.add(r.outcome);
      switch (r.outcome) {
        case "standard": {
          // Tops in the meme's range (or higher on a second leg), then always rugs out: nothing sits at 80K.
          expect(r.peak).toBeGreaterThan(r.meme.big!.peak[0] * 0.85);
          expect(r.peak).toBeLessThan(r.meme.big!.peak[1] * 2.4);
          expect(r.last).toBeLessThan(20000);
          break;
        }
        case "runner":
          expect(r.peak).toBeGreaterThan(600000);
          expect(r.peak).toBeLessThan(3000000);
          expect(r.peakAt).toBeLessThan(75000);
          expect(r.last / r.peak).toBeLessThan(0.25);
          break;
        case "moon":
          expect(r.peak).toBeGreaterThan(2500000);
          expect(r.peakAt).toBeLessThan(75000);
          expect(r.last / r.peak).toBeLessThan(0.65);
          break;
        case "toprug": {
          expect(r.peak).toBeGreaterThan(165000);
          expect(r.peak).toBeLessThan(450000);
          expect(r.peakAt).toBeLessThan(26000);
          // Down to ~25K within about 10 s of the top.
          const after = r.series.find(([t]) => t >= r.peakAt + 10000)![1];
          expect(after).toBeLessThan(40000);
          expect(r.last).toBeLessThan(12000);
          break;
        }
      }
    }
    expect(seen.size).toBe(4);
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

describe("orders, holders, top 10 avg", () => {
  const pnut = () => MEME_PACK.find((m) => m.id === "pnut")!;
  const bought = (seed: number) => {
    const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [pnut()] });
    e.startRound({ memeId: "pnut", leadMs: 0 });
    const id = landTarget(e);
    // Small enough to stay under 4% of supply (a bigger bag stalls the coin).
    expect(e.quickBuy(id, 0.5)).not.toBeNull();
    return { e, id };
  };

  it("fills a take profit once market cap crosses it, and only once", () => {
    const { e, id } = bought(1);
    const trigger = 60000;
    expect(e.addOrder(id, "tp", trigger, 0.5)).not.toBeNull();
    let filledAt: number | null = null;
    for (let t = e.now(); t < 120000 && filledAt === null; t += 100) {
      e.advanceTo(t);
      const o = e.getSnapshot().orders[0];
      if (o.status === "filled") filledAt = t;
    }
    expect(filledAt).not.toBeNull();
    const o = e.getSnapshot().orders[0];
    expect(o.filledSol).toBeGreaterThan(0);
    expect(e.getTradesFor(id).filter((t) => t.side === "sell")).toHaveLength(1);
  });

  it("a stop loss sells everything on the way down; cancelled orders never fill", () => {
    const { e, id } = bought(2);
    const cancel = e.addOrder(id, "tp", 1e12, 1)!;
    e.cancelOrder(cancel.id);
    e.addOrder(id, "sl", 1e12, 1); // already below: fills on the next tick
    e.advanceTo(e.now() + 500);
    const orders = e.getSnapshot().orders;
    expect(orders.find((o) => o.id === cancel.id)!.status).toBe("cancelled");
    expect(orders.find((o) => o.kind === "sl")!.status).toBe("filled");
    expect(e.getSnapshot().positions[0].tokens).toBeCloseTo(0, 6);
  });

  it("holders and the top 10 average buy rise as the runner climbs", () => {
    const { e, id } = bought(3);
    e.advanceTo(e.now() + 8000);
    const early = e.getCoinView(id)!;
    let peak = early;
    for (let t = e.now(); t < 70000; t += 250) {
      e.advanceTo(t);
      const v = e.getCoinView(id)!;
      if (v.mcUsd > peak.mcUsd) peak = v;
    }
    expect(peak.holders).toBeGreaterThan(early.holders * 2);
    expect(peak.earlyAvgMcUsd).toBeGreaterThan(early.earlyAvgMcUsd * 1.5);
  });
});

describe("score, hit feedback and training style", () => {
  const live = (opts: { seed?: number; training?: boolean; difficulty?: "paper" | "trencher" | "sniper" } = {}) => {
    const e = new Engine({ seed: opts.seed ?? 5, difficulty: opts.difficulty ?? "sniper", autoRounds: false, clock: () => 0, training: opts.training });
    e.startScored();
    const sc = e.getSnapshot().scored!;
    e.advanceTo(sc.tTweet + 1);
    return e;
  };
  const target = (e: Engine) => {
    for (let t = e.now(); !e.getRound()?.targetCoinId; t += 25) e.advanceTo(t);
    return e.getRound()!.targetCoinId!;
  };
  const decoy = (e: Engine) => {
    for (let t = e.now(); t < e.now() + 20000; t += 50) {
      e.advanceTo(t);
      const d = e.debugCoins().find((c) => c.role === "decoy");
      if (d) return d.id;
    }
    throw new Error("no decoy");
  };

  it("scores speed, entry and exit out of 1000", async () => {
    const { scoreRound } = await import("./scoring");
    expect(scoreRound({ success: true, reactionMs: 100, buyNumber: 1, pnlPct: 300, wrongBuys: 0 }).total).toBe(1000);
    expect(scoreRound({ success: true, reactionMs: 3000, buyNumber: 40, pnlPct: -50, wrongBuys: 0 }).total).toBe(0);
    const mid = scoreRound({ success: true, reactionMs: 1575, buyNumber: 5, pnlPct: 100, wrongBuys: 1 });
    expect(mid).toEqual({ speed: 400, entry: 100, exit: 50, penalty: 150, total: 400 });
    expect(scoreRound({ success: false, reactionMs: 200, buyNumber: 1, pnlPct: 100, wrongBuys: 0 }).total).toBe(0);
  });

  it("shows the reaction time the instant you buy the right coin", () => {
    const e = live();
    const id = target(e);
    e.advanceTo(e.now() + 400);
    e.quickBuy(id, 1);
    const sc = e.getSnapshot().scored!;
    expect(sc.phase).toBe("live");
    expect(sc.hit!.reactionMs).toBeGreaterThanOrEqual(400);
    expect(sc.hit!.reactionMs).toBeLessThan(600);
    while (!e.sell(id, 1)) e.advanceTo(e.now() + 250);
    const r = e.getSnapshot().scored!.result!;
    expect(r.outcome).toBe("success");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBe(r.scoreParts.speed + r.scoreParts.entry + r.scoreParts.exit);
  });

  it("strict style: a wrong buy ends the round; training style: it costs points and you keep going", () => {
    const strict = live({ seed: 6 });
    strict.quickBuy(decoy(strict), 1);
    expect(strict.getSnapshot().scored!.result!.outcome).toBe("wrong_coin");

    const e = live({ seed: 6, training: true });
    const d = decoy(e);
    e.quickBuy(d, 1);
    let sc = e.getSnapshot().scored!;
    expect(sc.phase).toBe("live");
    expect(sc.misses).toHaveLength(1);
    const id = target(e);
    e.quickBuy(id, 1);
    expect(e.getSnapshot().scored!.hit).not.toBeNull();
    while (!e.sell(id, 1)) e.advanceTo(e.now() + 250);
    while (!e.sell(d, 1)) e.advanceTo(e.now() + 250);
    sc = e.getSnapshot().scored!;
    expect(sc.result!.outcome).toBe("success");
    expect(sc.result!.training).toBe(true);
    expect(sc.result!.wrongBuys).toHaveLength(1);
    expect(sc.result!.scoreParts.penalty).toBe(150);
  });

  it("on easier levels look-alikes land after the real coin", () => {
    for (const seed of [1, 2, 3, 4]) {
      const e = live({ seed, difficulty: "paper" });
      const id = target(e);
      const landed = e.now();
      expect(e.debugCoins().filter((c) => c.role === "decoy" && c.id !== id)).toHaveLength(0);
      e.advanceTo(landed + 2500);
      expect(e.debugCoins().filter((c) => c.role === "decoy").length).toBeGreaterThan(0);
    }
  });
});

describe("flood and socials", () => {
  it("after the tweet, New Pairs only gets the runner and its look-alikes", () => {
    for (const seed of [1, 2, 3]) {
      for (const difficulty of ["paper", "trencher", "sniper"] as const) {
        const e = new Engine({ seed, difficulty, autoRounds: false, clock: () => 0 });
        e.startRound({ leadMs: 0 });
        const plan = (e as unknown as { roundPlan: { spawns: { spec: { role: string } }[] } }).roundPlan;
        expect(plan.spawns.every((x) => x.spec.role === "target" || x.spec.role === "decoy")).toBe(true);
        expect(plan.spawns.filter((x) => x.spec.role === "target")).toHaveLength(1);
      }
    }
  });

  it("a big runner shows the dev buy, KOL trades and at least one boost", () => {
    const meme = MEME_PACK.find((m) => m.id === "pnut")!;
    for (const seed of [1, 2, 3]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [meme] });
      e.startRound({ memeId: "pnut", leadMs: 0 });
      let id: string | null = null;
      for (let t = 0; t < 90000; t += 200) {
        e.advanceTo(t);
        id ??= e.getRound()?.targetCoinId ?? null;
      }
      const s = e.getSocial(id!);
      expect(s.some((x) => x.kind === "dev" && x.side === "buy")).toBe(true);
      expect(s.some((x) => x.kind === "boost")).toBe(true);
      expect(s.filter((x) => x.kind === "kol").length).toBeGreaterThan(0);
      expect(s.filter((x) => x.kind === "kol" && x.side === "buy").length).toBeLessThanOrEqual(10);
    }
  });
});

describe("coin images", () => {
  it("every meme and every filler coin has a real image on disk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { FILLER_COINS } = await import("./content");
    const srcs = [
      ...MEME_PACK.map((m) => m.art.src!),
      ...MEME_PACK.flatMap((m) => (m.vamps ?? []).map((v) => v.art?.src ?? m.art.src!)),
      ...FILLER_COINS.map((f) => `/coins/${f.ticker.toLowerCase()}.jpg`),
    ];
    for (const s of srcs) {
      expect(s, "missing src").toBeTruthy();
      expect(fs.existsSync(path.join(process.cwd(), "public", s)), s).toBe(true);
    }
    expect(MEME_PACK.length).toBe(28);
  });
});

describe("dev sell timing", () => {
  it("the dev sells once, just before or just after migration", () => {
    let pre = 0;
    let post = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0 });
      e.startRound({ leadMs: 0 });
      let id: string | null = null;
      for (let t = 0; t < 60000; t += 200) {
        e.advanceTo(t);
        id ??= e.getRound()?.targetCoinId ?? null;
      }
      const v = e.getCoinView(id!)!;
      const sells = e.getSocial(id!).filter((x) => x.kind === "dev" && x.side === "sell");
      expect(sells).toHaveLength(1);
      const dt = sells[0].at - v.migratedAt!;
      expect(dt).toBeGreaterThan(-8000);
      expect(dt).toBeLessThan(7500);
      if (dt < 0) pre++;
      else post++;
    }
    expect(pre).toBeGreaterThan(0);
    expect(post).toBeGreaterThan(0);
  });
});

describe("KOL avatars", () => {
  it("every KOL has a profile picture on disk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { KOLS } = await import("./content");
    for (const k of KOLS) expect(fs.existsSync(path.join(process.cwd(), "public", "kols", `${k.handle.toLowerCase()}.jpg`)), k.handle).toBe(true);
  });
});

describe("saga", () => {
  const sagaEngine = (seed: number, training = false) =>
    new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, length: "saga", training, pack: MEME_PACK.filter((m) => m.id === "polar-bear-cub") });

  it("plans a 5-10 minute story and the round stays live through it", () => {
    for (const seed of [1, 2, 3]) {
      const e = sagaEngine(seed);
      e.startScored();
      const sc0 = e.getSnapshot().scored!;
      e.advanceTo(sc0.tTweet + 1);
      let id: string | null = null;
      for (let t = e.now(); !id; t += 50) {
        e.advanceTo(t);
        id = e.getRound()?.targetCoinId ?? null;
      }
      e.quickBuy(id, 1);
      // Sell out early: a saga does not end until the story is told.
      for (let t = e.now(); !e.sell(id, 1); t += 250) e.advanceTo(t);
      e.advanceTo(e.now() + 120_000);
      expect(e.getSnapshot().scored!.phase).toBe("live");
      const end = (e as unknown as { sagaEndAt: number }).sagaEndAt - sc0.tTweet;
      expect(end).toBeGreaterThan(4.5 * 60_000);
      expect(end).toBeLessThan(11 * 60_000);
      e.advanceTo(sc0.tTweet + end + 5000);
      expect(e.getSnapshot().scored!.phase).toBe("ended");
      expect(e.getSnapshot().scored!.result!.length).toBe("saga");
    }
  });

  it("a vamp tweet launches a new coin; getting on it fast is scored, its look-alikes only cost points", () => {
    // Find a seed whose story has a vamp.
    for (let seed = 1; seed < 40; seed++) {
      const e = sagaEngine(seed);
      e.startScored();
      const sc0 = e.getSnapshot().scored!;
      e.advanceTo(sc0.tTweet + 1);
      if (((e as unknown as { saga: { chapters: unknown[] } }).saga.chapters.length ?? 1) < 2) continue;
      let id: string | null = null;
      for (let t = e.now(); !id; t += 50) {
        e.advanceTo(t);
        id = e.getRound()?.targetCoinId ?? null;
      }
      e.quickBuy(id, 1);
      // Run until the vamp's right coin and a look-alike exist.
      let vampId: string | null = null;
      let decoyId: string | null = null;
      for (let t = e.now(); t < sc0.tTweet + 10 * 60_000 && !(vampId && decoyId); t += 100) {
        e.advanceTo(t);
        const v = e.getSnapshot().scored!.vamps[0];
        vampId = v?.coinId ?? null;
        const coins = (e as unknown as { coins: Map<string, { id: string; spec: { wave?: number; role: string } }> }).coins;
        decoyId = [...coins.values()].find((c) => c.spec.wave === 1 && c.spec.role === "decoy")?.id ?? null;
      }
      expect(vampId).not.toBeNull();
      e.quickBuy(decoyId!, 0.5);
      expect(e.getSnapshot().scored!.phase).toBe("live");
      e.advanceTo(e.now() + 300);
      e.quickBuy(vampId!, 1);
      const v = e.getSnapshot().scored!.vamps[0];
      expect(v.reactionMs).not.toBeNull();
      expect(v.wrong).toBe(1);
      expect(e.getSnapshot().scored!.hit!.ticker).toBe(v.ticker);
      // Close everything once the story is over.
      const end = (e as unknown as { sagaEndAt: number }).sagaEndAt;
      e.advanceTo(end + 1000);
      for (const p of e.getSnapshot().positions) while (p.tokens > 1e-6 && !e.sell(p.coinId, 1)) e.advanceTo(e.now() + 250);
      const r = e.getSnapshot().scored!.result!;
      expect(r.outcome).toBe("success");
      expect(r.vamps).toHaveLength((e as unknown as { saga: { chapters: unknown[] } }).saga.chapters.length - 1);
      expect(r.scoreParts.vamps).toBeGreaterThan(0);
      expect(r.scoreParts.penalty).toBe(100);
      return;
    }
    throw new Error("no seed with a vamp");
  });

  it("stories climb to their cap and carry catalysts, boosts, KOLs and a dev sell-all", () => {
    let caps = 0;
    for (const seed of [2, 4, 5]) {
      const e = sagaEngine(seed);
      e.startRound({ leadMs: 0 });
      let peak = 0;
      for (let t = 0; t < 11 * 60_000; t += 500) {
        e.advanceTo(t);
        for (const id of (e as unknown as { sagaCoins: Set<string> }).sagaCoins) peak = Math.max(peak, e.getCoinView(id)?.mcUsd ?? 0);
      }
      const cap = (e as unknown as { saga: { capUsd: number } }).saga.capUsd;
      expect(peak).toBeGreaterThan(130_000);
      if (peak > cap * 0.08) caps++;
      const soc = [...(e as unknown as { sagaCoins: Set<string> }).sagaCoins].flatMap((id) => e.getSocial(id));
      expect(soc.some((x) => x.kind === "kol")).toBe(true);
      expect(soc.some((x) => x.kind === "tweet" || x.kind === "dex" || x.kind === "cto" || x.kind === "kol")).toBe(true);
      expect(soc.some((x) => x.kind === "dev" && x.side === "sell")).toBe(true);
    }
    expect(caps).toBeGreaterThan(0);
  });
});

describe("4% rule, boosts and DEX", () => {
  const pnut = MEME_PACK.find((m) => m.id === "pnut")!;
  const run = (seed: number, buy: number) => {
    const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [pnut] });
    e.startRound({ memeId: "pnut", leadMs: 0 });
    const id = landTarget(e);
    e.quickBuy(id, buy);
    return { e, id };
  };

  it("a 5%+ wallet slows the launch to a quarter speed instead of stopping it", () => {
    const { e, id } = run(1, 3);
    expect(Math.max(...e.walletPcts(id))).toBeGreaterThan(5);
    e.advanceTo(e.now() + 8000);
    expect(e.getCoinView(id)!.migratedAt).toBeNull();
    // Split over three wallets: none is 5%+ any more, so it runs at full speed.
    expect(e.splitPosition(id, 3)).toBe(true);
    expect(Math.max(...e.walletPcts(id))).toBeLessThan(5);
    e.advanceTo(e.now() + 30000);
    expect(e.getCoinView(id)!.migratedAt).not.toBeNull();
  });

  it("there is no cap on the total: only the per-wallet 5% rule", () => {
    const { e, id } = run(4, 0);
    e.setWalletSel([0, 1, 2, 3, 4]);
    e.quickBuy(id, 4);
    expect(e.holdingPct(id)).toBeGreaterThan(15);
    expect(e.takeBuyNote()).toBeNull();
    expect(e.quickBuy(id, 0.5)).not.toBeNull();
  });

  it("split, consolidate and wallet switching move the bag and pick who trades", () => {
    const { e, id } = run(5, 0.6);
    const total = e.holdingPct(id);
    e.splitPosition(id, 2);
    expect(e.walletPcts(id)[0]).toBeCloseTo(total / 2, 6);
    expect(e.walletPcts(id)[1]).toBeCloseTo(total / 2, 6);
    expect(e.getSnapshot().walletSel).toEqual([0, 1]);
    // Trade from wallet 2 only: a sell takes from it alone.
    e.setWalletSel([1]);
    for (let t = e.now(); e.now() < (e.getCoinView(id)!.migratingUntil ?? 0) || !e.sell(id, 1); t += 250) e.advanceTo(t);
    expect(e.walletPcts(id)[1]).toBeCloseTo(0, 6);
    expect(e.walletPcts(id)[0]).toBeGreaterThan(0);
    // Buys land in the selected wallet; consolidate pulls everything into it.
    e.quickBuy(id, 0.2);
    expect(e.walletPcts(id)[1]).toBeGreaterThan(0);
    e.consolidate(id);
    expect(e.walletPcts(id)[0]).toBe(0);
    expect(e.walletPcts(id)[1]).toBeCloseTo(e.holdingPct(id), 6);
  });

  it("after migration a 5%+ wallet only lets the coin climb a quarter as far", () => {
    // Same seed twice: once holding a 5%+ wallet through the climb, once split under the line.
    const climb = (split: boolean) => {
      const e = new Engine({ seed: 6, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [pnut] });
      e.startRound({ memeId: "pnut", leadMs: 0 });
      const id = landTarget(e);
      e.quickBuy(id, 3);
      e.splitPosition(id, 3);
      for (let t = e.now(); e.getCoinView(id)!.migratedAt === null || e.now() < (e.getCoinView(id)!.migratingUntil ?? 0); t += 250) e.advanceTo(t);
      if (!split) e.consolidate(id);
      let peak = 0;
      for (let t = e.now(), end = e.now() + 20000; t < end; t += 250) {
        e.advanceTo(t);
        peak = Math.max(peak, e.getCoinView(id)!.mcUsd);
      }
      return { peak, drag: (e as unknown as { coins: Map<string, { drag: number }> }).coins.get(id)!.drag };
    };
    const free = climb(true);
    const heavy = climb(false);
    expect(free.drag).toBe(0);
    expect(heavy.drag).toBeLessThan(0);
    expect(heavy.peak).toBeLessThan(free.peak);
  });

  it("you can pay the DEX once and buy boosts after migration, out of your wallet", () => {
    const { e, id } = run(2, 0.3);
    expect(e.buyBoost(id, "x30").ok).toBe(false); // not migrated yet
    for (let t = e.now(); e.getCoinView(id)!.migratedAt === null || e.now() < (e.getCoinView(id)!.migratingUntil ?? 0); t += 250) e.advanceTo(t);
    const w0 = e.getSnapshot().walletSol;
    expect(e.payDex(id).ok).toBe(true);
    expect(e.payDex(id).ok).toBe(false);
    expect(e.getCoinView(id)!.dexPaid).toBe(true);
    expect(e.buyBoost(id, "x100").ok).toBe(true);
    const spent = w0 - e.getSnapshot().walletSol;
    expect(spent).toBeCloseTo((299 + 899) / 104, 4);
    const s = e.getSocial(id);
    expect(s.some((x) => x.kind === "boost" && x.name.includes("you"))).toBe(true);
    expect(s.some((x) => x.kind === "dex" && x.name.includes("you"))).toBe(true);
  });

  it("holder data lists you, the dev and KOLs with their share", () => {
    const { e, id } = run(3, 0.5);
    e.advanceTo(e.now() + 40000);
    const h = e.getHolders(id);
    expect(h.youPct).toBeGreaterThan(0);
    expect(h.devPct).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(h.kols)).toBe(true);
  });
});

describe("market realism: KOLs, dev, DEX, promo PnL, saga end", () => {
  const SOL_USD = curve.SOL_USD;
  const sagaEngine = (seed: number) =>
    new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, length: "saga", pack: MEME_PACK.filter((m) => m.id === "polar-bear-cub") });
  const sagaCoins = (e: Engine) => [...(e as unknown as { sagaCoins: Set<string> }).sagaCoins];

  it("the first tweet lands within 30 s of the countdown", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0 });
      e.startScored();
      const sc = e.getSnapshot().scored!;
      expect(sc.tTweet - sc.tArm).toBeLessThanOrEqual(30_000);
    }
  });

  it("KOLs never hold 4%; every KOL sell dumps the whole bag at a real price", () => {
    let sells = 0;
    for (const seed of [2, 4, 5]) {
      const e = sagaEngine(seed);
      e.startRound({ leadMs: 0 });
      for (let t = 0; t < 6 * 60_000; t += 500) {
        e.advanceTo(t);
        for (const id of sagaCoins(e)) for (const k of e.getHolders(id).kols) expect(k.pct).toBeLessThan(4);
      }
      for (const id of sagaCoins(e)) {
        for (const x of e.getSocial(id).filter((x) => x.kind === "kol" && x.side === "sell")) {
          sells++;
          // What they got is what that much supply fetches at that market cap, less slippage (never more).
          const fair = (x.pct! / 100) * x.mc;
          expect(x.sol).toBeLessThanOrEqual(fair);
          expect(x.sol).toBeGreaterThan(fair * 0.4);
          expect(x.cost).toBeGreaterThan(0);
        }
      }
    }
    expect(sells).toBeGreaterThan(0);
  });

  it("once a coin is under the migration line, its KOLs are all out", () => {
    for (const seed of [2, 4, 5, 7]) {
      const e = sagaEngine(seed);
      e.startRound({ leadMs: 0 });
      let under = 0;
      for (let t = 0; t < 10 * 60_000; t += 1000) {
        e.advanceTo(t);
        for (const id of sagaCoins(e)) {
          const v = e.getCoinView(id);
          if (!v?.migratedAt || e.now() < v.migratingUntil! + 5000) continue;
          // Allow a few seconds for the exits to print after it crosses.
          if (v.mcUsd < MIGRATION_MC_USD * 0.7) {
            under++;
            if (under > 6) expect(e.getHolders(id).kols).toHaveLength(0);
          } else under = 0;
        }
      }
    }
  });

  it("the dev dumps the whole bag at migration, priced like a real sell", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0 });
      e.startRound({ leadMs: 0 });
      let id: string | null = null;
      for (let t = 0; t < 60000; t += 200) {
        e.advanceTo(t);
        id ??= e.getRound()?.targetCoinId ?? null;
      }
      const sells = e.getSocial(id!).filter((x) => x.kind === "dev" && x.side === "sell");
      expect(sells).toHaveLength(1);
      expect(sells[0].all).toBe(true);
      const fair = (sells[0].pct! / 100) * sells[0].mc;
      expect(sells[0].sol).toBeLessThanOrEqual(fair);
      expect(sells[0].sol).toBeGreaterThan(fair * 0.3);
      expect(e.getHolders(id!).devPct).toBe(0);
    }
  });

  it("a market sell of 2% at $100K costs roughly a quarter of the price, like a real pool", () => {
    const e = new Engine({ seed: 1, difficulty: "sniper", autoRounds: false, clock: () => 0 });
    const c = { postMc: 100_000 / SOL_USD } as { postMc: number };
    const f = (e as unknown as { poolShare: (c: unknown) => number }).poolShare.call(e, c);
    const ratio = (f / (f + 0.02)) ** 2;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(0.85);
  });

  it("the DEX gets paid at most once per coin, however the story goes", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const e = sagaEngine(seed);
      e.startRound({ leadMs: 0 });
      for (let t = 0; t < 10 * 60_000; t += 1000) e.advanceTo(t);
      for (const id of sagaCoins(e)) expect(e.getSocial(id).filter((x) => x.kind === "dex").length).toBeLessThanOrEqual(1);
    }
  });

  it("a CTO is two or three takeover crews tweeting it", () => {
    for (let seed = 1; seed < 60; seed++) {
      const e = sagaEngine(seed);
      const plan = (e as unknown as { saga: null }).saga;
      void plan;
      e.startRound({ leadMs: 0 });
      for (let t = 0; t < 10 * 60_000; t += 2000) e.advanceTo(t);
      for (const id of sagaCoins(e)) {
        const s = e.getSocial(id);
        const cto = s.find((x) => x.kind === "cto");
        if (!cto) continue;
        const crews = s.filter((x) => x.kind === "tweet" && x.name.endsWith("· CTO") && x.at >= cto.at && x.at < cto.at + 15000);
        expect(crews.length).toBeGreaterThanOrEqual(2);
        expect(new Set(crews.map((x) => x.handle)).size).toBe(crews.length);
        return;
      }
    }
    throw new Error("no seed with a CTO");
  });

  it("boosts and the DEX you pay for count against the round's PnL", () => {
    const pnut = MEME_PACK.find((m) => m.id === "pnut")!;
    const e = new Engine({ seed: 2, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [pnut] });
    e.startScored({ memeId: "pnut" });
    const sc = e.getSnapshot().scored!;
    e.advanceTo(sc.tTweet + 1);
    const id = landTarget(e);
    e.quickBuy(id, 0.3);
    for (let t = e.now(); e.getCoinView(id)!.migratedAt === null || e.now() < (e.getCoinView(id)!.migratingUntil ?? 0); t += 250) e.advanceTo(t);
    expect(e.payDex(id).ok).toBe(true);
    expect(e.buyBoost(id, "x10").ok).toBe(true);
    const promo = (299 + 99) / SOL_USD;
    expect(e.getSnapshot().positions.find((p) => p.coinId === id)!.promoSol).toBeCloseTo(promo, 6);
    for (let t = e.now(); !e.sell(id, 1); t += 250) e.advanceTo(t);
    e.advanceTo(e.now() + 200_000);
    const r = e.getSnapshot().scored!.result!;
    expect(r.promoSol).toBeCloseTo(promo, 6);
    expect(r.pnlSol).toBeCloseTo(r.closedSol - r.boughtSol - promo, 6);
  });

  it("a saga ends when the story does, even while you still hold", () => {
    for (const seed of [1, 2]) {
      const e = sagaEngine(seed);
      e.startScored();
      const sc0 = e.getSnapshot().scored!;
      e.advanceTo(sc0.tTweet + 1);
      const id = landTarget(e);
      e.quickBuy(id, 0.3);
      e.advanceTo(sc0.tTweet + 12 * 60_000);
      const sc = e.getSnapshot().scored!;
      expect(sc.phase).toBe("ended");
      expect(sc.result!.closedSol).toBeGreaterThan(0);
      expect(e.getSnapshot().positions.every((p) => p.tokens < 1e-6)).toBe(true);
    }
  });
});

describe("course changes and holder spread", () => {
  const pnut = MEME_PACK.find((m) => m.id === "pnut")!;
  const migrated = (seed: number, buy = 0.3) => {
    const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [pnut] });
    e.startRound({ memeId: "pnut", leadMs: 0 });
    const id = landTarget(e);
    if (buy) e.quickBuy(id, buy);
    for (let t = e.now(); e.getCoinView(id)!.migratedAt === null || e.now() < (e.getCoinView(id)!.migratingUntil ?? 0) + 2000; t += 250) e.advanceTo(t);
    return { e, id };
  };
  const coin = (e: Engine, id: string) => (e as unknown as { coins: Map<string, { courseTarget: number; anon: number[]; legs: { kind: string }[] }> }).coins.get(id)!;

  it("paying the DEX almost always turns it into a leg up and lifts its course", () => {
    let up = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      const { e, id } = migrated(seed);
      const mc0 = e.getCoinView(id)!.mcUsd;
      expect(e.payDex(id).ok).toBe(true);
      let peak = 0;
      for (let t = e.now(), end = e.now() + 25000; t < end; t += 250) {
        e.advanceTo(t);
        peak = Math.max(peak, e.getCoinView(id)?.mcUsd ?? 0);
      }
      if (peak > mc0 * 1.2) up++;
      expect(coin(e, id).courseTarget).toBeGreaterThanOrEqual(0);
    }
    expect(up).toBeGreaterThanOrEqual(seeds.length - 2);
  });

  it("your own buys and sells after migration bend the course, not just the next candle", () => {
    const { e, id } = migrated(3, 0);
    e.quickBuy(id, 2);
    const afterBuy = coin(e, id).courseTarget;
    expect(afterBuy).toBeGreaterThan(0);
    e.advanceTo(e.now() + 1000);
    e.sell(id, 1);
    expect(coin(e, id).courseTarget).toBeLessThan(afterBuy);
  });

  it("no anonymous wallet holds more than ~3% unless the coin is scripted to rug (then at most two)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0 });
      e.startRound({ leadMs: 0 });
      for (let t = 0; t < 60000; t += 500) e.advanceTo(t);
      for (const c of (e as unknown as { coins: Map<string, { anon: number[]; legs: { kind: string }[] }> }).coins.values()) {
        const big = c.anon.filter((x) => x > 3.2).length;
        expect(big).toBeLessThanOrEqual(2);
        if (c.legs.length && !c.legs.some((l) => l.kind === "rug")) expect(big).toBe(0);
      }
      const id = e.getRound()!.targetCoinId!;
      const v = e.getCoinView(id)!;
      expect(v.stats.top10).toBeGreaterThan(5);
      expect(v.stats.top10).toBeLessThan(45);
    }
  });
});

describe("KOL Rep: tailers and calls", () => {
  const pnut = MEME_PACK.find((m) => m.id === "pnut")!;
  const make = (tier: number, seed = 3) => {
    const kol = tier ? { tier, followers: 10000, name: "Luke", handle: "luke" } : null;
    const e = new Engine({ seed, difficulty: "sniper", autoRounds: false, clock: () => 0, pack: [pnut], kol });
    e.startScored({ memeId: "pnut" });
    e.advanceTo(e.getSnapshot().scored!.tTweet + 1);
    return { e, id: landTarget(e) };
  };

  it("followers tail your buy a few seconds later, never more than twice what you bought", () => {
    const { e, id } = make(4);
    e.quickBuy(id, 0.4);
    e.advanceTo(e.now() + 8000);
    const v = e.getCoinView(id)!;
    expect(v.tailers).toBeGreaterThanOrEqual(3);
    expect(v.tailSol).toBeLessThanOrEqual(0.8 + 1e-9);
    expect(e.getTape(id).some((t) => t.trader === "Tailer")).toBe(true);
  });

  it("nobody tails you without a following", () => {
    const { e, id } = make(0);
    e.quickBuy(id, 0.4);
    e.advanceTo(e.now() + 8000);
    expect(e.getCoinView(id)!.tailers).toBe(0);
    expect(e.postThesis(id, "sending").ok).toBe(false);
  });

  it("a call needs a bag, goes to the Tracker once, and brings a bigger wave", () => {
    const { e, id } = make(3);
    expect(e.postThesis(id, "early").ok).toBe(false);
    e.quickBuy(id, 0.3);
    e.advanceTo(e.now() + 7000);
    const before = e.getCoinView(id)!.tailers;
    const r = e.postThesis(id, "this is the one");
    expect(r.ok).toBe(true);
    expect(e.postThesis(id, "again").ok).toBe(false);
    const mine = e.getSnapshot().feed.find((t) => t.mine);
    expect(mine?.author.handle).toBe("luke");
    expect(mine?.segments.some((s) => s.hl && s.text.toUpperCase() === `$${e.getCoinView(id)!.ticker}`)).toBe(true);
    e.advanceTo(e.now() + 7000);
    expect(e.getCoinView(id)!.tailers).toBeGreaterThan(before);
    expect(e.getCoinView(id)!.called).toBe(true);
  });

  it("selling right after your followers buy in counts as dumping on them; waiting does not", () => {
    const fast = make(4, 5);
    fast.e.quickBuy(fast.id, 0.4);
    fast.e.advanceTo(fast.e.now() + 7000);
    for (let t = fast.e.now(); !fast.e.sell(fast.id, 1); t += 250) fast.e.advanceTo(t);
    fast.e.advanceTo(fast.e.now() + 200_000);
    expect(fast.e.getSnapshot().scored!.result!.kol.dumpedOn).toBeGreaterThan(0);

    const slow = make(4, 5);
    slow.e.quickBuy(slow.id, 0.4);
    slow.e.advanceTo(slow.e.now() + 30_000);
    for (let t = slow.e.now(); !slow.e.sell(slow.id, 1); t += 250) slow.e.advanceTo(t);
    slow.e.advanceTo(slow.e.now() + 200_000);
    const r = slow.e.getSnapshot().scored!.result!;
    expect(r.kol.dumpedOn).toBe(0);
    expect(r.kol.tailers).toBeGreaterThan(0);
  });
});

describe("dev mode", () => {
  type Opts = { rightName: number; rightImage: number; names: { name: string; ticker: string }[] };
  const make = (seed = 1, difficulty: "paper" | "trencher" | "sniper" = "trencher", sol = 50) => {
    const e = new Engine({ seed, difficulty, autoRounds: false, clock: () => 0, dev: { sol } });
    let id: string | undefined;
    for (let t = 0; !id && t < 20000; t += 100) {
      e.advanceTo(t);
      id = e.getSnapshot().feed.find((f) => f.scenarioId)?.scenarioId;
    }
    const sc = (e as unknown as { scenarios: Map<string, { tweetAt: number; options: Opts; plan: { rightConfig: { pair: "SOL" | "SPACEX" | "TESLA" | "PUMP" } } }> }).scenarios.get(id!)!;
    return { e, id: id!, sc };
  };
  const choice = (sc: ReturnType<typeof make>["sc"], over: Partial<DevChoice> = {}): DevChoice => ({
    nameIdx: sc.options.rightName,
    imageIdx: sc.options.rightImage,
    launchpad: "pump",
    dividends: true,
    pair: sc.plan.rightConfig.pair,
    mode: "manual",
    devBuySol: 1,
    organicSol: 0,
    rewards: "creator",
    ...over,
  });

  const b0 = (sc: ReturnType<typeof make>["sc"], bundle: Partial<NonNullable<DevChoice["bundle"]>> = {}) =>
    choice(sc, { mode: "block0", bundle: { supplyPct: 20, wallets: 20, build: "quick", mev: 0.5, ...bundle } });

  it("block-0: the bundle lands in the create block across the launch wallets, costing what the quote said", () => {
    const { e, id, sc } = make(11, "trencher", 200);
    e.advanceTo(sc.tweetAt + 2000);
    const q = e.quoteLaunch(1, 0, { supplyPct: 20, wallets: 20, build: "clean", mev: 0 });
    const sol0 = e.getSnapshot().devSol!;
    expect(e.devDeploy(id, b0(sc, { build: "clean", mev: 0 })).ok).toBe(true);
    const l = e.getSnapshot().launches[0];
    expect(l.mode).toBe("block0");
    expect(l.launchWalletPcts).toHaveLength(20);
    expect(l.launchWalletPcts.every((x) => x > 0)).toBe(true);
    expect(l.holdersPct).toBeCloseTo(20, 0);
    expect(sol0 - e.getSnapshot().devSol!).toBeCloseTo(q.costSol, 6);
    expect(q.walletCostSol).toBeCloseTo(20 * 0.012, 6);
  });

  it("bundle risk: Full hides better than Clean, Clean better than Quick; more supply and fewer wallets is worse", () => {
    const { e } = make(12);
    const r = (o: Partial<NonNullable<DevChoice["bundle"]>>) => e.quoteLaunch(1, 0, { supplyPct: 20, wallets: 20, build: "quick", mev: 0.5, ...o }).risk;
    expect(r({ build: "full" })).toBeLessThan(r({ build: "clean" }));
    expect(r({ build: "clean" })).toBeLessThan(r({ build: "quick" }));
    expect(r({ supplyPct: 35 })).toBeGreaterThan(r({ supplyPct: 10 }));
    expect(r({ wallets: 5 })).toBeGreaterThan(r({ wallets: 50 }));
    expect(r({ mev: 1 })).toBeLessThan(r({ mev: 0 }));
    expect(e.quoteLaunch(1, 1).risk).toBe(0);
  });

  it("nobody can flag a bundle for the first 5-10 minutes, however big", () => {
    const { e, id, sc } = make(21, "trencher", 200);
    e.advanceTo(sc.tweetAt + 2000);
    expect(e.devDeploy(id, b0(sc, { supplyPct: 75, wallets: 10, mev: 0 })).ok).toBe(true);
    const l0 = e.getSnapshot().launches[0];
    expect(l0.holdersPct).toBeGreaterThan(70);
    expect(l0.bonded).toBe(false);
    expect(l0.bundle.hiddenForMs).toBeGreaterThanOrEqual(5 * 60_000 - 1);
    expect(l0.bundle.hiddenForMs).toBeLessThanOrEqual(6 * 60_000);
    const end = e.now() + 4.9 * 60_000;
    for (let t = e.now(); t < end; t += 1000) e.advanceTo(t);
    expect(e.getSnapshot().launches[0].bundle.flagged).toBeNull();
  });

  it("after the quiet window a heavy Quick bundle gets called out: BUNDLED tag, a checker tweet", () => {
    let caught = 0;
    for (const seed of [21, 22, 23, 24]) {
      const { e, id, sc } = make(seed, "trencher", 200);
      e.advanceTo(sc.tweetAt + 2000);
      e.devDeploy(id, b0(sc, { supplyPct: 40, wallets: 10, mev: 0 }));
      const end = e.now() + 7 * 60_000;
      for (let t = e.now(); t < end; t += 1000) e.advanceTo(t);
      const l = e.getSnapshot().launches[0];
      if (!l.bundle.flagged) continue;
      caught++;
      expect(l.bundle.flagged.at - l.launchedAt).toBeGreaterThanOrEqual(5 * 60_000);
      const cv = e.getCoinView(l.coinId)!;
      expect(cv.bundled).toBe(true);
      expect(e.getSnapshot().feed.some((t) => t.segments.some((s) => s.text.includes(l.ticker)) && t.segments.map((s) => s.text).join("").match(/bundl|cluster/))).toBe(true);
    }
    expect(caught).toBeGreaterThanOrEqual(3);
  });

  it("market maker: Defend buys dips from its budget and never sells; Distribute sells the bag into strength", () => {
    const { e, id, sc } = make(51, "trencher", 300);
    e.advanceTo(sc.tweetAt + 2000);
    e.devDeploy(id, b0(sc, { supplyPct: 40, wallets: 20, build: "full" }));
    const coinId = e.getSnapshot().launches[0].coinId;
    expect(e.startMarketMaker(coinId, { strategy: "defend", band: 0.05, budgetSol: 10, pace: 2 }).ok).toBe(true);
    let end = e.now() + 120_000;
    for (let t = e.now(); t < end; t += 500) e.advanceTo(t);
    let mm = e.getSnapshot().launches[0].mm!;
    expect(mm.gotSol).toBe(0);
    expect(mm.spentSol).toBeLessThanOrEqual(10 + 1e-6);
    const bag0 = e.getSnapshot().launches[0].holdersPct;
    expect(e.startMarketMaker(coinId, { strategy: "distribute", band: 0.1, budgetSol: 0, pace: 5 }).ok).toBe(true);
    end = e.now() + 180_000;
    for (let t = e.now(); t < end; t += 500) e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    mm = l.mm!;
    expect(l.holdersPct).toBeLessThan(bag0 * 0.9);
    expect(l.gotSol).toBeGreaterThan(0);
    e.stopMarketMaker(coinId);
    expect(e.getSnapshot().launches[0].mm).toBeNull();
  });

  it("a plain launch with a small dev buy never gets flagged", () => {
    const { e, id, sc } = make(13);
    e.advanceTo(sc.tweetAt + 2000);
    e.devDeploy(id, choice(sc, { mode: "organic", organicSol: 1 }));
    const end = e.now() + 120_000;
    for (let t = e.now(); t < end; t += 1000) e.advanceTo(t);
    expect(e.getSnapshot().launches[0].bundle.flagged).toBeNull();
  });

  it("outside snipers hit your launch in the first seconds and most are out within a minute", () => {
    let seen = 0;
    for (const seed of [31, 32, 33]) {
      const { e, id, sc } = make(seed);
      e.advanceTo(sc.tweetAt + 2000);
      e.devDeploy(id, choice(sc));
      e.advanceTo(e.now() + 3000);
      const n0 = e.getSnapshot().launches[0].snipers.count;
      seen += n0;
      const end = e.now() + 130_000;
      for (let t = e.now(); t < end; t += 1000) e.advanceTo(t);
      expect(e.getSnapshot().launches[0].snipers.count).toBeLessThanOrEqual(Math.ceil(n0 * 0.5));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("tweets come with a Dev button and 3, 4 or 5 options by difficulty, without the answers", () => {
    for (const [d, n] of [["paper", 3], ["trencher", 4], ["sniper", 5]] as const) {
      const { e, id } = make(2, d);
      const v = e.getDevScenario(id)!;
      expect(v.names).toHaveLength(n);
      expect(v.images).toHaveLength(n);
      expect(new Set(v.names.map((x) => `${x.name}|${x.ticker}`)).size).toBe(n);
      expect(JSON.stringify(v)).not.toMatch(/right/);
    }
  });

  it("deploying costs the fee and your buys from the dev wallet, once per tweet", () => {
    const { e, id, sc } = make(3);
    expect(e.devDeploy(id, choice(sc, { devBuySol: 100 })).ok).toBe(false);
    const r = e.devDeploy(id, choice(sc));
    expect(r.ok).toBe(true);
    expect(e.getSnapshot().devSol).toBeCloseTo(50 - 0.02 - 1, 6);
    expect(e.devDeploy(id, choice(sc)).ok).toBe(false);
    const l = e.getSnapshot().launches[0];
    expect(l.deployerPct).toBeGreaterThan(1);
    expect(l.check).toEqual({ name: true, ticker: true, image: true, launchpad: true, dividends: true, pair: true });
    expect(l.first).toBe(true);
  });

  it("a wrong ticker gets roasted on the Tracker and never bonds", () => {
    const { e, id, sc } = make(4);
    e.advanceTo(sc.tweetAt + 2000);
    const wrong = (sc.options.rightName + 1) % sc.options.names.length;
    e.devDeploy(id, choice(sc, { nameIdx: wrong, mode: "organic", organicSol: 1 }));
    const tweets0 = e.getSnapshot().feed.length;
    e.advanceTo(e.now() + 20000);
    const ticker = e.getSnapshot().launches[0].ticker;
    expect(e.getSnapshot().feed.slice(0, e.getSnapshot().feed.length - tweets0 + 3).some((t) => t.segments.some((s) => s.text.includes(ticker)))).toBe(true);
    e.advanceTo(e.now() + 180_000);
    expect(e.getSnapshot().launches[0].bonded).toBe(false);
    expect(e.getSnapshot().launches[0].check.ticker && e.getSnapshot().launches[0].check.name).toBe(false);
  });

  it("first with the right coin: the rival's right coin only gets scraps", () => {
    const { e, id, sc } = make(5);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc));
    e.advanceTo(e.now() + 40_000);
    const coins = (e as unknown as { coins: Map<string, { spec: { role: string; ticker: string; name: string }; dev: unknown }> }).coins;
    const right = sc.options.names[sc.options.rightName];
    const rivals = [...coins.values()].filter((c) => !c.dev && c.spec.ticker === right.ticker && c.spec.name === right.name);
    expect(rivals.every((c) => c.spec.role !== "target")).toBe(true);
  });

  it("dev sells pay the dev wallet, Nuke empties every launch wallet, rewards can be claimed", () => {
    const { e, id, sc } = make(6);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc, { mode: "organic", organicSol: 1 }));
    e.advanceTo(e.now() + 15_000);
    const coinId = e.getSnapshot().launches[0].coinId;
    const w0 = e.getSnapshot().devSol!;
    expect(e.devSellFrom(coinId, "deployer", 0.5).ok).toBe(true);
    expect(e.getSnapshot().devSol!).toBeGreaterThan(w0);
    expect(e.getSocial(coinId).some((x) => x.kind === "dev" && x.side === "sell")).toBe(true);
    expect(e.nuke(coinId).ok).toBe(true);
    const l = e.getSnapshot().launches[0];
    expect(l.deployerPct).toBe(0);
    expect(l.holdersPct).toBe(0);
    expect(l.rewardsSol).toBeGreaterThan(0);
    const before = e.getSnapshot().devSol!;
    expect(e.claimRewards(coinId).ok).toBe(true);
    expect(e.getSnapshot().devSol!).toBeCloseTo(before + l.rewardsSol, 9);
  });

  it("Nuke stops every bot and sells every wallet: deployer, launch, trading, trend-bot and holder wallets", () => {
    const { e, id, sc } = make(41, "trencher", 200);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc, { mode: "organic", organicSol: 1 }));
    e.advanceTo(e.now() + 3000);
    const coinId = e.getSnapshot().launches[0].coinId;
    expect(e.quickBuy(coinId, 0.5, e.now(), [0, 1])).not.toBeNull();
    expect(e.startTrendBot(coinId, "x2").ok).toBe(true);
    expect(e.startHolderBot(coinId, 25).ok).toBe(true);
    const end = e.now() + 8000;
    for (let t = e.now(); t < end; t += 250) e.advanceTo(t);
    const l0 = e.getSnapshot().launches[0];
    expect(l0.botWalletPcts.some((x) => x > 0)).toBe(true);
    expect(l0.holderWallets.pct).toBeGreaterThan(0);
    while (e.now() < (e.getCoinView(coinId)!.migratingUntil ?? 0)) e.advanceTo(e.now() + 250);
    expect(e.nuke(coinId).ok).toBe(true);
    e.advanceTo(e.now() + 10_000);
    const l = e.getSnapshot().launches[0];
    expect(l.totalPct).toBe(0);
    expect(l.bots.trend).toBeNull();
    expect(l.bots.holders).toBeNull();
    expect(e.walletPcts(coinId).every((x) => x === 0)).toBe(true);
  });

  it("organic holders build with the market cap, and a full dump ends near the pool floor, not at zero", () => {
    let checked = 0;
    for (const seed of [2, 3, 5, 7]) {
      const { e, id, sc } = make(seed, "trencher", 200);
      e.advanceTo(sc.tweetAt + 2500);
      e.devDeploy(id, choice(sc, { mode: "block0", bundle: { supplyPct: 15, wallets: 20, build: "clean", mev: 0.5 } }));
      const coinId = e.getSnapshot().launches[0].coinId;
      const end = e.now() + 240_000;
      for (let t = e.now(); t < end && e.getSnapshot().launches[0].mcUsd < 100_000; t += 500) e.advanceTo(t);
      if (e.getSnapshot().launches[0].mcUsd < 100_000) continue;
      checked++;
      expect(e.getCoinView(coinId)!.holders).toBeGreaterThan(150);
      while (e.now() < (e.getCoinView(coinId)!.migratingUntil ?? 0)) e.advanceTo(e.now() + 250);
      e.nuke(coinId);
      expect(e.getSnapshot().launches[0].mcUsd).toBeGreaterThan(10_000);
      const later = e.now() + 120_000;
      for (let t = e.now(); t < later; t += 1000) {
        e.advanceTo(t);
        expect(e.getSnapshot().launches[0].mcUsd).toBeGreaterThan(1500);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("your own launch: pay the DEX and boost it any time, from the dev wallet; it draws buyers", () => {
    const { e, id, sc } = make(8);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc));
    const coinId = e.getSnapshot().launches[0].coinId;
    expect(e.getCoinView(coinId)!.dexPaid).toBe(false);
    const dev0 = e.getSnapshot().devSol!;
    const trade0 = e.getSnapshot().walletSol;
    expect(e.payDex(coinId).ok).toBe(true);
    expect(e.payDex(coinId).ok).toBe(false);
    expect(e.buyBoost(coinId, "x30").ok).toBe(true);
    expect(dev0 - e.getSnapshot().devSol!).toBeCloseTo((299 + 249) / 104, 6);
    // One balance in Dev mode: it came out of the same SOL.
    expect(trade0 - e.getSnapshot().walletSol).toBeCloseTo((299 + 249) / 104, 6);
    expect(e.getSnapshot().launches[0].spentSol).toBeGreaterThan(5);
    const d = (e as unknown as { coins: Map<string, { dev: { promo: { peak: number } } }> }).coins.get(coinId)!.dev;
    expect(d.promo.peak).toBeGreaterThan(0.5);
  });

  it("KOLs buy into a right coin that runs, and some tweet it", () => {
    let kolBuys = 0;
    let kolTweets = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const { e, id, sc } = make(seed);
      e.advanceTo(sc.tweetAt + 1500);
      e.devDeploy(id, choice(sc, { mode: "organic", organicSol: 1 }));
      for (let t = e.now(); t < sc.tweetAt + 150_000; t += 500) e.advanceTo(t);
      const l = e.getSnapshot().launches[0];
      const soc = e.getSocial(l.coinId);
      if (l.peakMcUsd > 30_000) {
        kolBuys += soc.filter((x) => x.kind === "kol" && x.side === "buy").length;
        kolTweets += soc.filter((x) => x.kind === "tweet").length;
      } else expect(soc.some((x) => x.kind === "kol")).toBe(false);
    }
    expect(kolBuys).toBeGreaterThan(2);
    expect(kolTweets).toBeGreaterThan(0);
  });

  it("ten launch wallets: organic buys land in them, each buys and sells on its own", () => {
    const { e, id, sc } = make(10);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc, { mode: "organic", organicSol: 1 }));
    e.advanceTo(e.now() + 4000);
    let l = e.getSnapshot().launches[0];
    expect(l.launchWalletPcts).toHaveLength(10);
    const filled = l.launchWalletPcts.filter((p) => p > 0).length;
    expect(filled).toBeGreaterThanOrEqual(3);
    expect(e.devBuy(l.coinId, 0.5, 9).ok).toBe(true);
    l = e.getSnapshot().launches[0];
    expect(l.launchWalletPcts[9]).toBeGreaterThan(0);
    // Launch wallet buys are not public: no DEV mark for them.
    const devMarks = e.getSocial(l.coinId).filter((x) => x.kind === "dev").length;
    expect(e.devSellFrom(l.coinId, 9, "max").ok).toBe(true);
    l = e.getSnapshot().launches[0];
    expect(l.launchWalletPcts[9]).toBe(0);
    expect(l.launchWalletPcts.filter((p) => p > 0).length).toBe(filled);
    expect(e.getSocial(l.coinId).filter((x) => x.kind === "dev").length).toBe(devMarks);
    // "All launch wallets" sells pro rata.
    expect(e.devSellFrom(l.coinId, "holders", "max").ok).toBe(true);
    expect(e.getSnapshot().launches[0].holdersPct).toBeCloseTo(0, 9);
  });

  it("volume bot: paid up front, wash-trades its package over the window, stop refunds the rest", () => {
    const { e, id, sc } = make(21, "trencher", 200);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc));
    const coinId = e.getSnapshot().launches[0].coinId;
    const dev0 = e.getSnapshot().devSol!;
    const vol0 = e.getCoinView(coinId)!.volumeUsd;
    expect(e.startVolumeBot(coinId, "v10").ok).toBe(true);
    expect(e.startVolumeBot(coinId, "v10").ok).toBe(false);
    expect(dev0 - e.getSnapshot().devSol!).toBeCloseTo((10_000 / 104) * 0.0125, 6);
    for (let t = e.now(), end = e.now() + 150_000; t < end; t += 500) e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    expect(l.bots.volume).not.toBeNull();
    expect(l.bots.volume!.done).toBeGreaterThan(0.35);
    expect(e.getCoinView(coinId)!.volumeUsd - vol0).toBeGreaterThan(3000);
    const before = e.getSnapshot().devSol!;
    expect(e.stopVolumeBot(coinId)).toBeGreaterThan(0);
    expect(e.getSnapshot().devSol!).toBeGreaterThan(before);
    expect(e.getSnapshot().launches[0].bots.volume).toBeNull();
  });

  it("trend bot: a live estimate, then buys into launch wallets until the target", () => {
    const { e, id, sc } = make(22, "trencher", 200);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc));
    const coinId = e.getSnapshot().launches[0].coinId;
    const mc0 = e.getCoinView(coinId)!.mcUsd;
    const q = e.quoteTrend(coinId, "x2")!;
    expect(q.targetUsd).toBeCloseTo(mc0 * 2, -2);
    expect(q.sol).toBeGreaterThan(1);
    expect(q.sol).toBeLessThan(30);
    const bond = e.quoteTrend(coinId, "bond")!;
    expect(bond.sol).toBeGreaterThan(q.sol);
    expect(bond.sol).toBeLessThan(110);
    const dev0 = e.getSnapshot().devSol!;
    expect(e.startTrendBot(coinId, "x2").ok).toBe(true);
    for (let t = e.now(), end = e.now() + 60_000; t < end; t += 250) e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    expect(l.bots.trend).toBeNull();
    expect(l.bots.lastBot).toMatch(/hit|budget/);
    expect(l.peakMcUsd).toBeGreaterThan(mc0 * 1.6);
    const spent = dev0 - e.getSnapshot().devSol!;
    expect(spent).toBeLessThanOrEqual(q.sol * 1.3 + 0.05);
  });

  it("trend bot alone (a wrong ticker nobody else buys) still gets it there, close to the estimate", () => {
    const { e, id, sc } = make(24, "trencher", 200);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc, { nameIdx: (sc.options.rightName + 1) % sc.options.names.length }));
    const coinId = e.getSnapshot().launches[0].coinId;
    const mc0 = e.getCoinView(coinId)!.mcUsd;
    const q = e.quoteTrend(coinId, "x2")!;
    const dev0 = e.getSnapshot().devSol!;
    e.startTrendBot(coinId, "x2");
    for (let t = e.now(), end = e.now() + 90_000; t < end; t += 250) e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    expect(l.peakMcUsd).toBeGreaterThan(mc0 * 1.9);
    expect(l.bots.lastBot).toMatch(/hit/);
    expect(l.botWalletPcts.some((p) => p > 0)).toBe(true);
    const spent = dev0 - e.getSnapshot().devSol!;
    expect(spent).toBeGreaterThan(q.sol * 0.5);
    expect(spent).toBeLessThanOrEqual(q.sol * 1.3 + 0.05);
  });

  it("holder bot: each holder buys ~0.03% of supply; 200 on a fresh coin is ~3 SOL; you can sell them all", () => {
    const { e, id, sc } = make(23, "trencher", 50);
    e.advanceTo(sc.tweetAt + 1500);
    // A wrong ticker: nobody else buys, so the holders are the only thing moving the price.
    e.devDeploy(id, choice(sc, { devBuySol: 0.25, nameIdx: (sc.options.rightName + 1) % sc.options.names.length }));
    const coinId = e.getSnapshot().launches[0].coinId;
    const est = e.quoteHolders(coinId, 200);
    expect(est).toBeGreaterThan(2);
    expect(est).toBeLessThan(4.5);
    const b0 = e.getSnapshot().devSol!;
    expect(e.startHolderBot(coinId, 200).ok).toBe(true);
    for (let t = e.now(), end = e.now() + 240_000; t < end; t += 500) e.advanceTo(t);
    let l = e.getSnapshot().launches[0];
    expect(l.bots.holders).toBeNull();
    expect(l.holderWallets.count).toBe(200);
    expect(l.holderWallets.pct).toBeGreaterThan(5);
    expect(l.holderWallets.pct).toBeLessThan(6.5);
    expect(b0 - e.getSnapshot().devSol!).toBeGreaterThan(2);
    expect(b0 - e.getSnapshot().devSol!).toBeLessThan(est * 1.3);
    const holders = e.getCoinView(coinId)!.holders;
    const r = e.walletsSell(coinId, [{ g: "holder" }], 1);
    expect(r.ok).toBe(true);
    l = e.getSnapshot().launches[0];
    expect(l.holderWallets.count).toBe(0);
    expect(e.getCoinView(coinId)!.holders).toBeLessThanOrEqual(Math.max(1, holders - 200 + 1));
    expect(e.getCoinView(coinId)!.holders).toBeLessThan(holders);
  });

  it("one balance: launches, bots and trading wallets all draw on the same SOL", () => {
    const { e, id, sc } = make(25, "trencher", 50);
    expect(e.getSnapshot().devSol).toBe(e.getSnapshot().walletSol);
    e.devDeploy(id, choice(sc));
    expect(e.getSnapshot().walletSol).toBeCloseTo(50 - 1.02, 6);
    const coinId = e.getSnapshot().launches[0].coinId;
    e.startHolderBot(coinId, 25);
    expect(e.getSnapshot().devSol).toBe(e.getSnapshot().walletSol);
  });

  it("wallet panel: buy and sell with any mix of deployer, launch, bot and trading wallets; launch wallets grow to 50", () => {
    const { e, id, sc } = make(26, "trencher", 100);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc));
    const coinId = e.getSnapshot().launches[0].coinId;
    const w0 = e.getSnapshot().walletSol;
    const refs: WalletRef[] = [{ g: "deployer" }, { g: "launch", i: 0 }, { g: "launch", i: 5 }, { g: "trade", i: 0 }, { g: "trade", i: 2 }];
    const r = e.walletsBuy(coinId, refs, 0.5);
    expect(r.fills).toBe(5);
    expect(w0 - e.getSnapshot().walletSol).toBeCloseTo(2.5, 6);
    let l = e.getSnapshot().launches[0];
    expect(l.launchWalletPcts[0]).toBeGreaterThan(0);
    expect(l.launchWalletPcts[5]).toBeGreaterThan(0);
    expect(e.walletPcts(coinId)[0]).toBeGreaterThan(0);
    expect(e.walletPcts(coinId)[2]).toBeGreaterThan(0);
    const s = e.walletsSell(coinId, [{ g: "launch", i: 0 }, { g: "trade", i: 2 }], 1);
    expect(s.fills).toBe(2);
    l = e.getSnapshot().launches[0];
    expect(l.launchWalletPcts[0]).toBe(0);
    expect(e.walletPcts(coinId)[2]).toBe(0);
    expect(e.addLaunchWallets(coinId)).toBe(20);
    for (let k = 0; k < 5; k++) e.addLaunchWallets(coinId);
    expect(e.getSnapshot().launches[0].launchWalletPcts).toHaveLength(50);
    // Holder wallets are never bought directly, and a coin that isn't yours only takes trading wallets.
    expect(e.walletsBuy(coinId, [{ g: "holder" }], 1).ok).toBe(false);
  });

  it("the holder bot stops at its budget when the price runs instead of draining your balance", () => {
    const { e, id, sc } = make(23, "trencher", 50);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc, { devBuySol: 0.25 }));
    const coinId = e.getSnapshot().launches[0].coinId;
    const est = e.quoteHolders(coinId, 200);
    const b0 = e.getSnapshot().walletSol;
    e.startHolderBot(coinId, 200);
    for (let t = e.now(), end = e.now() + 240_000; t < end; t += 500) e.advanceTo(t);
    expect(b0 - e.getSnapshot().walletSol).toBeLessThanOrEqual(est * 1.3 + 0.5);
    expect(e.getSnapshot().walletSol).toBeGreaterThan(30);
  });

  it("the trend bot buys into its own wallets, never your launch wallets", () => {
    const { e, id, sc } = make(27, "trencher", 200);
    e.advanceTo(sc.tweetAt + 1500);
    e.devDeploy(id, choice(sc, { nameIdx: (sc.options.rightName + 1) % sc.options.names.length }));
    const coinId = e.getSnapshot().launches[0].coinId;
    e.startTrendBot(coinId, "x2");
    for (let t = e.now(), end = e.now() + 60_000; t < end; t += 250) e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    expect(l.botWalletPcts.reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
    expect(l.holdersPct).toBe(0);
  });

  it("dividends are out of Dev mode: whatever you send, the launch gets the right setting", () => {
    const { e, id, sc } = make(9);
    e.devDeploy(id, choice(sc, { dividends: false }));
    expect(e.getSnapshot().launches[0].check.dividends).toBe(true);
  });

  it("quotes the opening market cap and supply share of a launch", () => {
    const { e } = make(7);
    const q = e.quoteLaunch(1, 1);
    expect(q.mcUsd).toBeGreaterThan(3000);
    expect(q.supplyPct).toBeGreaterThan(4);
    expect(q.supplyPct).toBeLessThan(10);
  });
});

describe("multi-wallet buys are per wallet", () => {
  const make = () => {
    const e = new Engine({ seed: 3, difficulty: "sniper", autoRounds: false, clock: () => 0, startingSol: 25 });
    e.startRound({ leadMs: 0 });
    return { e, id: landTarget(e) };
  };

  it("0.2 SOL with five wallets selected buys 0.2 SOL in each: five fills, 1 SOL", () => {
    const { e, id } = make();
    e.setWalletSel([0, 1, 2, 3, 4]);
    const w0 = e.getSnapshot().walletSol;
    const t = e.quickBuy(id, 0.2)!;
    expect(w0 - e.getSnapshot().walletSol).toBeCloseTo(1, 9);
    expect(t.sol).toBeCloseTo(1, 9);
    const pcts = e.walletPcts(id);
    expect(pcts.every((p) => p > 0)).toBe(true);
    // Each later fill paid a slightly higher price, so it got slightly fewer tokens.
    for (let i = 1; i < 5; i++) expect(pcts[i]).toBeLessThan(pcts[i - 1]);
    expect(e.getTape(id).filter((x) => x.by === "you").length).toBeGreaterThanOrEqual(5);
  });

  it("not enough SOL for every wallet is refused with a note", () => {
    const { e, id } = make();
    e.setWalletSel([0, 1, 2, 3, 4]);
    expect(e.quickBuy(id, 6)).toBeNull();
    expect(e.takeBuyNote()).toMatch(/5 wallets/);
  });

  it("named wallets override the selection, for buys and sells", () => {
    const { e, id } = make();
    e.quickBuy(id, 0.3, e.now(), [2]);
    expect(e.walletPcts(id)[2]).toBeGreaterThan(0);
    expect(e.walletPcts(id)[0]).toBe(0);
    e.quickBuy(id, 0.3, e.now(), [0]);
    for (let t = e.now(); e.now() < (e.getCoinView(id)!.migratingUntil ?? 0) || !e.sell(id, 1, e.now(), "selected", [2]); t += 250) e.advanceTo(t);
    expect(e.walletPcts(id)[2]).toBe(0);
    expect(e.walletPcts(id)[0]).toBeGreaterThan(0);
  });
});
