import { it } from "vitest";

/** Exit harness (HARNESS=1): a right launch with a 15% Clean bundle runs to $150K+, then you nuke or sell 12% of every wallet every 3 s. */
import { Engine } from "./engine";
// Launch right + 15% clean bundle, wait for a run, then sell 10% of every wallet every 3 s (gradual) or nuke.
function run(seed: number, gradual: boolean) {
  const e = new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, dev: { sol: 200 } });
  let id: string | undefined;
  for (let t = 0; !id && t < 20000; t += 100) { e.advanceTo(t); id = e.getSnapshot().feed.find((f) => f.scenarioId)?.scenarioId; }
  const sc = (e as any).scenarios.get(id!);
  e.advanceTo(sc.tweetAt + 2500);
  const r = e.devDeploy(id!, { nameIdx: sc.options.rightName, imageIdx: sc.options.rightImage, launchpad: "pump", dividends: true, pair: sc.plan.rightConfig.pair, mode: "block0", devBuySol: 1, organicSol: 0, rewards: "creator", bundle: { supplyPct: 15, wallets: 20, build: "clean", mev: 0.5 } });
  const cid = r.coinId!;
  const l0 = () => e.getSnapshot().launches[0];
  const t0 = e.now();
  let t = t0;
  while (t < t0 + 240_000 && l0().mcUsd < 150_000) { t += 500; e.advanceTo(t); }
  const at = l0().mcUsd, holders = e.getCoinView(cid)!.holders, held = l0().totalPct;
  if (!(at >= 100_000)) return null;
  const refs = [{ g: "deployer" }, ...l0().launchWalletPcts.map((_, i) => ({ g: "launch", i }))] as any;
  if (gradual) {
    for (let k = 0; k < 30; k++) { t += 3000; e.advanceTo(t); while (e.now() < (e.getCoinView(cid)!.migratingUntil ?? 0)) { t += 250; e.advanceTo(t); } e.walletsSell(cid, refs, 0.12); }
  } else {
    while (e.now() < (e.getCoinView(cid)!.migratingUntil ?? 0)) { t += 250; e.advanceTo(t); }
    e.nuke(cid);
  }
  const end = l0().mcUsd;
  t += 30_000; e.advanceTo(t);
  return `${gradual ? "gradual" : "nuke   "} seed ${seed}: at ${Math.round(at/1000)}K holders ${holders} held ${held.toFixed(1)}% → ${Math.round(end/100)/10}K (30s later ${Math.round(l0().mcUsd/100)/10}K) pnl ${l0().pnlSol.toFixed(1)}`;
}
it.skipIf(!process.env.HARNESS)("dev exit: nuke vs gradual", () => {
  for (const g of [false, true]) for (let s = 1; s <= 25; s++) { const x = run(s, g); if (x) console.log(x); }
}, 300000);

/**
 * Kimchi-style run (HARNESS=1): right and fast, a 70% Full bundle over 30 wallets, Defend with a 150 SOL budget
 * for 6 minutes, then Make market for 4, then Distribute at 5%/min until the bag is gone (25 min cap).
 */
function kimchi(seed: number) {
  const e = new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, dev: { sol: 1000 } });
  let id: string | undefined;
  for (let t = 0; !id && t < 20000; t += 100) { e.advanceTo(t); id = e.getSnapshot().feed.find((f) => f.scenarioId)?.scenarioId; }
  const sc = (e as any).scenarios.get(id!);
  e.advanceTo(sc.tweetAt + 2500);
  const r = e.devDeploy(id!, { nameIdx: sc.options.rightName, imageIdx: sc.options.rightImage, launchpad: "pump", dividends: true, pair: sc.plan.rightConfig.pair, mode: "block0", devBuySol: 1, organicSol: 0, rewards: "creator", bundle: { supplyPct: 70, wallets: 30, build: "full", mev: 0.5 } });
  const cid = r.coinId!;
  const l0 = () => e.getSnapshot().launches[0];
  const t0 = e.now();
  let t = t0;
  const run = (ms: number) => { const end = t + ms; while (t < end) { t += 1000; e.advanceTo(t); } };
  e.startMarketMaker(cid, { strategy: "defend", band: 0.1, budgetSol: 150, pace: 2 });
  run(6 * 60_000);
  e.startMarketMaker(cid, { strategy: "make", band: 0.1, budgetSol: 50, pace: 2 });
  run(4 * 60_000);
  e.startMarketMaker(cid, { strategy: "distribute", band: 0.1, budgetSol: 20, pace: 5 });
  while (t < t0 + 25 * 60_000 && l0().holdersPct > 0.5) run(10_000);
  const l = l0();
  return { peak: l.peakMcUsd, spent: l.spentSol, got: l.gotSol, pnl: l.pnlSol, left: l.holdersPct, flagged: !!l.bundle.flagged, now: l.mcUsd };
}
it.skipIf(!process.env.HARNESS)("dev exit: kimchi-style bundle + market making", () => {
  const N = Number(process.env.N ?? 20);
  const rs = Array.from({ length: N }, (_, i) => kimchi(i + 1));
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}K`);
  for (const x of rs) console.log(`peak ${k(x.peak)} in ${x.spent.toFixed(0)} out ${x.got.toFixed(0)} pnl ${x.pnl.toFixed(0)} left ${x.left.toFixed(1)}% flagged ${x.flagged} end ${k(x.now)}`);
  console.log(`kimchi: peak p50 ${k(q(rs.map((r) => r.peak), 0.5))} p90 ${k(q(rs.map((r) => r.peak), 0.9))} · pnl p50 ${q(rs.map((r) => r.pnl), 0.5).toFixed(0)} p90 ${q(rs.map((r) => r.pnl), 0.9).toFixed(0)} · flagged ${rs.filter((r) => r.flagged).length}/${N}`);
}, 600_000);
