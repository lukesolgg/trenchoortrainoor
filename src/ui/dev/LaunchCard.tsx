"use client";

import type { LaunchView } from "@/engine/types";
import { Art } from "../Art";
import { signed, sol, usd } from "../format";

const ROWS: { k: keyof LaunchView["check"]; label: string }[] = [
  { k: "name", label: "Name" },
  { k: "ticker", label: "Ticker" },
  { k: "image", label: "Picture" },
  { k: "launchpad", label: "Launchpad" },
  { k: "dividends", label: "Dividends" },
  { k: "pair", label: "Pair" },
];

/** How a launch went: outcome, money in and out, speed, and what the tweet called for against what you launched. */
export function LaunchCard({ l, onOpen, onClose }: { l: LaunchView; onOpen: () => void; onClose: () => void }) {
  const right = l.check.name && l.check.ticker;
  const head = l.bonded ? { t: "BONDED", c: "text-amber" } : l.ended ? { t: l.endReason === "closed" ? "CLOSED" : "DIED ON THE CURVE", c: "text-down" } : { t: "LIVE", c: "text-up" };
  const value = (k: keyof LaunchView["check"], which: "right" | "you") => {
    const src = which === "right" ? { ...l.right, ...l.right.config } : { name: l.name, ticker: l.ticker, ...l.config };
    switch (k) {
      case "name":
        return src.name;
      case "ticker":
        return `$${src.ticker}`;
      case "image":
        return which === "right" ? <Art art={l.right.art} className="h-7 w-7 rounded" glyphSize={14} /> : <Art art={l.art} className="h-7 w-7 rounded" glyphSize={14} />;
      case "launchpad":
        return src.launchpad === "pump" ? "Pump" : "Bonk";
      case "dividends":
        return src.dividends ? "On" : "Off";
      case "pair":
        return `/${src.pair}`;
    }
  };
  const verdict = !right
    ? "The name or ticker didn't match the tweet, so the narrative's buyers never came. That launch can't bond on its own."
    : !Object.values(l.check).every(Boolean)
      ? "Right coin, but something on it was off: buyers checked, and a lot of them passed."
      : l.first
        ? "Right coin, first out. From there it's down to the narrative and how you ran it."
        : "Right coin, but a rival's was out first and took most of the flow.";
  return (
    <div data-modal className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-line-hi bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="flex items-center gap-3">
            <Art art={l.art} className="h-14 w-14 rounded-xl border border-line-hi" glyphSize={26} />
            <div>
              <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${head.c}`}>{head.t}</p>
              <h2 className="text-[26px] font-black leading-tight">${l.ticker}</h2>
              <p className="text-[12px] text-dim">
                {l.name} · deployed {(l.deployMs / 1000).toFixed(1)} s after the tweet{right ? (l.first ? " · first right coin" : " · a rival was first") : ""}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-dim hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2.5 p-5 pb-3">
          <Stat k="Peak MC" v={usd(l.peakMcUsd)} />
          <Stat k="Realised PnL" v={`${signed(l.pnlSol)} SOL`} tone={l.pnlSol >= 0 ? "text-up" : "text-down"} sub={`in ${sol(l.spentSol)} · out ${sol(l.gotSol + l.claimedSol)}`} />
          <Stat k="Still holding" v={`${sol(l.holdingsSol)} SOL`} sub={`${(l.deployerPct + l.holdersPct).toFixed(2)}% of supply`} />
          <Stat k={l.rewardsMode === "creator" ? "Creator fees" : "Cashback"} v={l.rewardsMode === "creator" ? `${sol(l.rewardsSol + l.claimedSol, 3)} SOL` : "to holders"} sub={l.rewardsMode === "creator" ? `${sol(l.rewardsSol, 3)} unclaimed` : ""} />
        </div>

        <div className="px-5 pb-4">
          <p className="mb-2 text-[13px] leading-snug text-ink/90">{verdict}</p>
          <table className="w-full text-[12.5px]">
            <thead className="text-[10px] font-bold uppercase tracking-wider text-faint">
              <tr>
                <th className="py-1 text-left font-bold"></th>
                <th className="py-1 text-left font-bold">The tweet called for</th>
                <th className="py-1 text-left font-bold">You launched</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.k} className={`border-t border-line/60 ${l.check[r.k] ? "" : "bg-down/[0.07]"}`}>
                  <td className="py-1.5 pr-3 text-faint">{r.label}</td>
                  <td className="py-1.5 font-semibold">{value(r.k, "right")}</td>
                  <td className={`py-1.5 font-semibold ${l.check[r.k] ? "" : "text-down"}`}>{value(r.k, "you")}</td>
                  <td className={`py-1.5 text-right font-black ${l.check[r.k] ? "text-up" : "text-down"}`}>{l.check[r.k] ? "✓" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 border-t border-line bg-bg/60 px-5 py-3">
          <button type="button" onClick={onOpen} className="rounded-lg border border-line-hi px-4 py-2 text-[13px] font-semibold text-dim hover:text-ink">
            Open chart
          </button>
          <button type="button" onClick={onClose} autoFocus className="rounded-lg bg-violet px-5 py-2 text-[13px] font-extrabold text-white hover:brightness-110">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={`tabular mt-0.5 text-[16px] font-black ${tone ?? ""}`}>{v}</div>
      {sub && <div className="tabular text-[10.5px] text-dim">{sub}</div>}
    </div>
  );
}
