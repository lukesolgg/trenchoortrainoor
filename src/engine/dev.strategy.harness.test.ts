import { it } from "vitest";
import { Engine } from "./engine";
import type { StrategyStyle } from "./dev";

/**
 * Strategy harness (HARNESS=1): a right, fast launch per seed run by a strategy with auto take-profit, for 25 minutes.
 * Prints how often each style reaches each target, what it spends, and what comes back.
 */
function run(seed: number, style: StrategyStyle, targetUsd: number) {
  const e = new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, dev: { sol: 5000 } });
  let id: string | undefined;
  for (let t = 0; !id && t < 20000; t += 100) {
    e.advanceTo(t);
    id = e.getSnapshot().feed.find((f) => f.scenarioId)?.scenarioId;
  }
  const sc = (e as any).scenarios.get(id!);
  e.advanceTo(sc.tweetAt + Number(process.env.DELAY_MS ?? 2500));
  const q = e.quoteStrategy({ targetUsd, style, exit: "auto" });
  const r = e.devDeploy(id!, { nameIdx: sc.options.rightName, imageIdx: sc.options.rightImage, launchpad: "pump", dividends: false, pair: sc.plan.rightConfig.pair, mode: "manual", devBuySol: 0, organicSol: 0, rewards: "creator", strategy: { targetUsd, style, exit: "auto" } });
  if (!r.ok) throw new Error(r.reason);
  const t0 = e.now();
  let reachedAt: number | null = null;
  let stalledAt: number | null = null;
  let bailed = false;
  for (let t = t0; t < t0 + 25 * 60_000; t += 2000) {
    e.advanceTo(t);
    const l = e.getSnapshot().launches[0];
    if (reachedAt === null && l.peakMcUsd >= targetUsd) reachedAt = (t - t0) / 60_000;
    if (l.strategy?.phase === "stalled" && stalledAt === null) stalledAt = t;
    // A sensible player: a minute after the push stalls (or 12 minutes in without the target), take profit.
    if (!bailed && l.strategy && (l.strategy.phase === "stalled" || l.strategy.phase === "push") && ((stalledAt !== null && t - stalledAt > 60_000) || t - t0 > 12 * 60_000)) {
      bailed = true;
      e.takeProfit(l.coinId);
    }
    if (l.strategy?.phase === "done") break;
  }
  const l = e.getSnapshot().launches[0];
  return { q, reached: reachedAt !== null, reachedAt, spent: l.spentSol, got: l.gotSol + l.rewardsSol, peak: l.peakMcUsd, left: l.totalPct, flagged: !!l.bundle.flagged };
}

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`);
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

it.skipIf(!process.env.HARNESS)("dev strategies: reach rate, spend and return", () => {
  const N = Number(process.env.N ?? 12);
  const styles = (process.env.STYLES?.split(",") ?? ["organic", "balanced", "aggressive"]) as StrategyStyle[];
  const targets = (process.env.TARGETS?.split(",").map(Number) ?? [100e3, 500e3, 1e6, 3e6]);
  for (const style of styles)
    for (const target of targets) {
      const rs = Array.from({ length: N }, (_, i) => run(i + 1, style, target));
      const q = rs[0].q;
      console.log(
        `${style.padEnd(10)} ${k(target).padStart(5)} · quote ${q.totalSol.toFixed(0)} SOL (push ${q.pushSol.toFixed(0)}), bag ${q.targetPct.toFixed(0)}%, dump ${q.dumpSolAtTarget.toFixed(0)} · reached ${rs.filter((r) => r.reached).length}/${N} (med ${med(rs.filter((r) => r.reachedAt !== null).map((r) => r.reachedAt!)).toFixed(1)} min) · spent med ${med(rs.map((r) => r.spent)).toFixed(0)} · got med ${med(rs.map((r) => r.got)).toFixed(0)} · pnl med ${med(rs.map((r) => r.got - r.spent)).toFixed(0)} · peak med ${k(med(rs.map((r) => r.peak)))} · left med ${med(rs.map((r) => r.left)).toFixed(1)}% · flagged ${rs.filter((r) => r.flagged).length}`,
      );
    }
}, 900_000);
