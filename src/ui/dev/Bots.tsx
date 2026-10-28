"use client";

import { useState, type ReactNode } from "react";
import {
  HOLDER_RANGE,
  MM_BANDS,
  MM_BUDGETS,
  MM_PACES,
  MM_STRATEGIES,
  TREND_MIN_RANGE,
  TREND_PRESETS_USD,
  TREND_USD_RANGE,
  VOLUME_MIN_RANGE,
  VOLUME_USD_RANGE,
  type MmStrategy,
} from "@/engine/dev";
import type { Engine } from "@/engine/engine";
import type { LaunchView } from "@/engine/types";
import { sol, usd } from "../format";

interface Props {
  engine: Engine;
  l: LaunchView;
  devSol: number;
  notify: (text: string) => void;
}

type Tab = "volume" | "trend" | "holders" | "mm";
const TABS: { id: Tab; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "trend", label: "Trend" },
  { id: "holders", label: "Holders" },
  { id: "mm", label: "Market maker" },
];

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const mins = (m: number) => (m < 1 ? `${Math.round(m * 60)}s` : `${+m.toFixed(1)} min`);

/**
 * Bots for your launch, as one menu: Volume, Trend, Holders and Market maker tabs, each set with sliders and a live
 * cost before you start it. A dot on a tab means that bot is running.
 */
export function Bots({ engine, l, devSol, notify }: Props) {
  const [tab, setTab] = useState<Tab>("volume");
  const b = l.bots;
  const on: Record<Tab, boolean> = { volume: !!b.volume, trend: !!b.trend, holders: !!b.holders, mm: !!l.mm };
  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">Bots</h3>
        <span className="text-[10.5px] text-faint">Paid from your balance</span>
      </div>
      <div className="grid grid-cols-4 gap-0.5 rounded-lg border border-line bg-black/20 p-0.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`relative rounded-md py-1.5 text-[11px] font-bold transition-colors ${tab === t.id ? "bg-violet/20 text-ink" : "text-dim hover:text-ink"}`}
          >
            {t.label}
            {on[t.id] && <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-up" />}
          </button>
        ))}
      </div>
      <div className="pt-2.5">
        {tab === "volume" && <VolumeTab engine={engine} l={l} devSol={devSol} notify={notify} />}
        {tab === "trend" && <TrendTab engine={engine} l={l} devSol={devSol} notify={notify} />}
        {tab === "holders" && <HoldersTab engine={engine} l={l} devSol={devSol} notify={notify} />}
        {tab === "mm" && <MarketMaker engine={engine} l={l} devSol={devSol} notify={notify} />}
      </div>
      {b.lastBot && <p className="mt-2 text-[11px] text-dim">{b.lastBot}</p>}
    </div>
  );
}

/** A slider over a log scale (for money and market caps) or a linear one. */
function Slider({
  label,
  value,
  min,
  max,
  log,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  log?: boolean;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const toPos = (v: number) => (log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const v = log ? Math.exp(Math.log(min) + p * (Math.log(max) - Math.log(min))) : min + p * (max - min);
    return roundNice(v, step);
  };
  return (
    <label className="block">
      <div className="mb-0.5 flex items-baseline justify-between text-[11px]">
        <span className="font-semibold text-faint">{label}</span>
        <span className="tabular font-extrabold text-ink">{format(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(Math.max(0, Math.min(1, toPos(value))) * 1000)}
        onChange={(e) => onChange(fromPos(Number(e.target.value) / 1000))}
        className="w-full accent-violet"
        aria-label={label}
      />
    </label>
  );
}

/** Round to a tidy figure: 2 significant digits, or to `step`. */
function roundNice(v: number, step?: number): number {
  if (step) return Math.round(v / step) * step;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

function Summary({ rows }: { rows: [string, ReactNode, string?][] }) {
  return (
    <div className="tabular mt-2 grid grid-cols-2 gap-y-1 rounded-md bg-black/20 px-2.5 py-2 text-[11.5px]">
      {rows.map(([k, v, tone]) => (
        <div key={k} className="contents">
          <span className="text-dim">{k}</span>
          <span className={`text-right font-bold ${tone ?? ""}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function StartBtn({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-2 w-full rounded-md border border-violet/60 bg-violet/15 py-1.5 text-[12px] font-black text-violet transition-colors enabled:hover:bg-violet/25 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function VolumeTab({ engine, l, devSol, notify }: Props) {
  const [vol, setVol] = useState(50_000);
  const [m, setM] = useState(10);
  const v = l.bots.volume;
  if (v)
    return (
      <Running
        label={`${v.label} volume · ${Math.round(v.done * 100)}% · ${mmss(v.endsInMs)} left`}
        pct={v.done}
        onStop={() => notify(`Volume bot stopped: ${sol(engine.stopVolumeBot(l.coinId))} SOL back`)}
      />
    );
  const q = engine.quoteVolume(l.coinId, vol, m);
  if (!q) return null;
  const lift = q.lift[0] >= 0.4 ? ["Top of trending", "text-up"] : q.lift[0] >= 0.25 ? ["Trending", "text-up"] : q.lift[0] >= 0.17 ? ["Noticed", "text-amber"] : ["Barely registers", "text-dim"];
  const thin = vol > q.capacityUsd;
  return (
    <div>
      <p className="mb-2 text-[11px] leading-snug text-dim">Wash trades from separate wallets: a buy, then the same tokens sold back. Keeps it on the trending lists.</p>
      <div className="space-y-1.5">
        <Slider label="Volume" value={vol} min={VOLUME_USD_RANGE[0]} max={VOLUME_USD_RANGE[1]} log format={usd} onChange={setVol} />
        <Slider label="Over" value={m} min={VOLUME_MIN_RANGE[0]} max={VOLUME_MIN_RANGE[1]} step={1} format={mins} onChange={setM} />
      </div>
      <Summary
        rows={[
          ["Rate", `${usd(vol / m)} / min`],
          ["Attention", lift[0], lift[1]],
          ["Cost (1.25%)", `${sol(q.costSol)} SOL`, q.costSol > devSol ? "text-down" : ""],
        ]}
      />
      {thin && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-amber">
          This coin can only take about {usd(q.capacityUsd)} in that time without the wash moving the chart. The rest comes back to you.
        </p>
      )}
      <StartBtn
        label={q.costSol > devSol ? "Not enough SOL" : `Start · ${usd(vol)} over ${mins(m)}`}
        disabled={q.costSol > devSol || l.ended}
        onClick={() => {
          const r = engine.startVolumeBot(l.coinId, { usd: vol, minutes: m });
          notify(r.ok ? `Volume bot on: ${usd(vol)} over ${mins(m)}` : (r.reason ?? "Couldn't start it"));
        }}
      />
    </div>
  );
}

function TrendTab({ engine, l, devSol, notify }: Props) {
  const lo = Math.max(TREND_USD_RANGE[0], l.mcUsd * 1.1);
  const [target, setTarget] = useState(() => Math.max(lo, 100_000));
  const [m, setM] = useState(2);
  const t = l.bots.trend;
  if (t)
    return (
      <Running
        label={`→ ${usd(t.targetUsd)} · ${sol(t.spentSol)} / ${sol(t.budgetSol)} SOL · ${mmss(t.endsInMs)}`}
        pct={Math.min(1, t.spentSol / t.budgetSol)}
        onStop={() => {
          engine.stopTrendBot(l.coinId);
          notify("Trend bot stopped");
        }}
      />
    );
  const tgt = Math.max(target, lo);
  const q = engine.quoteTrend(l.coinId, tgt);
  const all: [string, number][] = [
    ["2×", l.mcUsd * 2],
    ["3×", l.mcUsd * 3],
    ...(l.bonded ? [] : ([["Bond", 44_000]] as [string, number][])),
    ...TREND_PRESETS_USD.map((v): [string, number] => [v >= 1e6 ? `$${v / 1e6}M` : `$${v / 1000}K`, v]),
  ];
  const presets = all.filter(([, v]) => v > lo * 0.99 && v <= TREND_USD_RANGE[1]);
  return (
    <div>
      <p className="mb-2 text-[11px] leading-snug text-dim">Steady buys into its own 5 wallets until it gets there or runs out of budget. Sellers push back, so it is an estimate.</p>
      <div className="mb-2 flex flex-wrap gap-1">
        {presets.map(([k, v]) => (
          <button key={k} type="button" className={chipCls(Math.abs(tgt - v) / v < 0.02)} onClick={() => setTarget(roundNice(v))}>
            {k}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Slider label="Target MC" value={tgt} min={lo} max={TREND_USD_RANGE[1]} log format={usd} onChange={setTarget} />
        <Slider label="Get there in" value={m} min={TREND_MIN_RANGE[0]} max={TREND_MIN_RANGE[1]} step={0.5} format={mins} onChange={setM} />
      </div>
      <Summary
        rows={[
          ["From", usd(l.mcUsd)],
          ["Est. cost", q ? `~${sol(q.sol)} SOL` : "-", q && q.sol > devSol ? "text-down" : ""],
          ["Budget cap (+30%)", q ? `${sol(Math.min(devSol, q.sol * 1.3))} SOL` : "-"],
        ]}
      />
      <StartBtn
        label={!q || q.sol <= 0 ? "Already past it" : q.sol > devSol ? "Not enough SOL" : `Start · to ${usd(tgt)}`}
        disabled={!q || q.sol <= 0 || q.sol > devSol || l.ended}
        onClick={() => {
          const r = engine.startTrendBot(l.coinId, tgt, m);
          notify(r.ok ? `Trend bot on: pushing to ${usd(tgt)} over ${mins(m)}` : (r.reason ?? "Couldn't start it"));
        }}
      />
    </div>
  );
}

function HoldersTab({ engine, l, devSol, notify }: Props) {
  const [n, setN] = useState(100);
  const h = l.bots.holders;
  if (h) return <Running label={`Adding holders · ${h.added} / ${h.total}`} pct={h.added / h.total} />;
  const est = engine.quoteHolders(l.coinId, n);
  return (
    <div>
      <p className="mb-2 text-[11px] leading-snug text-dim">
        Fresh wallets, each buying ~0.03% of supply. They land fast (a few seconds) and show as Holder wallets you can sell.
        {l.bots.botHolders > 0 && <span className="text-ink"> {l.bots.botHolders} holding now.</span>}
      </p>
      <div className="mb-2 flex flex-wrap gap-1">
        {[25, 50, 100, 200, 500].map((v) => (
          <button key={v} type="button" className={chipCls(n === v)} onClick={() => setN(v)}>
            {v}
          </button>
        ))}
      </div>
      <Slider label="Holders" value={n} min={HOLDER_RANGE[0]} max={HOLDER_RANGE[1]} step={5} format={(v) => String(v)} onChange={setN} />
      <Summary
        rows={[
          ["Supply they take", `~${(n * 0.03).toFixed(1)}%`],
          ["Est. cost (rent + buys)", `~${sol(est)} SOL`, est > devSol ? "text-down" : ""],
        ]}
      />
      <StartBtn
        label={est > devSol ? "Not enough SOL" : `Add ${n} holders`}
        disabled={est > devSol || l.ended}
        onClick={() => {
          const r = engine.startHolderBot(l.coinId, n);
          notify(r.ok ? `Holder bot on: ${n} holders landing` : (r.reason ?? "Couldn't start it"));
        }}
      />
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
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] leading-snug text-dim">Trades your launch wallets around a moving average.</span>
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
