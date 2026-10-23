"use client";

import { useEffect } from "react";
import { SOL_USD, SUPPLY } from "@/engine/curve";
import type { Engine } from "@/engine/engine";
import type { Pair, Snapshot } from "@/engine/types";
import { Art } from "./Art";
import { ChartPanel } from "./ChartPanel";
import { age, sol, usd } from "./format";
import { TradePanel } from "./TradePanel";
import { TradeTape } from "./TradeTape";

const PAIR_STYLE: Record<Pair, string> = {
  SPACEX: "bg-buy/15 text-[#7f9bff] border-buy/40",
  TESLA: "bg-down/15 text-down border-down/40",
  PUMP: "bg-white/10 text-ink border-white/20",
  SOL: "bg-violet/15 text-[#b79cff] border-violet/40",
};

const Stat = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
  <div className="leading-tight">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular text-[14px] font-bold ${tone ?? "text-ink"}`}>{v}</div>
  </div>
);

interface Props {
  engine: Engine;
  snap: Snapshot;
  coinId: string;
  wallStart: number;
  buyPresets: number[];
  onBuyPresets: (p: number[]) => void;
  onBack: () => void;
  notify: (text: string) => void;
}

export function TokenPage({ engine, snap, coinId, wallStart, buyPresets, onBuyPresets, onBack, notify }: Props) {
  const coin = engine.getCoinView(coinId);
  const tape = engine.getTape(coinId);
  const position = snap.positions.find((p) => p.coinId === coinId);

  const buy = (amount: number, eventTs: number) => {
    const trade = engine.quickBuy(coinId, amount, engine.fromEventTime(eventTs));
    notify(
      trade
        ? `Bought ${sol(trade.sol)} SOL of ${coin?.ticker ?? "coin"} · ${trade.rank} bot buys ahead of you`
        : "Buy failed: not enough SOL, or the curve is complete",
    );
  };

  const sell = (fraction: number, eventTs: number) => {
    const trade = engine.sell(coinId, fraction, engine.fromEventTime(eventTs));
    notify(trade ? `Sold ${Math.round(fraction * 100)}% for ${sol(trade.sol)} SOL` : "Nothing to sell");
  };

  // Buy hotkeys 1-4 (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i < 0 || i >= buyPresets.length) return;
      e.preventDefault();
      const trade = engine.quickBuy(coinId, buyPresets[i], engine.fromEventTime(e.timeStamp));
      const ticker = engine.getCoinView(coinId)?.ticker ?? "coin";
      notify(
        trade
          ? `Bought ${sol(trade.sol)} SOL of ${ticker} · ${trade.rank} bot buys ahead of you`
          : "Buy failed: not enough SOL, or the curve is complete",
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, coinId, buyPresets, notify]);

  if (!coin) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="text-[15px] font-semibold">This coin has left the board.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-3 rounded-lg border border-line-hi px-4 py-2 text-[13px] font-semibold text-dim hover:text-ink"
          >
            Back to Pulse
          </button>
        </div>
      </div>
    );
  }

  const entryMcUsd =
    position && position.boughtTokens > 0 ? (position.boughtSol / position.boughtTokens) * SUPPLY * SOL_USD : null;
  const bonded = coin.stage === "migrated" ? "Migrated" : `${Math.round(coin.progress * 100)}% bonded`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-line-hi px-2.5 py-1.5 text-[12px] font-semibold text-dim transition-colors hover:text-ink"
        >
          ← Pulse <kbd className="text-faint">Esc</kbd>
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <Art art={coin.art} className="h-11 w-11 rounded-lg border border-line-hi" glyphSize={22} />
            <span
              className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-panel text-[8px] font-black ${
                coin.config.launchpad === "pump" ? "bg-up text-black" : "bg-amber text-black"
              }`}
            >
              {coin.config.launchpad === "pump" ? "P" : "B"}
            </span>
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[18px] font-extrabold tracking-tight">{coin.ticker}</span>
              <span className={`rounded border px-1.5 py-px text-[10px] font-bold ${PAIR_STYLE[coin.config.pair]}`}>
                /{coin.config.pair}
              </span>
              {coin.config.dividends && (
                <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-px text-[10px] font-bold text-amber">
                  DIV
                </span>
              )}
              {coin.config.launchpad === "bonk" && (
                <span className="rounded border border-line-hi bg-white/5 px-1.5 py-px text-[10px] font-bold text-dim">
                  BONK
                </span>
              )}
            </div>
            <div className="truncate text-[12px] text-dim">
              {coin.name} · <span className="font-mono text-faint">{coin.mint}</span>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <Stat k="Market cap" v={usd(coin.mcUsd)} tone={coin.stage === "new" ? "text-down" : "text-up"} />
          <Stat k="Volume" v={usd(coin.volumeUsd)} />
          <Stat k="Holders" v={String(coin.holders)} />
          <Stat k="Txns" v={String(coin.txCount)} />
          <Stat k="Age" v={age(snap.now - coin.createdAt)} />
          <div className="w-28 leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{bonded}</div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-up" style={{ width: `${Math.round(coin.progress * 100)}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_330px] grid-rows-[minmax(0,1fr)_190px]">
        <div className="min-h-0 min-w-0">
          <ChartPanel
            key={coinId}
            engine={engine}
            coinId={coinId}
            version={snap.version}
            timeOffset={Math.floor(wallStart / 1000)}
            entryMcUsd={entryMcUsd}
          />
        </div>
        <div className="row-span-2 min-h-0">
          <TradePanel
            walletSol={snap.walletSol}
            position={position}
            buyPresets={buyPresets}
            onBuyPresets={onBuyPresets}
            onBuy={buy}
            onSell={sell}
          />
        </div>
        <div className="min-h-0 min-w-0 bg-panel">
          <TradeTape tape={tape} wallStart={wallStart} />
        </div>
      </div>
    </div>
  );
}
