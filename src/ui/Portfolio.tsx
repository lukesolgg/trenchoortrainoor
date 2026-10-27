"use client";

import { useMemo } from "react";
import { SOL_USD } from "@/engine/curve";
import type { ArtSpec, Position } from "@/engine/types";
import { useHistory } from "@/store/history";
import { Art } from "./Art";
import { signed, sol, usd } from "./format";
import { FireButton } from "./TradePanel";
import { SolIcon } from "./icons";

export interface OpenRow {
  position: Position;
  ticker: string;
  name: string;
  art: ArtSpec;
}

interface Props {
  walletSol: number;
  open: OpenRow[];
  onOpenCoin: (coinId: string) => void;
  onSell: (coinId: string, fraction: number, eventTs: number) => void;
}

const Card = ({ k, children, sub, tone }: { k: string; children: React.ReactNode; sub?: string; tone?: string }) => (
  <div className="rounded-xl border border-line bg-card p-4">
    <div className="text-[10.5px] font-bold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular mt-1.5 text-[24px] font-extrabold leading-none ${tone ?? "text-ink"}`}>{children}</div>
    {sub && <div className="tabular mt-1.5 text-[11.5px] text-faint">{sub}</div>}
  </div>
);

/** Cumulative realised PnL as a small area chart. */
function Equity({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="grid h-[140px] place-items-center text-[12px] text-faint">Close a few trades to see your curve.</div>;
  const w = 800;
  const h = 140;
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - 8 - ((v - min) / span) * (h - 16);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= 0;
  const c = up ? "#35d07f" : "#f0455a";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[140px] w-full" role="img" aria-label="Cumulative realised PnL">
      <path d={`${line} L${w},${y(0)} L0,${y(0)} Z`} fill={c} fillOpacity={0.12} />
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="#2a2d34" strokeDasharray="4 4" />
      <path d={line} fill="none" stroke={c} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function Portfolio({ walletSol, open, onOpenCoin, onSell }: Props) {
  const trades = useHistory((s) => s.trades);
  const clear = useHistory((s) => s.clear);

  const stats = useMemo(() => {
    let total = 0;
    let wins = 0;
    let best: { ticker: string; pnl: number } | null = null;
    const curve: number[] = [];
    for (const t of trades) {
      const pnl = t.returned - t.invested;
      total += pnl;
      if (pnl > 0) wins++;
      if (!best || pnl > best.pnl) best = { ticker: t.ticker, pnl };
      curve.push(total);
    }
    return { total, wins, best, curve };
  }, [trades]);

  const bagValue = open.reduce((a, r) => a + r.position.valueSol, 0);
  const openPositions = open.filter((r) => r.position.tokens > 1e-6);

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Portfolio</h1>
        <span className="rounded border border-line-hi px-1.5 py-px text-[10px] font-bold text-dim">SIM</span>
        <span className="text-[12.5px] text-dim">Your play wallet, your bags and your PnL</span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        <Card k="Play wallet" sub={usd(walletSol * SOL_USD)}><SolIcon /> {sol(walletSol)}</Card>
        <Card k="In your bags" sub={`${openPositions.length} open · ${usd(bagValue * SOL_USD)}`}><SolIcon /> {sol(bagValue)}</Card>
        <Card k="Realised · all time" sub={`${trades.length} closed`} tone={stats.total >= 0 ? "text-up" : "text-down"}>
          {signed(stats.total, 1)} SOL
        </Card>
        <Card k="Best trade" sub={stats.best ? `${signed(stats.best.pnl, 1)} SOL` : "No trades yet"} tone="text-up">
          {stats.best ? `$${stats.best.ticker}` : "-"}
        </Card>
      </div>

      <h2 className="mt-7 text-[12px] font-bold uppercase tracking-wider text-dim">
        Open positions <span className="ml-1 rounded-full bg-card-hi px-2 py-px text-faint">{openPositions.length}</span>
      </h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-line">
        {openPositions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-faint">No open positions. Buy something on Trenches.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-nav text-[10.5px] uppercase tracking-wider text-faint">
              <tr>
                <th className="py-2 pl-4 text-left font-semibold">Token</th>
                <th className="py-2 text-right font-semibold">Invested</th>
                <th className="py-2 text-right font-semibold">Value</th>
                <th className="py-2 text-right font-semibold">PnL</th>
                <th className="w-[160px] py-2 pr-4 text-right font-semibold">Sell</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map(({ position: p, ticker, name, art }) => {
                const pnl = p.soldSol + p.valueSol - p.boughtSol - p.promoSol;
                return (
                  <tr key={p.coinId} onClick={() => onOpenCoin(p.coinId)} className="cursor-pointer border-t border-line/60 transition-colors hover:bg-card-hi">
                    <td className="py-2 pl-4">
                      <div className="flex items-center gap-3">
                        <Art art={art} className="h-8 w-8 rounded-lg border border-line-hi" glyphSize={16} />
                        <div className="leading-tight">
                          <div className="font-bold">${ticker}</div>
                          <div className="text-[11.5px] text-dim">{name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular py-2 text-right"><SolIcon />{sol(p.boughtSol)}</td>
                    <td className="tabular py-2 text-right"><SolIcon />{sol(p.valueSol)}</td>
                    <td className={`tabular py-2 text-right font-semibold ${pnl >= 0 ? "text-up" : "text-down"}`}>{signed(pnl)}</td>
                    <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="ml-auto flex w-[140px] gap-1.5">
                        <FireButton tone="sell" outline pill h="h-7" label="50%" onFire={(ts) => onSell(p.coinId, 0.5, ts)} />
                        <FireButton tone="sell" outline pill h="h-7" label="100%" onFire={(ts) => onSell(p.coinId, 1, ts)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-7 flex items-baseline justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-dim">
          Trade history · all time <span className="ml-1 rounded-full bg-card-hi px-2 py-px text-faint">{trades.length}</span>
        </h2>
        {trades.length > 0 && (
          <button type="button" onClick={clear} className="text-[11px] text-faint hover:text-down">
            Clear history
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[260px_1fr] items-center gap-6 rounded-xl border border-line bg-card p-4">
        <div>
          <div className={`tabular text-[30px] font-black leading-none ${stats.total >= 0 ? "text-up" : "text-down"}`}>{signed(stats.total, 1)} SOL</div>
          <div className="mt-2 text-[12px] leading-snug text-dim">
            {trades.length} closed · {trades.length ? Math.round((stats.wins / trades.length) * 100) : 0}% in profit · kept in this browser
          </div>
        </div>
        <Equity points={stats.curve} />
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-nav text-[10.5px] uppercase tracking-wider text-faint">
            <tr>
              <th className="py-2 pl-4 text-left font-semibold">Token</th>
              <th className="py-2 text-left font-semibold">Closed</th>
              <th className="py-2 text-right font-semibold">Invested</th>
              <th className="py-2 text-right font-semibold">Returned</th>
              <th className="py-2 pr-4 text-right font-semibold">PnL</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-faint">
                  Nothing closed yet.
                </td>
              </tr>
            )}
            {[...trades].reverse().map((t) => {
              const pnl = t.returned - t.invested;
              return (
                <tr key={t.key} className="border-t border-line/60">
                  <td className="py-2 pl-4">
                    <span className="font-bold">${t.ticker}</span> <span className="text-dim">{t.name}</span>
                  </td>
                  <td className="tabular py-2 text-dim">{when(t.closedAt)}</td>
                  <td className="tabular py-2 text-right">{sol(t.invested, 2)} <span className="text-faint">SOL</span></td>
                  <td className="tabular py-2 text-right">{sol(t.returned, 3)} <span className="text-faint">SOL</span></td>
                  <td className={`tabular py-2 pr-4 text-right font-semibold ${pnl >= 0 ? "text-up" : "text-down"}`}>
                    {signed(pnl, 3)} <span className="text-faint">· {signed(t.invested > 0 ? (pnl / t.invested) * 100 : 0, 1)}%</span>
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
