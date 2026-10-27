"use client";

import { useState } from "react";
import type { Engine } from "@/engine/engine";
import { SOL_USD } from "@/engine/curve";
import type { CoinView, LaunchView } from "@/engine/types";
import { sol } from "../format";
import { SolIcon } from "../icons";
import { WALLET_NAMES } from "../Wallets";

const BUY_DEV = [0.25, 0.5, 1, 2];
const BUY_TRADE = [0.1, 0.5, 1, 2];
const SELL = [0.1, 0.25, 0.5, 1];

interface Row {
  key: string;
  name: string;
  tag: "DEV" | "TRADE";
  pct: number;
  buy: (sol: number, ts: number) => void;
  sell: (fraction: number, ts: number) => void;
}

interface Props {
  engine: Engine;
  coin: CoinView;
  launch?: LaunchView;
  devSol: number;
  walletSol: number;
  walletCount: number;
  notify: (text: string) => void;
}

/**
 * Dev mode: one row per wallet with its own buttons, like Proxima's wallet table. Your launch wallets (deployer and
 * the others) and your trading wallets; flip the whole column between buying and selling.
 */
export function WalletColumn({ engine, coin, launch, devSol, walletSol, walletCount, notify }: Props) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const id = coin.id;
  const pcts = engine.walletPcts(id);
  const solOf = (pct: number) => ((pct / 100) * coin.mcUsd) / SOL_USD;

  const rows: Row[] = [];
  if (launch) {
    // The deployer (public: DEV on the chart) and launch wallets 1-10 (they look like anyone).
    const devRows: { from: "deployer" | number; name: string; pct: number }[] = [
      { from: "deployer", name: "Deployer", pct: launch.deployerPct },
      ...launch.launchWalletPcts.map((pct, k) => ({ from: k, name: `Launch wallet ${k + 1}`, pct })),
    ];
    for (const { from, name, pct } of devRows) {
      rows.push({
        key: `dev-${from}`,
        name,
        tag: "DEV",
        pct,
        buy: (v) => {
          const r = engine.devBuy(id, v, from);
          notify(r.ok ? `${name} bought ${v} SOL` : (r.reason ?? "Buy failed"));
        },
        sell: (f) => {
          const r = engine.devSellFrom(id, from, f >= 1 ? "max" : pct * f);
          notify(r.ok ? `${name} sold ${Math.round(f * 100)}% for ${sol(r.sol ?? 0)} SOL` : (r.reason ?? "Sell failed"));
        },
      });
    }
  }
  for (let i = 0; i < walletCount; i++) {
    rows.push({
      key: `w${i}`,
      name: WALLET_NAMES[i],
      tag: "TRADE",
      pct: pcts[i] ?? 0,
      buy: (v, ts) => {
        const t = engine.quickBuy(id, v, engine.fromEventTime(ts), [i]);
        notify(t ? `${WALLET_NAMES[i]} bought ${sol(t.sol)} SOL` : (engine.takeBuyNote() ?? (engine.isMigrating(id) ? "Migrating: buys reopen in a moment" : "Buy failed")));
      },
      sell: (f, ts) => {
        const t = engine.sell(id, f, engine.fromEventTime(ts), "selected", [i]);
        notify(t ? `${WALLET_NAMES[i]} sold ${Math.round(f * 100)}% for ${sol(t.sol)} SOL` : engine.isMigrating(id) ? "Migrating: trading reopens in a moment" : "Nothing in that wallet");
      },
    });
  }

  const buying = side === "buy";
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-line bg-panel">
      <div className="border-b border-line p-2.5">
        <div className="grid grid-cols-2 rounded-lg bg-bg p-0.5" role="radiogroup" aria-label="Buy or sell">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => setSide(s)}
              className={`rounded-md py-1.5 text-[13px] font-black transition-colors ${
                side === s ? (s === "buy" ? "bg-up text-black" : "bg-down text-white") : "text-dim hover:text-ink"
              }`}
            >
              {s === "buy" ? "BUY" : "SELL"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-faint">{buying ? "SOL per wallet" : "% of that wallet's bag"}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {rows.map((r, k) => {
          const firstTrade = r.tag === "TRADE" && (k === 0 || rows[k - 1].tag === "DEV");
          const amounts = buying ? (r.tag === "DEV" ? BUY_DEV : BUY_TRADE) : SELL;
          const cash = r.tag === "DEV" ? devSol : walletSol;
          return (
            <div key={r.key}>
              {firstTrade && launch && <div className="mb-1.5 mt-2 border-t border-line pt-2 text-[10px] font-bold uppercase tracking-wider text-faint">Trading wallets</div>}
              {k === 0 && launch && <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">Launch wallets</div>}
              <div className="rounded-lg border border-line px-2 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] font-bold">
                    {r.name}
                    {r.key === "dev-deployer" && <span className="ml-1 rounded bg-violet/20 px-1 text-[9px] font-black text-violet">DEV</span>}
                  </span>
                  <span className="tabular shrink-0 text-[10.5px] text-dim">
                    {r.pct > 0.0001 ? (
                      <>
                        <span className={r.pct >= 5 ? "font-bold text-amber" : "text-ink"}>{r.pct.toFixed(2)}%</span> · <SolIcon /> {sol(solOf(r.pct))}
                      </>
                    ) : (
                      "empty"
                    )}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-4 gap-1">
                  {amounts.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={buying ? a > cash + 1e-9 : r.pct <= 0.0001}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        if (buying) r.buy(a, e.timeStamp);
                        else r.sell(a, e.timeStamp);
                      }}
                      className={`tabular rounded border py-1 text-[11px] font-bold transition-colors disabled:opacity-30 ${
                        buying ? "border-up/40 text-up enabled:hover:bg-up/10" : "border-down/40 text-down enabled:hover:bg-down/10"
                      }`}
                    >
                      {buying ? a : `${Math.round(a * 100)}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="tabular grid grid-cols-2 gap-1 border-t border-line p-2 text-[10.5px] text-dim">
        <span>
          Dev <SolIcon /> <span className="font-bold text-ink">{sol(devSol)}</span>
        </span>
        <span className="text-right">
          Trading <SolIcon /> <span className="font-bold text-ink">{sol(walletSol)}</span>
        </span>
      </div>
    </aside>
  );
}
