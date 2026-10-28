"use client";

import type { LaunchView } from "@/engine/types";
import { sol } from "../format";
import { LaunchCheckTip } from "./LaunchCheckTip";
import { SolIcon } from "../icons";

const Stat = ({ k, v, sub, tone, warn }: { k: string; v: string; sub: string; tone?: string; warn?: boolean }) => (
  <div className={`rounded-md border px-2 py-1.5 ${warn ? "border-amber/60" : "border-line"}`}>
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`text-[13px] font-black ${tone ?? (warn ? "text-amber" : "")}`}>{v}</div>
    <div className="text-[9.5px] text-dim">{sub}</div>
  </div>
);

interface Props {
  l: LaunchView;
  now: number;
  onNuke: () => void;
  onClaim: () => void;
  onReport: () => void;
}

/** Your launch at a glance: what you hold, realised PnL, the "something's off" warning, fees and Nuke. Trading lives in the wallet panel. */
export function DevOps({ l, now, onNuke, onClaim, onReport }: Props) {
  const totalPct = l.totalPct;
  const off = !Object.values(l.check).every(Boolean);
  const quiet = off && !l.bonded && now - l.launchedAt > 15_000;
  return (
    <div className="border-b border-line bg-violet/[0.04] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">
          Your launch <span className="ml-1 rounded bg-violet/20 px-1.5 py-px text-[10px] font-black text-violet">DEV</span>
        </h3>
        <LaunchCheckTip l={l} align="right">
          <button type="button" onClick={onReport} className="text-[11px] font-semibold text-dim hover:text-ink">
            <span className={off ? "text-down" : "text-up"}>{off ? `✗ ${Object.values(l.check).filter((x) => !x).length} wrong` : "✓ all right"}</span> · Launch report →
          </button>
        </LaunchCheckTip>
      </div>
      {quiet && (
        <LaunchCheckTip l={l}>
          <div className="mb-2 cursor-help rounded-md border border-amber/50 bg-amber/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber">
            Buyers aren&apos;t biting. Something about this launch is off. <span className="font-bold underline decoration-dotted">Hover to see what.</span>
          </div>
        </LaunchCheckTip>
      )}
      <div className="tabular mb-2 grid grid-cols-3 gap-1.5 text-[11px]">
        <Stat k="You hold" v={`${l.totalPct.toFixed(2)}%`} sub={`≈ ${sol(l.holdingsSol)} SOL`} warn={l.totalPct >= 20} />
        <Stat k="Deployer" v={`${l.deployerPct.toFixed(2)}%`} sub="public" />
        <Stat k="Realised" v={`${l.pnlSol >= 0 ? "+" : ""}${sol(l.pnlSol)}`} sub="SOL" tone={l.pnlSol >= 0 ? "text-up" : "text-down"} />
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
