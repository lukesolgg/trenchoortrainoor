import { it } from "vitest";
import { Engine } from "./engine";
import { DEV_TUNING, type DevChoice } from "./dev";

// Override tuning from the environment, e.g. TUNE='{"buy":0.6}'.
if (process.env.TUNE) Object.assign(DEV_TUNING, JSON.parse(process.env.TUNE));

/**
 * Tuning harness for the dev demand model (run with HARNESS=1). Launches one coin per seed off the first Dev
 * mode tweet and prints the spread of outcomes for a few kinds of launch.
 */
type Kind = "right-fast" | "right-late" | "wrong-image" | "wrong-config" | "wrong-ticker" | "b0-quick-15" | "b0-clean-15" | "b0-full-15" | "b0-quick-35" | "b0-full-35";

function launch(seed: number, kind: Kind) {
  const e = new Engine({ seed, difficulty: "trencher", autoRounds: false, clock: () => 0, dev: { sol: 200 } });
  let id: string | undefined;
  for (let t = 0; !id && t < 20000; t += 100) {
    e.advanceTo(t);
    id = e.getSnapshot().feed.find((f) => f.scenarioId)?.scenarioId;
  }
  const sc = (e as unknown as { scenarios: Map<string, { tweetAt: number; options: { rightName: number; rightImage: number; names: unknown[]; images: unknown[] }; plan: { rightConfig: DevChoice & { launchpad: "pump" } } }> }).scenarios.get(id!)!;
  const delay = kind === "right-late" ? 20000 : 2500;
  e.advanceTo(sc.tweetAt + delay);
  const wrongName = (sc.options.rightName + 1) % sc.options.names.length;
  const wrongImage = (sc.options.rightImage + 1) % sc.options.images.length;
  const choice: DevChoice = {
    nameIdx: kind === "wrong-ticker" ? wrongName : sc.options.rightName,
    imageIdx: kind === "wrong-image" ? wrongImage : sc.options.rightImage,
    launchpad: "pump",
    dividends: true,
    pair: kind === "wrong-config" ? (sc.plan.rightConfig.pair === "SOL" ? "PUMP" : "SOL") : sc.plan.rightConfig.pair,
    mode: "organic",
    devBuySol: 1,
    organicSol: 1,
    rewards: "creator",
  };
  if (kind.startsWith("b0-")) {
    const [, build, pct] = kind.split("-");
    choice.mode = "block0";
    choice.organicSol = 0;
    choice.bundle = { supplyPct: Number(pct), wallets: 20, build: build as "quick", mev: 0.5 };
  }
  const r = e.devDeploy(id!, choice);
  if (!r.ok) throw new Error(r.reason);
  for (let t = e.now(); t < sc.tweetAt + 6 * 60_000; t += 500) e.advanceTo(t);
  const l = e.getSnapshot().launches[0];
  return { bonded: l.bonded, peak: l.peakMcUsd, rewards: l.rewardsSol, flagged: !!l.bundle.flagged };
}

const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}K`);

it.skipIf(!process.env.HARNESS)(
  "dev launch outcome spread",
  () => {
    const N = Number(process.env.N ?? 60);
    const kinds = (process.env.KINDS?.split(",") ?? ["right-fast", "right-late", "wrong-image", "wrong-config", "wrong-ticker", "b0-quick-15", "b0-clean-15", "b0-full-15", "b0-quick-35", "b0-full-35"]) as Kind[];
    for (const kind of kinds) {
      const rs = Array.from({ length: N }, (_, i) => launch(i + 1, kind));
      const peaks = rs.map((r) => r.peak);
      console.log(
        `${kind.padEnd(13)} bonded ${Math.round((rs.filter((r) => r.bonded).length / N) * 100)}% · peak p25 ${k(q(peaks, 0.25))} p50 ${k(q(peaks, 0.5))} p75 ${k(q(peaks, 0.75))} p95 ${k(q(peaks, 0.95))} max ${k(Math.max(...peaks))} · rewards p50 ${q(rs.map((r) => r.rewards), 0.5).toFixed(3)} · flagged ${Math.round((rs.filter((r) => r.flagged).length / N) * 100)}% (p50 ${k(q(rs.filter((r) => r.flagged).map((r) => r.peak), 0.5) ?? 0)} vs ${k(q(rs.filter((r) => !r.flagged).map((r) => r.peak), 0.5) ?? 0)})`,
      );
    }
  },
  600_000,
);
