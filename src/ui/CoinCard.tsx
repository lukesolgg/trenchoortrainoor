"use client";

import { memo, useState } from "react";
import type { CoinView } from "@/engine/types";
import { Art } from "./Art";
import { PAIR_STYLE } from "./chips";
import { sol, usd } from "./format";

const Chip = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`rounded border px-1.5 py-px text-[10px] font-bold leading-4 tracking-wide ${className}`}>
    {children}
  </span>
);

const ICONS: Record<string, string> = { T10: "♛", DEV: "♞", SNP: "⌖", INS: "◈" };

const Stat = ({ label, v, warn }: { label: string; v: number; warn: number }) => (
  <span
    className={`tabular flex items-center gap-0.5 text-[11px] font-semibold ${v >= warn ? "text-down" : "text-up"}`}
    title={label}
  >
    <span className="text-[10px] opacity-80" aria-hidden>
      {ICONS[label]}
    </span>
    {v}%
  </span>
);

interface Props {
  coin: CoinView;
  ageText: string;
  /** SOL amount of the column's selected preset. */
  quickSol: number;
  quickEnabled: boolean;
  /** Called on pointerdown/keydown with the raw event timestamp. */
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
}

export const CoinCard = memo(function CoinCard({ coin, ageText, quickSol, quickEnabled, onQuickBuy, onOpen }: Props) {
  const [flash, setFlash] = useState(0);
  const { config } = coin;
  const total = coin.buys + coin.sells;
  const buyPct = total ? (coin.buys / total) * 100 : 50;

  const fire = (ts: number) => {
    if (!quickEnabled) return;
    onQuickBuy(coin.id, quickSol, ts);
    setFlash((n) => n + 1);
  };

  return (
    <div
      data-coin-id={coin.id}
      onClick={() => onOpen(coin.id)}
      className={`anim-card relative flex cursor-pointer gap-2.5 rounded-lg border p-2 transition-colors ${
        coin.held ? "border-up/60 bg-up/[0.06]" : "border-line bg-card hover:border-line-hi hover:bg-card-hi"
      }`}
    >
      <div className="relative shrink-0">
        <Art art={coin.art} className="h-[64px] w-[64px] rounded-md border border-line-hi" glyphSize={28} />
        <span
          className={`absolute -bottom-1 -right-1 grid h-[16px] w-[16px] place-items-center rounded-full border-2 border-card text-[8px] font-black ${
            config.launchpad === "pump" ? "bg-up text-black" : "bg-amber text-black"
          }`}
          title={config.launchpad === "pump" ? "Launched on Pump" : "Launched on Bonk"}
        >
          {config.launchpad === "pump" ? "P" : "B"}
        </span>
        <div className="mt-1.5 h-[3px] w-[64px] overflow-hidden rounded-full bg-line">
          <div className="h-full bg-up" style={{ width: `${Math.round(coin.progress * 100)}%` }} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-extrabold tracking-tight">{coin.ticker}</span>
              <Chip className={PAIR_STYLE[config.pair]}>/{config.pair}</Chip>
              {config.dividends && <Chip className="border-amber/40 bg-amber/15 text-amber">DIV</Chip>}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-dim">
              <span className="tabular font-semibold text-up">{ageText}</span>
              <span className="truncate">{coin.name}</span>
            </div>
            <div className="font-mono text-[10px] text-faint">{coin.mint}</div>
          </div>
          <div className="shrink-0 text-right leading-tight">
            <div className="text-[10.5px] text-dim">
              V <span className="tabular font-semibold text-ink">{usd(coin.volumeUsd)}</span>
            </div>
            <div className="text-[10.5px] text-dim">
              MC{" "}
              <span className={`tabular text-[14px] font-extrabold ${coin.stage === "new" ? "text-blue" : "text-up"}`}>
                {usd(coin.mcUsd)}
              </span>
            </div>
            <div className="text-[10.5px] text-dim">
              F <span className="tabular text-ink">{sol(coin.feesSol, 2)}</span>
              <span className="mx-1 text-faint">·</span>
              TX <span className="tabular text-ink">{coin.txCount}</span>
            </div>
            <div className="ml-auto mt-0.5 flex h-[3px] w-[64px] overflow-hidden rounded-full bg-down/70">
              <div className="h-full bg-up" style={{ width: `${buyPct}%` }} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Stat label="T10" v={coin.stats.top10} warn={25} />
            <Stat label="DEV" v={coin.stats.dev} warn={5} />
            <Stat label="SNP" v={coin.stats.snipers} warn={8} />
            <Stat label="INS" v={coin.stats.insiders} warn={3} />
          </div>
          <span key={flash} className={`rounded-full ${flash ? "anim-flash" : ""}`}>
            <button
              type="button"
              data-fire
              disabled={!quickEnabled}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                fire(e.nativeEvent.timeStamp);
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fire(e.nativeEvent.timeStamp);
                }
              }}
              className="flex h-7 min-w-[72px] items-center justify-center gap-1 rounded-full bg-buy px-3 text-[12px] font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>⚡</span>
              {sol(quickSol, quickSol % 1 ? 2 : 0)}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
});
