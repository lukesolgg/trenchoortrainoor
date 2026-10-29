import { it } from "vitest";
import { Engine } from "./engine";
import type { LaunchKind, RunConfig } from "./dev";

/**
 * Launch plan + run strategy harness (HARNESS=1): a right, fast launch per seed with a launch plan, then a run
 * strategy pushing to a target (taking profit there at 5%/min), for 25 minutes. A sensible player takes profit a
 * minute after the push stalls, or 12 minutes in. Prints how often each plan reaches each target, spend and return.
 */
const PLANS: Record<LaunchKind, number> = { organic: 1.5, balanced: 4, aggressive: 50 };

function go(seed: number, kind: LaunchKind, targetUsd: number) {
  const e = new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, dev: { sol: 5000 } });
  let id: string | undefined;
  for (let t = 0; !id && t < 20000; t += 100) {
    e.advanceTo(t);
    id = e.getSnapshot().feed.find((f) => f.scenarioId)?.scenarioId;
  }
  const sc = (e as any).scenarios.get(id!);
  e.advanceTo(sc.tweetAt + Number(process.env.DELAY_MS ?? 2500));
  const right = sc.options.names[sc.options.rightName];
  const r = e.devDeploy(id!, { name: right.name, ticker: right.ticker, nameIdx: 0, imageIdx: sc.options.rightImage, launchpad: "pump", dividends: false, pair: sc.plan.rightConfig.pair, mode: "manual", devBuySol: 1, organicSol: 0, rewards: "creator", launch: { kind, amount: PLANS[kind] } });
  if (!r.ok) throw new Error(r.reason);
  const coinId = r.coinId!;
  const t0 = e.now();
  e.advanceTo(t0 + 4000);
  while (e.now() < (e.getCoinView(coinId)!.migratingUntil ?? 0)) e.advanceTo(e.now() + 250);
  const cfg: RunConfig = { targetUsd, pushMinutes: Number(process.env.PUSH_MIN ?? 4), volumePerMin: 5000, volumeMinutes: 10, holders: 100, defendSol: 10, band: 0.1, exit: "auto", profitPace: 5 };
  const q = e.quoteRun(coinId, cfg);
  const started = e.startRun(coinId, cfg).ok;
  let reachedAt: number | null = null;
  let stalledAt: number | null = null;
  let bailed = false;
  for (let t = e.now(); t < t0 + 25 * 60_000; t += 2000) {
    e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    if (reachedAt === null && l.peakMcUsd >= targetUsd) reachedAt = (t - t0) / 60_000;
    if (l.strategy?.phase === "stalled" && stalledAt === null) stalledAt = t;
    if (!bailed && l.strategy && (l.strategy.phase === "stalled" || l.strategy.phase === "push") && ((stalledAt !== null && t - stalledAt > 60_000) || t - t0 > 12 * 60_000)) {
      bailed = true;
      e.takeProfit(coinId, 5);
    }
    if (l.strategy?.phase === "done") break;
  }
  const l = e.getSnapshot().launches[0];
  return { q, started, reached: reachedAt !== null, reachedAt, spent: l.spentSol, got: l.gotSol + l.rewardsSol, peak: l.peakMcUsd, flagged: !!l.bundle.flagged, left: l.holdingsSol };
}

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

it.skipIf(!process.env.HARNESS)("launch plans + run strategy: reach rate, spend and return", () => {
  const N = Number(process.env.N ?? 8);
  const kinds = (process.env.KINDS?.split(",") ?? ["organic", "balanced", "aggressive"]) as LaunchKind[];
  const targets = process.env.TARGETS?.split(",").map(Number) ?? [250e3, 1e6, 3e6];
  for (const kind of kinds)
    for (const target of targets) {
      const rs = Array.from({ length: N }, (_, i) => go(i + 1, kind, target));
      console.log(
        `${kind.padEnd(10)} → ${k(target).padStart(5)} · run quote med ${med(rs.map((r) => r.q.totalSol)).toFixed(0)} SOL · reached ${rs.filter((r) => r.reached).length}/${N} · spent med ${med(rs.map((r) => r.spent)).toFixed(0)} · got med ${med(rs.map((r) => r.got)).toFixed(0)} · pnl med ${med(rs.map((r) => r.got - r.spent)).toFixed(0)} · peak med ${k(med(rs.map((r) => r.peak)))} · bag left med ${med(rs.map((r) => r.left)).toFixed(0)} SOL · flagged ${rs.filter((r) => r.flagged).length}`,
      );
    }
}, 900_000);
