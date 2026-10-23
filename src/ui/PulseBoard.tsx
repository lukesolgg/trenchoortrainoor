"use client";

import { useCallback, useState } from "react";
import type { CoinView } from "@/engine/types";
import { CoinCard } from "./CoinCard";
import { age } from "./format";
import { usePausable } from "./hooks";

interface ColumnProps {
  title: string;
  coins: CoinView[];
  query: string;
  now: number;
  quickSol: number;
  quickEnabled: boolean;
  onQuickBuy: (coinId: string, eventTs: number) => void;
  onOpen: (coinId: string) => void;
  footer?: React.ReactNode;
  empty: string;
}

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
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[13px] font-bold tracking-tight">{title}</h2>
        <span className="tabular text-[11px] text-faint">{filtered.length}</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {items.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-faint">{empty}</p>}
        {items.map((c) => (
          <CoinCard
            key={c.id}
            coin={c}
            ageText={age(now - c.createdAt)}
            quickSol={quickSol}
            quickEnabled={quickEnabled}
            onQuickBuy={onQuickBuy}
            onOpen={onOpen}
          />
        ))}
        {footer}
      </div>
      {hovered && (
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
  quickSol: number;
  quickEnabled: boolean;
  onQuickSol: (n: number) => void;
  onQuickEnabled: (b: boolean) => void;
  onQuickBuy: (coinId: string, eventTs: number) => void;
  onOpen: (coinId: string) => void;
}

export function PulseBoard(p: BoardProps) {
  const common = {
    now: p.now,
    query: p.query,
    quickSol: p.quickSol,
    quickEnabled: p.quickEnabled,
    onQuickBuy: p.onQuickBuy,
    onOpen: p.onOpen,
  };
  const [draft, setDraft] = useState(String(p.quickSol));
  const commit = useCallback(
    (v: string) => {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) p.onQuickSol(Math.min(n, 100));
      else setDraft(String(p.quickSol));
    },
    [p],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h1 className="text-[18px] font-extrabold tracking-tight">Pulse</h1>
        <label className="flex items-center gap-2 rounded-full border border-buy/40 bg-buy/10 py-1 pl-3 pr-2 text-[12px] font-semibold text-[#9db0ff]">
          <span aria-hidden>⚡</span> Quick Buy
          <input
            value={draft}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), commit(draft))}
            className="tabular w-10 rounded bg-black/30 px-1.5 py-0.5 text-center text-ink outline-none focus:ring-1 focus:ring-buy"
            aria-label="Quick buy amount in SOL"
          />
          <span className="text-dim">SOL</span>
          <button
            type="button"
            role="switch"
            aria-checked={p.quickEnabled}
            onClick={() => p.onQuickEnabled(!p.quickEnabled)}
            className={`relative h-5 w-9 rounded-full transition-colors ${p.quickEnabled ? "bg-buy" : "bg-line-hi"}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${p.quickEnabled ? "left-[18px]" : "left-0.5"}`}
            />
          </button>
        </label>
      </div>
      <div className="flex min-h-0 flex-1">
        <PulseColumn title="New Pairs" coins={p.newPairs} empty="Waiting for launches…" {...common} />
        <PulseColumn
          title="Final Stretch"
          coins={p.finalStretch}
          empty="Nothing past 35% yet."
          footer={
            <div className="rounded-xl border border-dashed border-line-hi p-3 text-[12px] text-dim">
              <div className="font-semibold text-ink/90">Next up: 35% bonded</div>
              Coins past 35% of the curve wait here. They migrate at 100%.
            </div>
          }
          {...common}
        />
        <PulseColumn title="Migrated" coins={p.migrated} empty="No migrations yet." {...common} />
      </div>
    </div>
  );
}
