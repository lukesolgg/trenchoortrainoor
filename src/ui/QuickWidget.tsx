"use client";

import { sol } from "./format";
import { SELL_PRESETS, FireButton } from "./TradePanel";

interface Props {
  presets: number[];
  buyLocked: boolean;
  presetSet: number;
  onPresetSet: (i: number) => void;
  walletSol: number;
  held: boolean;
  ticker: string;
  onBuy: (sol: number, eventTs: number) => void;
  onSell: (fraction: number, eventTs: number) => void;
  onClose: () => void;
}

/** Floating instant-trade pad over the chart. Every button fires on pointerdown. */
export function QuickWidget({ presets, buyLocked, presetSet, onPresetSet, walletSol, held, ticker, onBuy, onSell, onClose }: Props) {
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[230px] rounded-xl border border-line-hi bg-nav/95 p-2.5 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex gap-1 text-[11px] font-bold">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPresetSet(i)}
              className={`rounded px-2 py-0.5 transition-colors ${presetSet === i ? "bg-buy/25 text-[#9db0ff]" : "text-faint hover:text-ink"}`}
            >
              P{i + 1}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="px-1 text-[14px] leading-none text-dim hover:text-ink" aria-label="Close quick trade">
          ×
        </button>
      </div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-bold">Buy <span className="text-faint">SOL</span></span>
        <span className="tabular text-dim">◎ {sol(walletSol)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {presets.map((p, i) => (
          <FireButton key={i} tone="buy" outline pill h="h-7" disabled={p > walletSol || buyLocked} label={sol(p, p % 1 ? (p < 1 ? 2 : 1) : 0)} onFire={(ts) => onBuy(p, ts)} hint={undefined} />
        ))}
      </div>
      <div className="mb-1 mt-2.5 text-[11px] font-bold">
        Sell <span className="text-faint">% {ticker}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {SELL_PRESETS.map((p) => (
          <FireButton key={p} tone="sell" outline pill h="h-7" disabled={!held} label={`${p}%`} onFire={(ts) => onSell(p / 100, ts)} />
        ))}
      </div>
    </div>
  );
}
