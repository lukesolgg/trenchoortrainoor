"use client";

import { useMemo, useState } from "react";
import type { CoinView } from "@/engine/types";
import { Art } from "./Art";
import { age, usd, pct } from "./format";
import { BoltIcon } from "./icons";

type Filter = "surging" | "gainers" | "fresh" | "near";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "surging", label: "Surging" },
  { id: "gainers", label: "Top gainers" },
  { id: "fresh", label: "Fresh" },
  { id: "near", label: "Near migration" },
];

interface Props {
  coins: CoinView[];
  now: number;
  query: string;
  quickSol: number;
  quickEnabled: boolean;
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
}

const LIMIT = 30;

/** Every coin on the board, ranked. Click a row for its chart; the bolt buys at your quick-buy size. */
export function Trending({ coins, now, query, quickSol, quickEnabled, onQuickBuy, onOpen }: Props) {
  const [filter, setFilter] = useState<Filter>("surging");
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    let list = q
      ? coins.filter((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.mint.toLowerCase().includes(q))
      : coins;
    if (filter === "near") list = list.filter((c) => c.stage === "final");
    const sorted = [...list];
    if (filter === "surging") sorted.sort((a, b) => b.volumeUsd - a.volumeUsd);
    else if (filter === "gainers") sorted.sort((a, b) => b.changePct - a.changePct);
    else if (filter === "fresh") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else sorted.sort((a, b) => b.progress - a.progress);
    return sorted.slice(0, LIMIT);
  }, [coins, filter, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line bg-nav px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[20px] font-extrabold tracking-tight">Trending</h1>
          <span className="rounded border border-line-hi px-1.5 py-px text-[10px] font-bold text-dim">SIM</span>
          <span className="text-[12px] text-dim">The board ranked: what is moving right now</span>
        </div>
        <div className="mt-3 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3.5 py-1 text-[12px] font-semibold transition-colors ${
                filter === f.id ? "border-up/60 bg-up/10 text-up" : "border-line-hi text-dim hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-nav text-[10.5px] uppercase tracking-wider text-faint">
            <tr>
              <th className="w-10 py-2 pl-5 text-left font-semibold">#</th>
              <th className="py-2 text-left font-semibold">Token</th>
              <th className="py-2 text-right font-semibold">Market cap</th>
              <th className="py-2 text-right font-semibold">Volume</th>
              <th className="py-2 text-right font-semibold">Change</th>
              <th className="py-2 text-right font-semibold">Bonding</th>
              <th className="py-2 text-right font-semibold">Age</th>
              <th className="py-2 text-right font-semibold">Holders</th>
              <th className="w-24 py-2 pr-5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-faint">
                  Nothing matches yet.
                </td>
              </tr>
            )}
            {rows.map((c, i) => {
              const migrating = c.migratingUntil !== null && c.migratingUntil > now;
              return (
                <tr
                  key={c.id}
                  data-coin-id={c.id}
                  onClick={() => onOpen(c.id)}
                  className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-card-hi ${c.held ? "bg-up/[0.05]" : ""}`}
                >
                  <td className="tabular py-2 pl-5 text-faint">{i + 1}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <Art art={c.art} className="h-9 w-9 rounded-lg border border-line-hi" glyphSize={18} />
                      <div className="leading-tight">
                        <div className="font-bold">${c.ticker}</div>
                        <div className="text-[11.5px] text-dim">{c.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tabular py-2 text-right font-semibold">{usd(c.mcUsd)}</td>
                  <td className="tabular py-2 text-right text-dim">{usd(c.volumeUsd)}</td>
                  <td className={`tabular py-2 text-right font-semibold ${c.changePct >= 0 ? "text-up" : "text-down"}`}>{pct(c.changePct)}</td>
                  <td className="tabular py-2 text-right text-dim">{c.stage === "migrated" ? "migrated" : `${Math.round(c.progress * 100)}%`}</td>
                  <td className="tabular py-2 text-right text-dim">{age(now - c.createdAt)}</td>
                  <td className="tabular py-2 text-right text-dim">{c.holders}</td>
                  <td className="py-2 pr-5">
                    <button
                      type="button"
                      data-fire
                      disabled={!quickEnabled || migrating}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !quickEnabled || migrating) return;
                        e.preventDefault();
                        onQuickBuy(c.id, quickSol, e.nativeEvent.timeStamp);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-auto flex h-7 min-w-[64px] items-center justify-center gap-1 rounded-full bg-buy px-3 text-[12px] font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {migrating ? "…" : (
                        <>
                          <BoltIcon className="h-3 w-3" />
                          {quickSol}
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
