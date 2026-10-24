"use client";

import { useState } from "react";
import type { CoinView } from "@/engine/types";
import { CoinCard } from "./CoinCard";
import { MIGRATION_MC_USD } from "@/engine/curve";
import { age, usd } from "./format";
import { usePausable } from "./hooks";
import { BoltIcon, SolIcon } from "./icons";

interface ColumnProps {
  title: string;
  coins: CoinView[];
  query: string;
  now: number;
  quickSol: number;
  quickEnabled: boolean;
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
  footer?: React.ReactNode;
  empty: string;
}

/** A Memescope column. Hovering it freezes the list so the coin under your cursor stays put; new arrivals queue up. */
function PulseColumn({ title, coins, query, now, quickSol, quickEnabled, onQuickBuy, onOpen, footer, empty }: ColumnProps) {
  const [hovered, setHovered] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? coins.filter((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.mint.toLowerCase().includes(q))
    : coins;
  const { items, newCount } = usePausable(filtered, hovered);

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-line last:border-r-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-[13.5px] font-bold tracking-tight">{title}</h2>
        <span className="tabular text-[11px] text-faint">{filtered.length}</span>
        {hovered && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="rounded-[4px] border border-line-hi px-1.5 py-px text-dim">Paused</span>
            {newCount > 0 && <span className="rounded-[4px] bg-amber px-1.5 py-px text-black">{newCount} new</span>}
          </span>
        )}
      </header>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-faint">{empty}</p>}
        {items.map((c) => (
          <CoinCard
            key={c.id}
            coin={c}
            ageText={age(now - c.createdAt)}
            quickSol={quickSol}
            quickEnabled={quickEnabled}
            migrating={c.migratingUntil !== null && c.migratingUntil > now}
            onQuickBuy={onQuickBuy}
            onOpen={onOpen}
          />
        ))}
        {footer}
      </div>
    </section>
  );
}

interface BoardProps {
  newPairs: CoinView[];
  finalStretch: CoinView[];
  migrated: CoinView[];
  now: number;
  query: string;
  quickAmount: number;
  onQuickAmount: (n: number) => void;
  quickEnabled: boolean;
  onQuickEnabled: (b: boolean) => void;
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
}

/** One quick-buy size for the whole board, big enough to read at a glance. */
function QuickAmount({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border border-line-hi bg-card px-3 focus-within:border-buy" title="Quick buy amount">
      <BoltIcon className="h-4 w-4 text-buy" />
      <input
        key={value}
        defaultValue={value}
        inputMode="decimal"
        onBlur={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n) && n > 0) onChange(Math.min(n, 100));
          else e.target.value = String(value);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="tabular w-14 bg-transparent text-[17px] font-extrabold text-ink outline-none"
        aria-label="Quick buy amount in SOL"
      />
      <span className="flex items-center gap-1 text-[13px] font-bold text-dim">
        <SolIcon className="h-3.5 w-3.5" /> SOL
      </span>
    </label>
  );
}

export function PulseBoard(p: BoardProps) {
  const common = {
    now: p.now,
    query: p.query,
    quickSol: p.quickAmount,
    quickEnabled: p.quickEnabled,
    onQuickBuy: p.onQuickBuy,
    onOpen: p.onOpen,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h1 className="text-[16px] font-extrabold tracking-tight">Memescope</h1>
        <div className="flex items-center gap-4">
          <QuickAmount value={p.quickAmount} onChange={p.onQuickAmount} />
          <label className="flex items-center gap-2 text-[12px] font-semibold text-dim">
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
        <PulseColumn title="New" coins={p.newPairs} empty="Waiting for launches…" {...common} />
        <PulseColumn
          title="Almost bonded"
          coins={p.finalStretch}
          empty="Nothing past 35% yet."
          footer={
            <div className="m-2 rounded-md border border-dashed border-line-hi p-3 text-[12px] text-dim">
              <div className="font-semibold text-ink/90">Next up: 35% bonded</div>
              Coins past 35% of the curve wait here. They migrate at <span className="font-semibold text-up">{usd(MIGRATION_MC_USD)}</span> market cap, then buys pause for 3 s.
            </div>
          }
          {...common}
        />
        <PulseColumn title="Migrated" coins={p.migrated} empty="No migrations yet." {...common} />
      </div>
    </div>
  );
}
