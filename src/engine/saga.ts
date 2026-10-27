import type { Rng } from "./rng";

/**
 * Saga mode: a 5-10 minute round told in beats. Pumps (KOLs pile in, boosts get bought), fades (KOLs exit,
 * boosts expire), revivals (a catalyst sends it back), vamps (a new narrative takes over and the original rugs)
 * and a final rug or bleed. Each coin in the saga plays one chapter; a vamp hands the story to the next coin.
 */

export type Catalyst = "rt" | "quote" | "kolTweet" | "dex" | "cto" | "kolBuy";

export interface Beat {
  kind: "pump" | "fade" | "revival" | "vamp" | "rug" | "bleed";
  /** Length in ms. */
  ms: number;
  /** USD market cap the beat ends at. */
  toUsd: number;
  catalyst?: Catalyst;
}

export interface SagaPlan {
  /** One chapter per coin: the original, then each vamp. Every chapter but the last ends in a `vamp` beat. */
  chapters: Beat[][];
  /** Highest market cap the story is allowed to reach (USD). */
  capUsd: number;
  /** Total length of the story from the first migration, ms (roughly). */
  totalMs: number;
}

const CATALYSTS: Catalyst[] = ["rt", "quote", "kolTweet", "dex", "cto", "kolBuy"];

/** Where the story can top out: mostly 150K-1M, sometimes 1-5M, rarely 10M+, very rarely 30M+. */
function pickCap(r: Rng): number {
  const x = r.next();
  const logRange = (a: number, b: number) => Math.exp(r.range(Math.log(a), Math.log(b)));
  if (x < 0.55) return logRange(150_000, 1_000_000);
  if (x < 0.85) return logRange(1_000_000, 5_000_000);
  if (x < 0.96) return logRange(8_000_000, 20_000_000);
  return logRange(30_000_000, 45_000_000);
}

/** How many vamps: often none, sometimes one, rarely two (never more than the meme has written). */
function pickVamps(r: Rng, available: number): number {
  const x = r.next();
  const want = x < 0.45 ? 0 : x < 0.9 ? 1 : 2;
  return Math.min(want, available);
}

export function planSaga(r: Rng, vampsAvailable: number): SagaPlan {
  const capUsd = pickCap(r);
  const nVamps = pickVamps(r, vampsAvailable);
  const totalMs = r.range(5 * 60_000, 10 * 60_000);
  const chapters: Beat[][] = [];
  // Budget per chapter: the original gets the biggest share.
  const shares = nVamps === 0 ? [1] : nVamps === 1 ? [0.5, 0.5] : [0.4, 0.3, 0.3];
  // The story's highs climb across chapters towards the cap; every high is a step up from the last.
  let high = Math.min(capUsd * r.range(0.6, 0.9), r.range(150_000, 300_000));
  const nextHigh = () => {
    high = Math.min(capUsd * r.range(0.92, 1.0), high * r.range(1.4, 2.6));
    return high;
  };

  for (let c = 0; c <= nVamps; c++) {
    const budget = totalMs * shares[c];
    const beats: Beat[] = [];
    let used = 0;
    const push = (b: Beat) => {
      beats.push(b);
      used += b.ms;
    };
    // Each chapter opens with a pump off its migration; vamp chapters usually set a new high.
    push({ kind: "pump", ms: r.range(25_000, 55_000), toUsd: c === 0 ? high : nextHigh() });
    let last = high;
    // At least one fade and revival per chapter, then more while the budget allows.
    let cycles = 0;
    // The DEX profile only gets paid once per coin.
    let dexUsed = false;
    while (cycles === 0 || used + 70_000 + 40_000 < budget) {
      const low = Math.max(25_000, last * r.range(0.25, 0.5));
      push({ kind: "fade", ms: r.range(30_000, 75_000), toUsd: low });
      last = nextHigh();
      const catalyst = r.pick(dexUsed ? CATALYSTS.filter((k) => k !== "dex") : CATALYSTS);
      if (catalyst === "dex") dexUsed = true;
      push({ kind: "revival", ms: r.range(20_000, 50_000), toUsd: last, catalyst });
      cycles++;
      if (cycles >= 6) break;
    }
    if (c < nVamps) {
      // The new narrative lands; this coin rugs out underneath it.
      push({ kind: "vamp", ms: r.range(30_000, 45_000), toUsd: r.range(5_000, 12_000) });
    } else if (r.chance(0.55)) {
      push({ kind: "rug", ms: r.range(30_000, 50_000), toUsd: r.range(5_000, 15_000) });
    } else {
      push({ kind: "bleed", ms: r.range(45_000, 80_000), toUsd: Math.max(10_000, last * r.range(0.08, 0.2)) });
    }
    // Stretch or squeeze so the chapter fills its share of the round.
    const k = Math.max(0.6, Math.min(1.8, budget / used));
    for (const b of beats) b.ms *= k;
    chapters.push(beats);
  }
  return { chapters, capUsd, totalMs };
}

/** Boost packages, like a DEX boost menu. */
export const BOOST_TIERS = [
  { label: "x10", usd: 99, hours: 12 },
  { label: "x30", usd: 249, hours: 12 },
  { label: "x50", usd: 399, hours: 12 },
  { label: "x100", usd: 899, hours: 24 },
  { label: "x500", usd: 3999, hours: 24 },
] as const;
