import { describe, expect, it } from "vitest";
import type { RoundResult } from "@/engine/types";
import { awardRound, featuresFor, levelForXp, rankFor, START_SOL, xpForLevel, type CampaignProgress } from "./progression";

const fresh: CampaignProgress = { xp: 0, kolPoints: 0, traderSol: START_SOL, rounds: 0, streak: 0, firsts: { tenX: false, vamp: false, saga: false } };
const result = (over: Partial<RoundResult> = {}): RoundResult =>
  ({ outcome: "success", score: 600, training: false, pnlPct: 50, vamps: [], length: "blitz", buyNumber: 8, boughtSol: 1, kol: { tailers: 0, tailSol: 0, dumpedOn: 0, called: false }, ...over }) as RoundResult;

describe("campaign progression", () => {
  it("levels come at the planned pace: ~3 rounds to 2, ~40 to 10, ~250 to 30 at a typical score", () => {
    const perRound = 50; // a ~500 score
    expect(Math.round(xpForLevel(2) / perRound)).toBe(3);
    expect(xpForLevel(10) / perRound).toBeGreaterThan(35);
    expect(xpForLevel(10) / perRound).toBeLessThan(60);
    expect(xpForLevel(30) / perRound).toBeGreaterThan(200);
    expect(xpForLevel(30) / perRound).toBeLessThan(300);
    for (let l = 1; l < 40; l++) expect(levelForXp(xpForLevel(l))).toBe(l);
  });

  it("ranks and unlocks follow the road", () => {
    expect(rankFor(1)).toBe("Fresh Wallet");
    expect(rankFor(8)).toBe("Trencher");
    expect(rankFor(31)).toBe("Insider");
    const l1 = featuresFor(1);
    expect(l1).toMatchObject({ saga: false, orders: false, wallets: 1, boosts: false, dex: false, dev: false });
    expect(l1.difficulties).toEqual(["paper"]);
    expect(featuresFor(4).saga).toBe(true);
    expect(featuresFor(5).wallets).toBe(2);
    expect(featuresFor(10).difficulties).toContain("sniper");
    expect(featuresFor(18).wallets).toBe(5);
    expect(featuresFor(15).dev).toBe(true);
  });

  it("pays score/10, half in Casual, with first-time and streak bonuses once", () => {
    let p = fresh;
    const a = awardRound(p, result({ pnlPct: 1200 }), 4);
    expect(a.award.lines.map((l) => l.label)).toEqual(["Round score", "First 10× trade"]);
    expect(a.award.xp).toBe(160);
    expect(a.next.traderSol).toBe(4);
    p = a.next;
    // The 10x bonus is paid once only.
    expect(awardRound(p, result({ pnlPct: 1200 }), 4).award.xp).toBe(60 + 0 /* streak 2 */);
    const casual = awardRound(fresh, result({ training: true }), 2.5);
    expect(casual.award.xp).toBe(30);
    // Third hit in a row starts the streak bonus.
    const s3 = awardRound({ ...fresh, streak: 2 }, result(), 3);
    expect(s3.award.lines.some((l) => l.label.startsWith("Hit streak"))).toBe(true);
    // A false start pays nothing and breaks the streak.
    const fs = awardRound({ ...fresh, streak: 4 }, result({ outcome: "false_start", score: 0 }), 2.5);
    expect(fs.award.xp).toBe(0);
    expect(fs.next.streak).toBe(0);
  });

  it("going broke tops you up to 2.5 SOL and costs half your progress into the level, never a level", () => {
    const p = { ...fresh, xp: xpForLevel(5) + 100, traderSol: 3 };
    const { next, award } = awardRound(p, result({ outcome: "missed", score: 0 }), 0.2);
    expect(award.bust).toBe(true);
    expect(next.traderSol).toBe(START_SOL);
    expect(levelForXp(next.xp)).toBe(5);
    expect(next.xp).toBeLessThan(p.xp);
  });
});

describe("KOL Rep", () => {
  it("tiers and followers climb smoothly", async () => {
    const { kolTier, followersFor, KOL_TIERS } = await import("./progression");
    expect(kolTier(0)).toBe(0);
    expect(kolTier(30)).toBe(1);
    expect(kolTier(400)).toBe(3);
    expect(kolTier(9999)).toBe(5);
    for (let i = 1; i < KOL_TIERS.length; i++) expect(followersFor(KOL_TIERS[i].at)).toBe(KOL_TIERS[i].followers);
    let last = -1;
    for (let p = 0; p < 6000; p += 50) {
      const f = followersFor(p);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
  });

  it("only counts from level 8; good trades and calls build it, rugs and dumping on followers cost it", () => {
    const lvl8 = { ...fresh, xp: xpForLevel(8) };
    const good = awardRound(lvl8, result({ pnlPct: 300, buyNumber: 3, kol: { tailers: 4, tailSol: 1, dumpedOn: 0, called: true } }), 5);
    expect(good.award.kolLines.map((l) => l.label)).toEqual(["Profitable trade (+300%)", "Early on the right coin", "Your call played out"]);
    expect(good.next.kolPoints).toBe(15 + 4 + 10);
    const dump = awardRound({ ...lvl8, kolPoints: 50 }, result({ pnlPct: 10, kol: { tailers: 3, tailSol: 1, dumpedOn: 3, called: false } }), 5);
    expect(dump.next.kolPoints).toBeLessThan(50);
    const rugged = awardRound({ ...lvl8, kolPoints: 5 }, result({ outcome: "missed", pnlPct: -80, score: 0 }), 1);
    expect(rugged.next.kolPoints).toBe(0);
    // Before level 8 nothing moves.
    expect(awardRound(fresh, result({ pnlPct: 300 }), 5).next.kolPoints).toBe(0);
  });
});
