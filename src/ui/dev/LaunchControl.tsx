"use client";

import type { ReactNode } from "react";
import { STRATEGY_STYLES, STRATEGY_TARGETS } from "@/engine/dev";
import type { Engine } from "@/engine/engine";
import type { LaunchView } from "@/engine/types";
import { sol, usd } from "../format";
import { SolIcon } from "../icons";
import { LaunchCheckTip } from "./LaunchCheckTip";

interface Props {
  engine: Engine;
  l: LaunchView;
  now: number;
  holders: number;
  balance: number;
  notify: (text: string) => void;
  onReport: () => void;
  /** Below the controls: promotion. */
  children?: ReactNode;
}

const PHASE: Record<NonNullable<LaunchView["strategy"]>["phase"], { label: string; tone: string }> = {
  push: { label: "Pushing", tone: "bg-violet/20 text-violet" },
  hold: { label: "Holding", tone: "bg-up/15 text-up" },
  profit: { label: "Taking profit", tone: "bg-amber/15 text-amber" },
  stalled: { label: "Stalled", tone: "bg-down/15 text-down" },
  done: { label: "Done", tone: "bg-line text-dim" },
};
const SELL = [0.25, 0.5, 1];
const BUY = [0.5, 1, 5];
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/**
 * Your launch, run by its strategy: progress to the target, what it has spent, and the few controls that matter
 * (change target, pause the push, take profit, sell or add to the dev bag, claim fees, Nuke). The bundle and bots run
 * underneath; you never touch them directly.
 */
export function LaunchControl({ engine, l, now, holders, balance, notify, onReport, children }: Props) {
  const g = l.strategy;
  const id = l.coinId;
  const off = !Object.values(l.check).every(Boolean);
  const progress = g ? Math.min(1, Math.log(Math.max(1, l.mcUsd) / 4000) / Math.log(g.targetUsd / 4000)) : 0;
  const live = !l.ended && (!g || g.phase !== "done");
  const quiet = off && !l.bonded && now - l.launchedAt > 15_000;

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-line">
      <div className="border-b border-line bg-violet/[0.04] p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[13px] font-bold">
            Your launch <span className="ml-1 rounded bg-violet/20 px-1.5 py-px text-[10px] font-black text-violet">DEV</span>
          </h3>
          <LaunchCheckTip l={l} align="right">
            <button type="button" onClick={onReport} className="text-[11px] font-semibold text-dim hover:text-ink">
              <span className={off ? "text-down" : "text-up"}>{off ? `✗ ${Object.values(l.check).filter((x) => !x).length} wrong` : "✓ all right"}</span> · Report →
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

        {/* Strategy */}
        {g && (
          <div className="rounded-lg border border-line bg-card p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-extrabold">
                {STRATEGY_STYLES[g.style].label} → {usd(g.targetUsd)}
              </span>
              <span className={`rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide ${PHASE[g.phase].tone}`}>
                {g.paused && g.phase === "push" ? "Paused" : PHASE[g.phase].label}
              </span>
            </div>
            <div className="tabular mt-2 flex items-baseline justify-between text-[11px]">
              <span className="text-[15px] font-black">{usd(l.mcUsd)}</span>
              <span className="text-dim">
                peak {usd(l.peakMcUsd)} · target {usd(g.targetUsd)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
              <div className={`h-full rounded-full ${l.peakMcUsd >= g.targetUsd ? "bg-up" : "bg-violet"}`} style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <div className="tabular mt-1.5 flex justify-between text-[10.5px] text-dim">
              <span>
                Push {sol(g.pushSpentSol, 1)} / {sol(g.pushBudgetSol, 1)} SOL
              </span>
              <span>{g.phase === "push" && !g.paused ? `~${mmss(g.pushEndsInMs)} left` : g.exit === "auto" ? "Auto take-profit" : "Holds at target"}</span>
            </div>
            {g.msg && <p className="mt-1.5 text-[11px] leading-snug text-dim">{g.msg}</p>}

            {live && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {g.phase === "push" ? (
                    <button
                      type="button"
                      onClick={() => engine.setStrategyPaused(id, !g.paused)}
                      className="rounded-md border border-line-hi py-1.5 text-[11.5px] font-bold text-dim hover:text-ink"
                    >
                      {g.paused ? "▶ Resume push" : "❚❚ Pause push"}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={g.phase === "profit" || l.totalPct <= 0.0001}
                    onClick={() => {
                      const r = engine.takeProfit(id);
                      notify(r.ok ? "Taking profit: selling the bag into strength" : (r.reason ?? "Couldn't start"));
                    }}
                    className="rounded-md border border-amber/60 bg-amber/10 py-1.5 text-[11.5px] font-black text-amber transition-colors enabled:hover:bg-amber/20 disabled:opacity-40"
                  >
                    $ Take profit
                  </button>
                </div>
                <div className="mt-2 text-[10.5px] font-semibold text-faint">Change target</div>
                <div className="mt-1 grid grid-cols-6 gap-1">
                  {STRATEGY_TARGETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (t === g.targetUsd) return;
                        const r = engine.setStrategyTarget(id, t);
                        notify(r.ok ? `Target now ${usd(t)}` : (r.reason ?? "Couldn't change it"));
                      }}
                      className={`tabular rounded border py-1 text-[10.5px] font-bold transition-colors ${
                        t === g.targetUsd ? "border-violet bg-violet/15 text-violet" : "border-line text-dim hover:border-line-hi hover:text-ink"
                      }`}
                    >
                      {tLabel(t)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Detection */}
        {l.bundle.flagged ? (
          <div className="mt-2 rounded-md border border-down/60 bg-down/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-down">
            <span className="font-black">BUNDLED {l.bundle.flagged.pct.toFixed(0)}%</span> · called out {Math.round((l.bundle.flagged.at - l.launchedAt) / 1000)} s in. Buyers thin
            out and KOLs won&apos;t touch it.
          </div>
        ) : l.bundle.clusterPct >= 6 && l.bundle.hiddenForMs > 0 ? (
          <div className="tabular mt-2 flex items-center justify-between whitespace-nowrap rounded-md border border-up/40 bg-up/[0.05] px-2.5 py-1.5 text-[11.5px] text-up">
            <span>
              Hidden from bubble maps · <span className="font-bold">{mmss(l.bundle.hiddenForMs)}</span>
            </span>
            <span className="text-dim">then {Math.round(l.bundle.risk * 100)}%/check</span>
          </div>
        ) : null}

        {/* Dev bag */}
        <div className="mt-2 rounded-lg border border-line p-2.5">
          <div className="tabular flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-faint">Dev bag</span>
            <span className="text-[12.5px] font-black">
              {l.totalPct.toFixed(2)}% <span className="text-[11px] font-semibold text-dim">≈ {sol(l.holdingsSol)} SOL</span>
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {SELL.map((f) => (
              <button
                key={f}
                type="button"
                disabled={l.totalPct <= 0.0001}
                onClick={() => {
                  const r = engine.sellDevBag(id, f);
                  notify(r.ok ? `Sold ${f * 100}% of the dev bag: +${sol(r.sol ?? 0)} SOL` : (r.reason ?? "Nothing to sell"));
                }}
                className="rounded-md border border-down/50 bg-down/10 py-1.5 text-[11.5px] font-black text-down transition-colors enabled:hover:bg-down/20 disabled:opacity-40"
              >
                Sell {f * 100}%
              </button>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {BUY.map((s) => (
              <button
                key={s}
                type="button"
                disabled={s > balance || !live}
                onClick={() => {
                  const r = engine.buyDevBag(id, s);
                  notify(r.ok ? `Added ${s} SOL to the dev bag` : (r.reason ?? "Buy failed"));
                }}
                className="tabular flex items-center justify-center gap-1 rounded-md border border-up/50 bg-up/10 py-1.5 text-[11.5px] font-black text-up transition-colors enabled:hover:bg-up/20 disabled:opacity-40"
              >
                Buy <SolIcon /> {s}
              </button>
            ))}
          </div>
        </div>

        {/* Numbers */}
        <div className="tabular mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
          <Stat k="Spent" v={sol(l.spentSol, 1)} sub="SOL in" />
          <Stat k="Realised" v={`${l.pnlSol >= 0 ? "+" : ""}${sol(l.pnlSol, 1)}`} sub="SOL" tone={l.pnlSol >= 0 ? "text-up" : "text-down"} />
          <Stat k="Holders" v={holders.toLocaleString("en-US")} sub={l.snipers.count ? `${l.snipers.count} snipers in` : "on chain"} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {l.rewardsMode === "creator" ? (
            <button
              type="button"
              disabled={l.rewardsSol <= 0}
              onClick={() => {
                const r = engine.claimRewards(id);
                if (r.ok) notify(`Claimed ${sol(r.sol ?? 0, 3)} SOL of creator fees`);
              }}
              className="flex items-center justify-between rounded-md border border-amber/50 bg-amber/10 px-2.5 py-1.5 text-[12px] font-bold text-amber transition-colors enabled:hover:bg-amber/20 disabled:opacity-40"
            >
              <span>Claim fees</span>
              <span className="tabular">{sol(l.rewardsSol, 3)}</span>
            </button>
          ) : (
            <div className="rounded-md border border-line px-2.5 py-1.5 text-[11.5px] text-dim">Cashback to holders</div>
          )}
          <button
            type="button"
            disabled={l.totalPct <= 0.0001}
            onClick={() => {
              const r = engine.nuke(id);
              notify(r.ok ? `☢ Nuked: ${sol(r.sol ?? 0)} SOL out` : (r.reason ?? "Nothing to sell"));
            }}
            className="rounded-md border border-down/60 bg-down/10 px-2.5 py-1.5 text-[12px] font-black text-down transition-colors enabled:hover:bg-down/20 disabled:opacity-40"
          >
            ☢ Nuke
          </button>
        </div>
      </div>
      {children}
    </aside>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-md border border-line px-2 py-1.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={`text-[13px] font-black ${tone ?? ""}`}>{v}</div>
      <div className="text-[9.5px] text-dim">{sub}</div>
    </div>
  );
}

/** Compact target label: $100K, $1M, $10M. */
const tLabel = (t: number) => (t >= 1e6 ? `$${t / 1e6}M` : `$${t / 1000}K`);
