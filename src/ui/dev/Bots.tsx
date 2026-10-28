"use client";

import type { Engine } from "@/engine/engine";
import { useState } from "react";
import { HOLDER_PACKAGES, MM_BANDS, MM_BUDGETS, MM_PACES, MM_STRATEGIES, TREND_TARGETS, VOLUME_PACKAGES, volumeCostSol, type MmStrategy } from "@/engine/dev";
import type { LaunchView } from "@/engine/types";
import { sol, usd } from "../format";

interface Props {
  engine: Engine;
  l: LaunchView;
  devSol: number;
  notify: (text: string) => void;
}

const btn = "tabular flex flex-col items-center rounded-md border py-1 leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-35";
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Bots for your launch, paid from the dev wallet: volume packages, a trend bot towards a target, holders. */
export function Bots({ engine, l, devSol, notify }: Props) {
  const id = l.coinId;
  const b = l.bots;
  const run = (r: { ok: boolean; reason?: string }, ok: string) => notify(r.ok ? ok : (r.reason ?? "Couldn't start it"));
  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">Bots</h3>
        <span className="text-[10.5px] text-faint">Paid from your balance</span>
      </div>

      {/* Volume */}
      <div className="text-[11px] font-semibold text-faint">Volume · wash trades, keeps it trending</div>
      {b.volume ? (
        <Running
          label={`${b.volume.label} volume · ${Math.round(b.volume.done * 100)}% · ${mmss(b.volume.endsInMs)} left`}
          pct={b.volume.done}
          onStop={() => notify(`Volume bot stopped: ${sol(engine.stopVolumeBot(id))} SOL back`)}
        />
      ) : (
        <div className="mt-1 grid grid-cols-3 gap-1">
          {VOLUME_PACKAGES.map((p) => {
            const cost = volumeCostSol(p.usd);
            return (
              <button
                key={p.id}
                type="button"
                disabled={cost > devSol}
                onClick={() => run(engine.startVolumeBot(id, p.id), `Volume bot on: $${p.usd / 1000}K over ${p.minutes} min`)}
                className={`${btn} border-blue/40 text-blue enabled:hover:bg-blue/10`}
              >
                <span className="text-[11.5px] font-extrabold">
                  ${p.usd / 1000}K · {p.minutes}m
                </span>
                <span className="text-[9.5px] text-dim">{sol(cost)} SOL</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Trend */}
      <div className="mt-2.5 text-[11px] font-semibold text-faint">Trend · buys into its own wallets up to a target</div>
      {b.trend ? (
        <Running
          label={`→ ${usd(b.trend.targetUsd)} · ${sol(b.trend.spentSol)} / ${sol(b.trend.budgetSol)} SOL`}
          pct={Math.min(1, b.trend.spentSol / b.trend.budgetSol)}
          onStop={() => {
            engine.stopTrendBot(id);
            notify("Trend bot stopped");
          }}
        />
      ) : (
        <div className="mt-1 grid grid-cols-4 gap-1">
          {TREND_TARGETS.map((t) => {
            const q = engine.quoteTrend(id, t.id);
            const past = !q || q.sol <= 0;
            return (
              <button
                key={t.id}
                type="button"
                disabled={past || q!.sol > devSol}
                title={q ? `To ${usd(q.targetUsd)} MC: about ${sol(q.sol)} SOL (an estimate: sellers push back)` : ""}
                onClick={() => run(engine.startTrendBot(id, t.id), `Trend bot on: pushing to ${usd(q!.targetUsd)}`)}
                className={`${btn} border-up/40 text-up enabled:hover:bg-up/10`}
              >
                <span className="text-[11.5px] font-extrabold">{t.label}</span>
                <span className="text-[9.5px] text-dim">{past ? "past it" : `~${sol(q!.sol, q!.sol < 10 ? 2 : 0)}`}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Holders */}
      <div className="mt-2.5 text-[11px] font-semibold text-faint">
        Holders · each buys ~0.03% of supply{b.botHolders > 0 && <span className="text-dim"> · {b.botHolders} holding</span>}
      </div>
      {b.holders ? (
        <Running label={`${b.holders.added} / ${b.holders.total} holders`} pct={b.holders.added / b.holders.total} />
      ) : (
        <div className="mt-1 grid grid-cols-4 gap-1">
          {HOLDER_PACKAGES.map((n) => {
            const est = engine.quoteHolders(id, n);
            return (
            <button
              key={n}
              type="button"
              disabled={est > devSol}
              onClick={() => run(engine.startHolderBot(id, n), `Holder bot on: ${n} holders`)}
              className={`${btn} border-violet/40 text-violet enabled:hover:bg-violet/10`}
            >
              <span className="text-[11.5px] font-extrabold">{n}</span>
              <span className="text-[9.5px] text-dim">~{sol(est)}</span>
            </button>
            );
          })}
        </div>
      )}
      <MarketMaker engine={engine} l={l} devSol={devSol} notify={notify} />

      {b.lastBot && <p className="mt-2 text-[11px] text-dim">{b.lastBot}</p>}
    </div>
  );
}

const chipCls = (on: boolean) =>
  `tabular rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${on ? "border-amber/70 bg-amber/10 text-amber" : "border-line text-dim hover:border-line-hi hover:text-ink"}`;

/**
 * Market maker: trades your launch wallets around a moving average. Pick a strategy, a band and a buy budget
 * (Distribute: a pace). Starting again while it runs swaps the settings and keeps the totals.
 */
function MarketMaker({ engine, l, devSol, notify }: Props) {
  const m = l.mm;
  const [strategy, setStrategy] = useState<MmStrategy>(m?.strategy ?? "defend");
  const [band, setBand] = useState<number>(m?.band ?? 0.1);
  const [budget, setBudget] = useState<number>(10);
  const [pace, setPace] = useState<number>(m?.pace ?? 2);
  const start = () => {
    const r = engine.startMarketMaker(l.coinId, { strategy, band, budgetSol: budget, pace });
    notify(r.ok ? `Market maker ${m ? "updated" : "on"}: ${MM_STRATEGIES[strategy].label}` : (r.reason ?? "Couldn't start it"));
  };
  return (
    <div className="mt-2.5 rounded-md border border-line p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold text-faint">Market maker · trades your launch wallets</span>
        {m && (
          <button
            type="button"
            onClick={() => engine.stopMarketMaker(l.coinId)}
            className="rounded border border-down/50 px-1.5 text-[10.5px] font-bold text-down hover:bg-down/10"
          >
            Stop
          </button>
        )}
      </div>
      {m && (
        <div className="tabular mt-1.5 grid grid-cols-3 gap-1 text-center text-[10.5px]">
          <div className="rounded border border-line py-1">
            <div className="text-faint">Bought</div>
            <div className="font-bold">{sol(m.spentSol)} / {sol(m.budgetSol)}</div>
          </div>
          <div className="rounded border border-line py-1">
            <div className="text-faint">Sold</div>
            <div className="font-bold text-up">{sol(m.gotSol)}</div>
          </div>
          <div className="rounded border border-line py-1">
            <div className="text-faint">Bag out</div>
            <div className="font-bold">{Math.round(m.soldPct * 100)}%</div>
          </div>
        </div>
      )}
      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {(Object.keys(MM_STRATEGIES) as MmStrategy[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStrategy(k)}
            className={`rounded-md border px-1.5 py-1 text-left transition-colors ${
              strategy === k ? "border-violet bg-violet/15" : "border-line hover:border-line-hi"
            } ${m?.strategy === k ? "ring-1 ring-up/60" : ""}`}
          >
            <div className="text-[11.5px] font-extrabold">{MM_STRATEGIES[k].label}</div>
            <div className="text-[9.5px] leading-tight text-dim">{MM_STRATEGIES[k].sub}</div>
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[10.5px]">
        <span className="font-semibold text-faint">Band</span>
        <div className="flex flex-wrap gap-1">
          {MM_BANDS.map((v) => (
            <button key={v} type="button" className={chipCls(band === v)} onClick={() => setBand(v)}>
              ±{v * 100}%
            </button>
          ))}
        </div>
        <span className="font-semibold text-faint">Budget</span>
        <div className="flex flex-wrap gap-1">
          {MM_BUDGETS.map((v) => (
            <button key={v} type="button" disabled={v > devSol} className={`${chipCls(budget === v)} disabled:opacity-35`} onClick={() => setBudget(v)}>
              {v}
            </button>
          ))}
        </div>
        {strategy === "distribute" && (
          <>
            <span className="font-semibold text-faint">Pace</span>
            <div className="flex flex-wrap gap-1">
              {MM_PACES.map((v) => (
                <button key={v} type="button" className={chipCls(pace === v)} onClick={() => setPace(v)}>
                  {v}% / min
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={start}
        className="mt-2 w-full rounded-md border border-violet/60 bg-violet/15 py-1.5 text-[12px] font-black text-violet transition-colors hover:bg-violet/25"
      >
        {m ? "Update market maker" : `Start ${MM_STRATEGIES[strategy].label}`}
      </button>
    </div>
  );
}

function Running({ label, pct, onStop }: { label: string; pct: number; onStop?: () => void }) {
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
      <span className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 rounded-full bg-up" style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
      <span className="tabular min-w-0 flex-1 truncate text-[11.5px] font-semibold">{label}</span>
      {onStop && (
        <button type="button" onClick={onStop} className="shrink-0 rounded border border-down/50 px-1.5 text-[10.5px] font-bold text-down hover:bg-down/10">
          Stop
        </button>
      )}
    </div>
  );
}
