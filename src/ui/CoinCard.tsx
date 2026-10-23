"use client";

import { memo, useState } from "react";
import type { CoinView, Pair } from "@/engine/types";
import { Art } from "./Art";
import { sol, usd } from "./format";

const PAIR_STYLE: Record<Pair, string> = {
  SPACEX: "bg-buy/15 text-[#7f9bff] border-buy/40",
  TESLA: "bg-down/15 text-down border-down/40",
  PUMP: "bg-white/10 text-ink border-white/20",
  SOL: "bg-violet/15 text-[#b79cff] border-violet/40",
};

const Chip = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`rounded border px-1.5 py-px text-[10px] font-bold leading-4 tracking-wide ${className}`}>
    {children}
  </span>
);

const Stat = ({ label, v, warn }: { label: string; v: number; warn: number }) => (
  <span
    className={`tabular rounded border px-1.5 py-px text-[10px] font-semibold ${
      v >= warn ? "border-down/30 bg-down/10 text-down" : "border-up/25 bg-up/10 text-up"
    }`}
    title={label}
  >
    {label} {v}%
  </span>
);

interface Props {
  coin: CoinView;
  ageText: string;
  quickSol: number;
  quickEnabled: boolean;
  /** Called on pointerdown/keydown with the raw event timestamp. */
  onQuickBuy: (coinId: string, eventTs: number) => void;
}

export const CoinCard = memo(function CoinCard({ coin, ageText, quickSol, quickEnabled, onQuickBuy }: Props) {
  const [flash, setFlash] = useState(0);
  const { config } = coin;

  const fire = (ts: number) => {
    if (!quickEnabled) return;
    onQuickBuy(coin.id, ts);
    setFlash((n) => n + 1);
  };

  return (
    <div
      className={`anim-card relative flex gap-3 rounded-xl border p-2.5 transition-colors ${
        coin.held ? "border-up/50 bg-up/[0.04]" : "border-line bg-card hover:border-line-hi hover:bg-card-hi"
      }`}
    >
      <div className="relative shrink-0">
        <div className="relative">
          <Art art={coin.art} className="h-[68px] w-[68px] rounded-lg border border-line-hi" glyphSize={30} />
          <span
            className={`absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-card text-[9px] font-black ${
              config.launchpad === "pump" ? "bg-up text-black" : "bg-amber text-black"
            }`}
            title={config.launchpad === "pump" ? "Launched on Pump" : "Launched on Bonk"}
          >
            {config.launchpad === "pump" ? "P" : "B"}
          </span>
        </div>
        <div className="mt-2 h-[3px] w-[68px] overflow-hidden rounded-full bg-line">
          <div className="h-full bg-up" style={{ width: `${Math.round(coin.progress * 100)}%` }} />
        </div>
        <div className="mt-1 w-[68px] truncate text-center font-mono text-[10px] text-faint">{coin.mint}</div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[15px] font-extrabold tracking-tight text-ink">{coin.ticker}</span>
              <Chip className={PAIR_STYLE[config.pair]}>/{config.pair}</Chip>
              {config.dividends && <Chip className="border-amber/40 bg-amber/15 text-amber">DIV</Chip>}
              {config.launchpad === "bonk" && <Chip className="border-line-hi bg-white/5 text-dim">BONK</Chip>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px]">
              <span className="truncate text-dim">{coin.name}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-dim">
              <span className="tabular font-semibold text-up">{ageText}</span>
              <span className="tabular">{coin.holders} holders</span>
            </div>
          </div>

          <div className="shrink-0 text-right leading-tight">
            <div className="text-[11px] text-dim">
              V <span className="tabular font-semibold text-ink">{usd(coin.volumeUsd)}</span>
              <span className="ml-2">MC</span>{" "}
              <span className={`tabular text-[15px] font-extrabold ${coin.stage === "new" ? "text-down" : "text-up"}`}>
                {usd(coin.mcUsd)}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-dim">
              TX <span className="tabular font-semibold text-ink">{coin.txCount}</span>
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            <Stat label="T10" v={coin.stats.top10} warn={25} />
            <Stat label="DEV" v={coin.stats.dev} warn={5} />
            <Stat label="SNP" v={coin.stats.snipers} warn={8} />
            <Stat label="INS" v={coin.stats.insiders} warn={3} />
          </div>
          <span key={flash} className={`rounded-lg ${flash ? "anim-flash" : ""}`}>
            <button
              type="button"
              disabled={!quickEnabled}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                fire(e.nativeEvent.timeStamp);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fire(e.nativeEvent.timeStamp);
                }
              }}
              className="flex h-8 min-w-[88px] items-center justify-center gap-1 rounded-lg bg-buy px-3 text-[13px] font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>⚡</span>
              {sol(quickSol, quickSol % 1 ? 2 : 0)} SOL
            </button>
          </span>
        </div>
      </div>
    </div>
  );
});
