"use client";

import { memo, useState } from "react";
import type { CoinView } from "@/engine/types";
import { Art } from "./Art";
import { PAIR_STYLE } from "./chips";
import { sol, usd } from "./format";
import { BoltIcon, DevIcon, HoldersIcon, ProIcon, SolIcon } from "./icons";
import { SourceBadge } from "./SourceBadge";

/** Pair and DIV are what separate the right coin from its look-alikes, so they are big and loud. */
const Chip = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`rounded-[4px] border px-1.5 text-[11.5px] font-black leading-[19px] tracking-wide ${className}`}>{children}</span>
);

const ICONS: Record<string, string> = { T10: "♛", DEV: "♞", SNP: "⌖", INS: "◈" };
const TITLES: Record<string, string> = { T10: "Top 10 holders", DEV: "Dev holds", SNP: "Snipers", INS: "Insiders" };

/** GMGN-style bordered stat pill: green when healthy, red past the warning level. */
const Pill = ({ label, v, warn }: { label: string; v: number; warn: number }) => (
  <span
    className={`tabular flex h-[19px] items-center gap-0.5 rounded-[4px] border border-line px-1 text-[10.5px] font-semibold ${
      v >= warn ? "text-down" : "text-up"
    }`}
    title={TITLES[label]}
  >
    <span className="text-[10px] opacity-80" aria-hidden>
      {ICONS[label]}
    </span>
    {v}%
  </span>
);

const Metric = ({ icon, v, title, tone = "text-dim" }: { icon: React.ReactNode; v: number; title: string; tone?: string }) => (
  <span className={`tabular flex items-center gap-1 text-[11.5px] font-semibold ${tone}`} title={title}>
    {icon}
    {v}
  </span>
);

const fmtAmount = (n: number) => sol(n, n % 1 ? (n < 1 ? 2 : 1) : 0);

interface Props {
  coin: CoinView;
  ageText: string;
  /** Quick-buy size in SOL. */
  quickSol: number;
  quickEnabled: boolean;
  /** Buys are paused while the coin migrates. */
  migrating: boolean;
  /** Called on pointerdown/keydown with the raw event timestamp. */
  onQuickBuy: (coinId: string, sol: number, eventTs: number) => void;
  onOpen: (coinId: string) => void;
}

export const CoinCard = memo(function CoinCard({ coin, ageText, quickSol, quickEnabled, migrating, onQuickBuy, onOpen }: Props) {
  const [flash, setFlash] = useState(0);
  const { config } = coin;
  const total = coin.buys + coin.sells;
  const buyPct = total ? (coin.buys / total) * 100 : 50;

  const fire = (ts: number) => {
    if (!quickEnabled || migrating) return;
    onQuickBuy(coin.id, quickSol, ts);
    setFlash((n) => n + 1);
  };

  return (
    <div
      data-coin-id={coin.id}
      onClick={() => onOpen(coin.id)}
      className={`anim-card relative flex cursor-pointer gap-3 border-b border-line px-3 py-2.5 transition-colors hover:bg-card-hi ${
        coin.held ? "bg-up/[0.05] shadow-[inset_2px_0_0_var(--color-up)]" : ""
      }`}
    >
      {/* Avatar, launchpad badge, bonding progress, short CA */}
      <div className="flex w-[64px] shrink-0 flex-col items-center gap-1">
        <div className="relative">
          <Art art={coin.art} className="h-[64px] w-[64px] rounded-md" glyphSize={30} />
          <span
            className={`absolute -bottom-1 -right-1 grid h-[16px] w-[16px] place-items-center rounded-full border-2 border-panel text-[8px] font-black ${
              config.launchpad === "pump" ? "bg-up text-black" : "bg-amber text-black"
            }`}
            title={config.launchpad === "pump" ? "Launched on Pump" : "Launched on Bonk"}
          >
            {config.launchpad === "pump" ? "P" : "B"}
          </span>
        </div>
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-line-hi">
          <div className="h-full bg-up" style={{ width: `${Math.round(coin.progress * 100)}%` }} />
        </div>
        <span className="w-full truncate text-center font-mono text-[9.5px] text-faint">{coin.mint}</span>
      </div>

      {/* Identity and on-chain stats */}
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[15px] font-extrabold tracking-tight">{coin.ticker}</span>
          <span className="truncate text-[12px] text-dim">{coin.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Chip className={PAIR_STYLE[config.pair]}>/{config.pair}</Chip>
          {config.dividends ? (
            <Chip className="border-amber bg-amber text-black">DIV</Chip>
          ) : (
            <Chip className="border-line-hi text-faint line-through decoration-1">DIV</Chip>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="tabular text-[12px] font-bold text-up">{ageText}</span>
          <SourceBadge source={coin.source} />
          <Metric icon={<HoldersIcon />} v={coin.holders} title="Holders" />
          <Metric icon={<DevIcon />} v={coin.devMigrated} title="Dev's migrated coins" tone={coin.devMigrated > 0 ? "text-up" : "text-dim"} />
          <Metric icon={<ProIcon />} v={coin.proTraders} title="Pro traders" tone={coin.proTraders > 0 ? "text-amber" : "text-dim"} />
        </div>
        <div className="flex items-center gap-1 overflow-hidden">
          <Pill label="T10" v={coin.stats.top10} warn={25} />
          <Pill label="DEV" v={coin.stats.dev} warn={5} />
          <Pill label="SNP" v={coin.stats.snipers} warn={8} />
          <Pill label="INS" v={coin.stats.insiders} warn={3} />
        </div>
      </div>

      {/* Market data and the buy button */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-1">
        <div className="text-right leading-[1.25]">
          <div className="text-[11px] text-faint">
            MC <span className={`tabular text-[15px] font-extrabold ${coin.stage === "new" ? "text-blue" : "text-up"}`}>{usd(coin.mcUsd)}</span>
          </div>
          <div className="text-[11px] text-faint">
            V <span className="tabular text-[12.5px] font-bold text-ink">{usd(coin.volumeUsd)}</span>
          </div>
          <div className="flex items-center justify-end gap-1.5 text-[10.5px] text-faint">
            <span>
              F <SolIcon /> <span className="tabular text-ink">{sol(coin.feesSol, 3)}</span>
            </span>
            <span>
              TX <span className="tabular text-ink">{coin.txCount}</span>
            </span>
          </div>
          <div className="ml-auto mt-0.5 flex h-[2px] w-12 overflow-hidden rounded-full bg-down/80">
            <div className="h-full bg-up" style={{ width: `${buyPct}%` }} />
          </div>
        </div>
        <span key={flash} className={`rounded-md ${flash ? "anim-flash" : ""}`}>
          <button
            type="button"
            data-fire
            disabled={!quickEnabled || migrating}
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
            className="flex h-8 min-w-[92px] items-center justify-center gap-1 rounded-md bg-buy px-3.5 text-[13px] font-extrabold text-white transition-[filter,transform] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {migrating ? (
              <span className="text-[12px] font-bold">Migrating…</span>
            ) : (
              <>
                <BoltIcon className="h-3.5 w-3.5" />
                <span className="tabular">{fmtAmount(quickSol)}</span>
                <span className="ml-0.5">SOL</span>
              </>
            )}
          </button>
        </span>
      </div>
    </div>
  );
});
