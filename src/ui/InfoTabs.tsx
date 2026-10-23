"use client";

import { useMemo, useState } from "react";
import type { CoinView, PlayerTrade, Position, TapeEntry } from "@/engine/types";
import { age, sol, signed } from "./format";
import { FireButton } from "./TradePanel";

type Tab = "positions" | "holders" | "traders" | "mine";
const TABS: { id: Tab; label: string }[] = [
  { id: "positions", label: "Positions" },
  { id: "holders", label: "Holders" },
  { id: "traders", label: "Top Traders" },
  { id: "mine", label: "My Trades" },
];

const Stat = ({ k, v, bad }: { k: string; v: string; bad?: boolean }) => (
  <div className="rounded-lg border border-line bg-card px-3 py-2">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular text-[15px] font-bold ${bad ? "text-down" : "text-up"}`}>{v}</div>
  </div>
);

interface Props {
  coin: CoinView;
  tape: readonly TapeEntry[];
  trades: readonly PlayerTrade[];
  now: number;
  positions: { position: Position; ticker: string; name: string }[];
  onSellCoin: (coinId: string, fraction: number, eventTs: number) => void;
}

/** Bottom-right tabs. Holders shows the distribution stats the engine models, not a fake wallet list. */
export function InfoTabs({ coin, tape, trades, now, positions, onSellCoin }: Props) {
  const [tab, setTab] = useState<Tab>("positions");

  const traders = useMemo(() => {
    const by = new Map<string, { buy: number; sell: number; n: number }>();
    for (const t of tape) {
      const r = by.get(t.trader) ?? { buy: 0, sell: 0, n: 0 };
      if (t.side === "buy") r.buy += t.sol;
      else r.sell += t.sol;
      r.n++;
      by.set(t.trader, r);
    }
    return [...by.entries()].map(([trader, r]) => ({ trader, ...r, net: r.sell - r.buy })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 12);
  }, [tape]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`rounded px-2 py-0.5 text-[12px] font-semibold transition-colors ${tab === x.id ? "bg-card-hi text-ink" : "text-dim hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "positions" &&
          (positions.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-faint">No positions yet.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="py-1 pl-3 text-left font-semibold">Token</th>
                  <th className="py-1 text-right font-semibold">Bought</th>
                  <th className="py-1 text-right font-semibold">Value</th>
                  <th className="py-1 text-right font-semibold">PnL</th>
                  <th className="py-1 pr-3 text-right font-semibold">Sell</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(({ position: p, ticker }) => {
                  const pnl = p.soldSol + p.valueSol - p.boughtSol;
                  const pct = p.boughtSol > 0 ? (pnl / p.boughtSol) * 100 : 0;
                  const open = p.tokens > 1e-6;
                  return (
                    <tr key={p.coinId}>
                      <td className="py-[3px] pl-3 font-bold">{ticker}</td>
                      <td className="tabular py-[3px] text-right">◎{sol(p.boughtSol)}</td>
                      <td className="tabular py-[3px] text-right">◎{sol(p.valueSol)}</td>
                      <td className={`tabular py-[3px] text-right font-semibold ${pnl >= 0 ? "text-up" : "text-down"}`}>
                        {signed(pnl)} <span className="text-[10px] opacity-70">{signed(pct, 0)}%</span>
                      </td>
                      <td className="py-[3px] pr-3">
                        <div className="ml-auto flex w-[132px] gap-1">
                          <FireButton tone="sell" outline pill h="h-6" disabled={!open} label="50%" onFire={(ts) => onSellCoin(p.coinId, 0.5, ts)} />
                          <FireButton tone="sell" outline pill h="h-6" disabled={!open} label="100%" onFire={(ts) => onSellCoin(p.coinId, 1, ts)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        {tab === "holders" && (
          <div className="grid grid-cols-3 gap-2 p-3">
            <Stat k="Holders" v={String(coin.holders)} />
            <Stat k="Top 10" v={`${coin.stats.top10}%`} bad={coin.stats.top10 >= 25} />
            <Stat k="Dev holds" v={`${coin.stats.dev}%`} bad={coin.stats.dev >= 5} />
            <Stat k="Snipers" v={`${coin.stats.snipers}%`} bad={coin.stats.snipers >= 8} />
            <Stat k="Insiders" v={`${coin.stats.insiders}%`} bad={coin.stats.insiders >= 3} />
            <Stat k="Bonded" v={coin.stage === "migrated" ? "100%" : `${Math.round(coin.progress * 100)}%`} />
          </div>
        )}
        {tab === "traders" &&
          (traders.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-faint">No trades yet.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="py-1 pl-3 text-left font-semibold">Trader</th>
                  <th className="py-1 text-right font-semibold">Bought</th>
                  <th className="py-1 text-right font-semibold">Sold</th>
                  <th className="py-1 pr-3 text-right font-semibold">Net (SOL)</th>
                </tr>
              </thead>
              <tbody>
                {traders.map((r) => (
                  <tr key={r.trader}>
                    <td className={`py-[3px] pl-3 font-mono ${r.trader === "You" ? "font-bold text-blue" : "text-dim"}`}>{r.trader}</td>
                    <td className="tabular py-[3px] text-right text-up">{sol(r.buy)}</td>
                    <td className="tabular py-[3px] text-right text-down">{sol(r.sell)}</td>
                    <td className={`tabular py-[3px] pr-3 text-right font-semibold ${r.net >= 0 ? "text-up" : "text-down"}`}>{signed(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        {tab === "mine" &&
          (trades.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-faint">You haven&apos;t traded this coin.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="py-1 pl-3 text-left font-semibold">Side</th>
                  <th className="py-1 text-right font-semibold">SOL</th>
                  <th className="py-1 pr-3 text-right font-semibold">Age</th>
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((t, i) => (
                  <tr key={i}>
                    <td className={`py-[3px] pl-3 font-bold ${t.side === "buy" ? "text-up" : "text-down"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
                    <td className="tabular py-[3px] text-right">{sol(t.sol)}</td>
                    <td className="tabular py-[3px] pr-3 text-right text-faint">{age(now - t.execAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}
