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

const BUBBLE = {
  "Likely clean": "border-line text-dim",
  Uncertain: "border-amber/50 bg-amber/[0.06] text-amber",
  Clustered: "border-down/50 bg-down/[0.06] text-down",
} as const;

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
      {l.bundle.flagged ? (
        <div className="mb-2 rounded-md border border-down/60 bg-down/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-down">
          <span className="font-black">BUNDLED {l.bundle.flagged.pct.toFixed(0)}%</span> · called out {Math.max(0, Math.round((l.bundle.flagged.at - l.launchedAt) / 1000))} s in. Buyers
          thin out and KOLs won&apos;t touch it.
        </div>
      ) : l.bundle.clusterPct >= 6 && l.bundle.hiddenForMs > 0 ? (
        <div className="tabular mb-2 flex items-center justify-between rounded-md border border-up/40 bg-up/[0.05] px-2.5 py-1.5 text-[11.5px] text-up">
          <span className="whitespace-nowrap">
            Hidden · <span className="font-bold">{Math.floor(l.bundle.hiddenForMs / 60000)}:{String(Math.floor((l.bundle.hiddenForMs % 60000) / 1000)).padStart(2, "0")}</span>
          </span>
          <span className="whitespace-nowrap text-dim">
            {l.bundle.clusterPct.toFixed(1)}% linked · then {Math.round(l.bundle.risk * 100)}%/check
          </span>
        </div>
      ) : l.bundle.clusterPct >= 6 ? (
        <div className={`tabular mb-2 flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11.5px] ${BUBBLE[l.bundle.read]}`}>
          <span>
            Bubble map: <span className="font-bold">{l.bundle.read}</span> · {l.bundle.clusterPct.toFixed(1)}% linked
          </span>
          <span className="text-dim">
            {Math.round(l.bundle.risk * 100)}%/check · next {Math.ceil(l.bundle.nextCheckInMs / 1000)}s
          </span>
        </div>
      ) : null}
      <div className="tabular mb-2 grid grid-cols-3 gap-1.5 text-[11px]">
        <Stat k="You hold" v={`${l.totalPct.toFixed(2)}%`} sub={`≈ ${sol(l.holdingsSol)} SOL`} warn={l.totalPct >= 20} />
        <Stat k="Deployer" v={`${l.deployerPct.toFixed(2)}%`} sub={l.snipers.count ? `public · ${l.snipers.count} sniper${l.snipers.count === 1 ? "" : "s"} ${l.snipers.pct.toFixed(1)}%` : "public"} />
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
