"use client";

import { memo } from "react";
import type { TapeEntry } from "@/engine/types";
import { clockTime, sol, usd } from "./format";

const Row = memo(function Row({ t, wallStart }: { t: TapeEntry; wallStart: number }) {
  const buy = t.side === "buy";
  return (
    <tr className={t.by === "you" ? "bg-buy/10" : ""}>
      <td className="tabular py-1 pl-3 text-faint">{clockTime(wallStart + t.at)}</td>
      <td className={`py-1 font-bold ${buy ? "text-up" : "text-down"}`}>{buy ? "Buy" : "Sell"}</td>
      <td className="tabular py-1 text-right">{sol(t.sol, t.sol < 10 ? 2 : 1)}</td>
      <td className="tabular py-1 text-right text-dim">{usd(t.mcUsd)}</td>
      <td className={`py-1 pr-3 text-right font-semibold ${t.by === "you" ? "text-[#9db0ff]" : "text-faint"}`}>
        {t.by === "you" ? "You" : "Bot"}
      </td>
    </tr>
  );
});

export function TradeTape({ tape, wallStart }: { tape: readonly TapeEntry[]; wallStart: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line">
      <div className="flex h-8 shrink-0 items-center justify-between px-3">
        <h3 className="text-[12px] font-bold tracking-tight">Trades</h3>
        <span className="text-[11px] text-faint">latest {tape.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tape.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-faint">No trades since you opened this coin's page.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="py-1 pl-3 text-left font-semibold">Time</th>
                <th className="py-1 text-left font-semibold">Type</th>
                <th className="py-1 text-right font-semibold">SOL</th>
                <th className="py-1 text-right font-semibold">MC</th>
                <th className="py-1 pr-3 text-right font-semibold">By</th>
              </tr>
            </thead>
            <tbody>
              {tape.map((t) => (
                <Row key={t.id} t={t} wallStart={wallStart} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
