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
