"use client";

import { memo, useState } from "react";
import type { TapeEntry } from "@/engine/types";
import { age, sol, usd } from "./format";

type Tab = "all" | "you" | "big" | "sells";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "you", label: "You" },
  { id: "big", label: "Big" },
  { id: "sells", label: "Sells" },
];
/** A "big" trade, in SOL. */
const BIG_SOL = 2;

const Row = memo(function Row({ t, now }: { t: TapeEntry; now: number }) {
  const buy = t.side === "buy";
  const tone = buy ? "text-up" : "text-down";
  return (
    <tr className={t.by === "you" ? "bg-blue/10" : ""}>
      <td className={`tabular py-[3px] pl-3 font-semibold ${tone}`}>
        {buy ? "+" : "-"}
        {sol(t.sol, t.sol < 10 ? 2 : 1)}
      </td>
      <td className={`tabular py-[3px] text-right ${tone}`}>{usd(t.mcUsd)}</td>
      <td className={`py-[3px] pl-4 font-mono ${t.by === "you" ? "font-bold text-blue" : "text-dim"}`}>{t.trader}</td>
      <td className="tabular py-[3px] pr-3 text-right text-faint">{age(now - t.at)}</td>
    </tr>
  );
});

interface Props {
  tape: readonly TapeEntry[];
  /** Sim time in ms, for ages. */
  now: number;
}

export function TradeTape({ tape, now }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const rows = tape.filter((t) => (tab === "you" ? t.by === "you" : tab === "big" ? t.sol >= BIG_SOL : tab === "sells" ? t.side === "sell" : true));

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
        <span className="ml-auto text-[11px] text-faint">latest {tape.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-faint">
            {tab === "you" ? "You haven't traded this coin." : "No trades yet."}
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="py-1 pl-3 text-left font-semibold">Total (SOL)</th>
                <th className="py-1 text-right font-semibold">MC</th>
                <th className="py-1 pl-4 text-left font-semibold">Trader</th>
                <th className="py-1 pr-3 text-right font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <Row key={t.id} t={t} now={now} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
