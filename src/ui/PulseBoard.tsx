"use client";

import { useState } from "react";
import type { CoinView } from "@/engine/types";
import { CoinCard } from "./CoinCard";
import { MIGRATION_MC_USD } from "@/engine/curve";
import { age, usd } from "./format";
import { usePausable } from "./hooks";

interface ColumnProps {
  title: string;
  coins: CoinView[];
  query: string;
  now: number;
  presets: number[];
  preset: number;
  onPreset: (i: number) => void;
  quickEnabled: boolean;
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
  pauseOnHover: boolean;
  footer?: React.ReactNode;
  empty: string;
}

function PulseColumn({ title, coins, query, now, presets, preset, onPreset, quickEnabled, onQuickBuy, onOpen, pauseOnHover, footer, empty }: ColumnProps) {
  const [hovered, setHovered] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? coins.filter((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.mint.toLowerCase().includes(q))
    : coins;
  const paused = hovered && pauseOnHover;
  const { items, newCount } = usePausable(filtered, paused);

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-line bg-panel/40 last:border-r-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-bold tracking-tight">{title}</h2>
          <span className="tabular text-[11px] text-faint">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-faint">⚡</span>
          <div className="flex overflow-hidden rounded-md border border-line-hi text-[10.5px] font-bold" role="radiogroup" aria-label={`${title} quick buy preset`}>
            {presets.map((v, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={preset === i}
                onClick={() => onPreset(i)}
                className={`px-2 py-0.5 transition-colors ${preset === i ? "bg-buy text-white" : "text-dim hover:text-ink"}`}
              >
                P{i + 1}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {items.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-faint">{empty}</p>}
        {items.map((c) => (
          <CoinCard
            key={c.id}
            coin={c}
            ageText={age(now - c.createdAt)}
            quickSol={presets[preset]}
            quickEnabled={quickEnabled}
            migrating={c.migratingUntil !== null && c.migratingUntil > now}
            onQuickBuy={onQuickBuy}
            onOpen={onOpen}
          />
        ))}
        {footer}
      </div>
      {paused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2 text-[11px] font-semibold">
          <span className="rounded-full border border-line-hi bg-card-hi px-2.5 py-1 text-dim">Paused</span>
          {newCount > 0 && <span className="rounded-full bg-amber px-2.5 py-1 text-black">{newCount} new ↑</span>}
        </div>
      )}
    </section>
  );
}

interface BoardProps {
  newPairs: CoinView[];
  finalStretch: CoinView[];
  migrated: CoinView[];
  now: number;
  query: string;
  presets: number[];
  colPreset: number[];
  onPresetValue: (i: number, n: number) => void;
  onColPreset: (col: number, i: number) => void;
  quickEnabled: boolean;
  onQuickEnabled: (b: boolean) => void;
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
  /** Off in scored rounds: a frozen column would hide the coin you are racing for. */
  pauseOnHover: boolean;
}

function PresetEditor({ presets, onChange }: { presets: number[]; onChange: (i: number, n: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {presets.map((v, i) => (
        <label key={i} className="flex items-center gap-1 text-[11px] font-bold text-dim">
          P{i + 1}
          <input
            defaultValue={v}
            inputMode="decimal"
            onBlur={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange(i, Math.min(n, 100));
              else e.target.value = String(v);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="tabular w-11 rounded bg-black/30 px-1.5 py-0.5 text-center text-ink outline-none focus:ring-1 focus:ring-buy"
            aria-label={`Preset P${i + 1} in SOL`}
          />
        </label>
      ))}
    </div>
  );
}

export function PulseBoard(p: BoardProps) {
  const common = {
    now: p.now,
    query: p.query,
    presets: p.presets,
    quickEnabled: p.quickEnabled,
    onQuickBuy: p.onQuickBuy,
    onOpen: p.onOpen,
    pauseOnHover: p.pauseOnHover,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-nav px-4">
        <h1 className="text-[15px] font-extrabold tracking-tight">Memescope</h1>
        <div className="flex items-center gap-4">
          <PresetEditor presets={p.presets} onChange={p.onPresetValue} />
          <label className="flex items-center gap-2 text-[11px] font-semibold text-dim">
            Quick buy
            <button
              type="button"
              role="switch"
              aria-checked={p.quickEnabled}
              onClick={() => p.onQuickEnabled(!p.quickEnabled)}
              className={`relative h-4 w-8 rounded-full transition-colors ${p.quickEnabled ? "bg-buy" : "bg-line-hi"}`}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${p.quickEnabled ? "left-[17px]" : "left-0.5"}`} />
            </button>
          </label>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <PulseColumn title="New" coins={p.newPairs} empty="Waiting for launches…" preset={p.colPreset[0]} onPreset={(i) => p.onColPreset(0, i)} {...common} />
        <PulseColumn
          title="Almost bonded"
          coins={p.finalStretch}
          empty="Nothing past 35% yet."
          preset={p.colPreset[1]}
          onPreset={(i) => p.onColPreset(1, i)}
          footer={
            <div className="rounded-lg border border-dashed border-line-hi p-3 text-[12px] text-dim">
              <div className="font-semibold text-ink/90">Next up: 35% bonded</div>
              Coins past 35% of the curve wait here. They migrate at <span className="font-semibold text-up">{usd(MIGRATION_MC_USD)}</span> market cap, then buys pause for 3 s.
            </div>
          }
          {...common}
        />
        <PulseColumn title="Migrated" coins={p.migrated} empty="No migrations yet." preset={p.colPreset[2]} onPreset={(i) => p.onColPreset(2, i)} {...common} />
      </div>
    </div>
  );
}
