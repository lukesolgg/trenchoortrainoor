"use client";

import type { LaunchView } from "@/engine/types";
import { sol } from "../format";
import { SolIcon } from "../icons";

const STEPS: (number | "max")[] = [0.1, 1, 3, "max"];

interface Props {
  l: LaunchView;
  now: number;
  devSol: number;
  onSell: (from: "deployer" | "holders", pct: number | "max") => void;
  onDevBuy: (sol: number) => void;
  onNuke: () => void;
  onClaim: () => void;
  onReport: () => void;
}

/** Your launch, Proxima-style: what each of your wallets holds, sell by % of supply, buy more, Nuke, fees. */
export function DevOps({ l, now, devSol, onSell, onDevBuy, onNuke, onClaim, onReport }: Props) {
  const totalPct = l.deployerPct + l.holdersPct;
  const solFor = (pct: number) => (totalPct > 0 ? (l.holdingsSol * pct) / totalPct : 0);
  const off = !Object.values(l.check).every(Boolean);
  const quiet = off && !l.bonded && now - l.launchedAt > 15_000;
  const row = (label: string, from: "deployer" | "holders", pct: number) => (
    <div className="rounded-lg border border-line px-2.5 py-2">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="font-bold">{label}</span>
        <span className="tabular text-dim">
          ≈ <SolIcon /> {sol(solFor(pct))} · <span className="font-bold text-ink">{pct.toFixed(2)}%</span>
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        {STEPS.map((s) => (
          <button
            key={String(s)}
            type="button"
            disabled={pct <= 0.0001}
            onClick={() => onSell(from, s)}
            className="rounded-md border border-down/40 py-1 text-[11.5px] font-bold text-down transition-colors enabled:hover:bg-down/10 disabled:opacity-35"
          >
            {s === "max" ? "MAX" : `${s}%`}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="border-b border-line bg-violet/[0.04] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">
          Your launch <span className="ml-1 rounded bg-violet/20 px-1.5 py-px text-[10px] font-black text-violet">DEV</span>
        </h3>
        <button type="button" onClick={onReport} className="text-[11px] font-semibold text-dim hover:text-ink">
          Launch report →
        </button>
      </div>
      {quiet && (
        <div className="mb-2 rounded-md border border-amber/50 bg-amber/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber">
          Buyers aren&apos;t biting. Something about this launch is off: check the Tracker.
        </div>
      )}
      <div className="space-y-1.5">
        {row("Deployer", "deployer", l.deployerPct)}
        {l.holdersPct > 0.0001 && row("Your other wallets", "holders", l.holdersPct)}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-faint">Dev buy</span>
        {[0.5, 1, 5].map((v) => (
          <button
            key={v}
            type="button"
            disabled={v > devSol || l.ended}
            onClick={() => onDevBuy(v)}
            className="rounded-md border border-up/40 px-2 py-0.5 text-[11.5px] font-bold text-up transition-colors enabled:hover:bg-up/10 disabled:opacity-35"
          >
            {v}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-faint">
          wallet <SolIcon /> {sol(devSol)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {l.rewardsMode === "creator" ? (
          <button
            type="button"
            disabled={l.rewardsSol <= 0}
            onClick={onClaim}
            className="flex items-center justify-between rounded-md border border-amber/50 bg-amber/10 px-2.5 py-1.5 text-[12px] font-bold text-amber transition-colors enabled:hover:bg-amber/20 disabled:opacity-40"
          >
            <span>Claim fees</span>
            <span className="tabular">{sol(l.rewardsSol, 3)}</span>
          </button>
        ) : (
          <div className="rounded-md border border-line px-2.5 py-1.5 text-[11.5px] text-dim">Cashback to holders is on</div>
        )}
        <button
          type="button"
          disabled={totalPct <= 0.0001}
          onClick={onNuke}
          className="rounded-md border border-down/60 bg-down/10 px-2.5 py-1.5 text-[12px] font-black text-down transition-colors enabled:hover:bg-down/20 disabled:opacity-40"
        >
          ☢ Nuke · sell everything
        </button>
      </div>
    </div>
  );
}
