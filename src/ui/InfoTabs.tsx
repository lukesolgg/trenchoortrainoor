"use client";

import { useMemo, useState } from "react";
import type { CoinView, Order, Position, TapeEntry } from "@/engine/types";
import { Rng } from "@/engine/rng";
import { age, sol, signed, usd } from "./format";
import { FireButton } from "./TradePanel";
import { SolIcon } from "./icons";
import { TradeTape } from "./TradeTape";

type Tab = "trades" | "positions" | "orders" | "holders" | "traders" | "dev";

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const Th = ({ children, right, first, last }: { children: React.ReactNode; right?: boolean; first?: boolean; last?: boolean }) => (
  <th className={`py-1.5 font-semibold ${right ? "text-right" : "text-left"} ${first ? "pl-4" : ""} ${last ? "pr-4" : ""}`}>{children}</th>
);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-5 text-[12.5px] text-faint">{children}</p>;

const HEAD = "sticky top-0 z-10 bg-panel text-[10.5px] uppercase tracking-wider text-faint";

interface Props {
  coin: CoinView;
  tape: readonly TapeEntry[];
  now: number;
  positions: { position: Position; ticker: string; name: string }[];
  orders: Order[];
  /** Your average entry on this coin, USD market cap. */
  entryMcUsd: number | null;
  held: boolean;
  onSellCoin: (coinId: string, fraction: number, eventTs: number) => void;
  onOpenCoin: (coinId: string) => void;
  onAddOrder: (kind: Order["kind"], triggerMcUsd: number, fraction: number) => void;
  onCancelOrder: (id: number) => void;
  currentId: string;
  /** Known holders: you, the dev and KOLs (% of supply). */
  holders: { youPct: number; devPct: number; kols: { name: string; handle: string; pct: number }[] };
}

/** The one panel under the chart. Holders, top holders and dev tokens are modelled, not real wallets. */
export function InfoTabs(p: Props) {
  const { coin, tape, now, positions, orders, currentId } = p;
  const [tab, setTab] = useState<Tab>("holders");
  const coinOrders = orders.filter((o) => o.coinId === currentId);
  const openOrders = coinOrders.filter((o) => o.status === "open").length;

  const tabs: { id: Tab; label: React.ReactNode }[] = [
    { id: "trades", label: "Trades" },
    { id: "positions", label: <>Positions{positions.length > 0 && <Count n={positions.length} />}</> },
    { id: "orders", label: <>Orders{openOrders > 0 && <Count n={openOrders} />}</> },
    { id: "holders", label: <>Holders <span className="tabular text-faint">({compact(coin.holders)})</span></> },
    { id: "traders", label: "Top Traders" },
    { id: "dev", label: <>Dev Tokens <span className="tabular text-faint">({devTokens(coin).length})</span></> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={`relative flex h-full items-center gap-1 px-3 text-[13px] font-semibold transition-colors ${
              tab === x.id ? "text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-ink" : "text-dim hover:text-ink"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "trades" && <TradeTape tape={tape} now={now} />}
        {tab === "positions" && <Positions {...p} />}
        {tab === "orders" && <Orders {...p} orders={coinOrders} />}
        {tab === "holders" && <Holders coin={coin} known={p.holders} />}
        {tab === "traders" && <Traders tape={tape} />}
        {tab === "dev" && <DevTokens coin={coin} />}
      </div>
    </div>
  );
}

const Count = ({ n }: { n: number }) => <span className="tabular ml-0.5 rounded bg-card-hi px-1 text-[10.5px] text-dim">{n}</span>;

function Positions({ positions, onOpenCoin, onSellCoin, currentId }: Props) {
  if (positions.length === 0) return <Empty>No positions yet.</Empty>;
  return (
    <table className="w-full text-[12.5px]">
      <thead className={HEAD}>
        <tr>
          <Th first>Token</Th>
          <Th right>Bought</Th>
          <Th right>Sold</Th>
          <Th right>Value</Th>
          <Th right>PnL</Th>
          <Th right last>Sell</Th>
        </tr>
      </thead>
      <tbody>
        {positions.map(({ position: pos, ticker }) => {
          const pnl = pos.soldSol + pos.valueSol - pos.boughtSol - pos.promoSol;
          const pct = pos.boughtSol > 0 ? (pnl / (pos.boughtSol + pos.promoSol)) * 100 : 0;
          const open = pos.tokens > 1e-6;
          return (
            <tr
              key={pos.coinId}
              onClick={() => onOpenCoin(pos.coinId)}
              className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-card-hi ${pos.coinId === currentId ? "bg-card" : ""}`}
              title="Open this coin's chart"
            >
              <td className="py-1.5 pl-4 font-bold">
                {ticker}
                {pos.coinId === currentId && <span className="ml-1.5 text-[9.5px] font-semibold text-up">viewing</span>}
              </td>
              <td className="tabular py-1.5 text-right"><SolIcon /> {sol(pos.boughtSol)}</td>
              <td className="tabular py-1.5 text-right"><SolIcon /> {sol(pos.soldSol)}</td>
              <td className="tabular py-1.5 text-right"><SolIcon /> {sol(pos.valueSol)}</td>
              <td className={`tabular py-1.5 text-right font-semibold ${pnl >= 0 ? "text-up" : "text-down"}`}>
                {signed(pnl)} <span className="text-[10.5px] opacity-70">{signed(pct, 0)}%</span>
              </td>
              <td className="py-1.5 pr-4">
                <div className="ml-auto flex w-[136px] gap-1" onClick={(e) => e.stopPropagation()}>
                  <FireButton tone="sell" outline h="h-7" disabled={!open} label="50%" onFire={(ts) => onSellCoin(pos.coinId, 0.5, ts)} />
                  <FireButton tone="sell" outline h="h-7" disabled={!open} label="100%" onFire={(ts) => onSellCoin(pos.coinId, 1, ts)} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const SELL_FRACTIONS = [0.25, 0.5, 1];

function Orders({ orders, held, entryMcUsd, coin, onAddOrder, onCancelOrder, now }: Props) {
  const [kind, setKind] = useState<Order["kind"]>("tp");
  const [pct, setPct] = useState("100");
  const [fraction, setFraction] = useState(0.5);
  const base = entryMcUsd ?? coin.mcUsd;
  const n = parseFloat(pct);
  const valid = Number.isFinite(n) && n > 0 && (kind === "tp" || n < 100);
  const trigger = valid ? base * (kind === "tp" ? 1 + n / 100 : 1 - n / 100) : 0;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-[12.5px]">
        <div className="flex overflow-hidden rounded-md border border-line-hi font-bold">
          {(["tp", "sl"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setPct(k === "tp" ? "100" : "30");
              }}
              className={`px-3 py-1 ${kind === k ? (k === "tp" ? "bg-up/20 text-up" : "bg-down/20 text-down") : "text-dim hover:text-ink"}`}
            >
              {k === "tp" ? "Take profit" : "Stop loss"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-dim">
          at {kind === "tp" ? "+" : "-"}
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            inputMode="decimal"
            className="tabular w-14 rounded-md border border-line-hi bg-card px-2 py-1 text-right font-bold text-ink outline-none focus:border-buy"
            aria-label="Trigger percent from your entry"
          />
          % from entry
          {valid && <span className="tabular font-semibold text-ink">→ MC {usd(trigger)}</span>}
        </label>
        <div className="flex items-center gap-1.5 text-dim">
          sell
          {SELL_FRACTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFraction(f)}
              className={`tabular rounded-md border px-2 py-1 font-bold ${fraction === f ? "border-ink/60 text-ink" : "border-line-hi text-dim hover:text-ink"}`}
            >
              {f * 100}%
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!held || !valid}
          onClick={() => onAddOrder(kind, trigger, fraction)}
          className="ml-auto rounded-md bg-buy px-4 py-1.5 text-[12.5px] font-extrabold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          title={held ? undefined : "Buy first to set a TP or SL"}
        >
          Place order
        </button>
      </div>
      {orders.length === 0 ? (
        <Empty>{held ? "No orders on this coin. Set a take profit or stop loss above." : "Buy this coin to set a take profit or stop loss."}</Empty>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead className={HEAD}>
            <tr>
              <Th first>Type</Th>
              <Th right>Trigger MC</Th>
              <Th right>Sell</Th>
              <Th right>Status</Th>
              <Th right>Age</Th>
              <Th right last> </Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-line/60">
                <td className={`py-1.5 pl-4 font-bold ${o.kind === "tp" ? "text-up" : "text-down"}`}>{o.kind === "tp" ? "Take profit" : "Stop loss"}</td>
                <td className="tabular py-1.5 text-right">{usd(o.triggerMcUsd)}</td>
                <td className="tabular py-1.5 text-right">{Math.round(o.fraction * 100)}%</td>
                <td className={`py-1.5 text-right font-semibold ${o.status === "filled" ? "text-up" : o.status === "open" ? "text-amber" : "text-faint"}`}>
                  {o.status === "filled" ? (
                    <>
                      Filled <SolIcon /> {sol(o.filledSol ?? 0)}
                    </>
                  ) : o.status === "open" ? (
                    "Open"
                  ) : (
                    "Cancelled"
                  )}
                </td>
                <td className="tabular py-1.5 text-right text-faint">{age(now - o.createdAt)}</td>
                <td className="py-1.5 pr-4 text-right">
                  {o.status === "open" && (
                    <button type="button" onClick={() => onCancelOrder(o.id)} className="text-[12px] font-semibold text-dim hover:text-down">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const StatBox = ({ k, v, bad }: { k: string; v: string; bad?: boolean }) => (
  <div className="px-4 py-2">
    <div className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular text-[15px] font-bold ${bad === undefined ? "text-ink" : bad ? "text-down" : "text-up"}`}>{v}</div>
  </div>
);

/** Modelled top-10 split: shares descend and add up to the coin's Top 10 %. Wallets are stable per coin. */
interface HolderRow {
  key: string;
  label: string;
  pct: number;
  tag: "LP" | "YOU" | "DEV" | "KOL" | "";
  pic?: string;
}

/**
 * Top holders: the pool, you, the dev and any KOLs in it are real numbers from the sim; the rest of the top 10 is a
 * modelled split of the coin's Top 10 %, with wallets that stay the same for this coin.
 */
function topHolders(coin: CoinView, known: Props["holders"]): HolderRow[] {
  const r = new Rng(hash(coin.id));
  const rows: HolderRow[] = [];
  if (coin.stage === "migrated") rows.push({ key: "lp", label: "Liquidity pool", pct: coin.mcUsd > 0 ? (coin.liqUsd / 2 / coin.mcUsd) * 100 : 0, tag: "LP" });
  const named: HolderRow[] = [];
  if (known.youPct > 0.001) named.push({ key: "you", label: "You", pct: known.youPct, tag: "YOU" });
  if (known.devPct > 0.001) named.push({ key: "dev", label: "Dev wallet", pct: known.devPct, tag: "DEV" });
  for (const k of known.kols) named.push({ key: `kol-${k.handle}`, label: k.name, pct: k.pct, tag: "KOL", pic: `/kols/${k.handle.toLowerCase()}.jpg` });
  const fill = Math.max(0, 10 - named.length);
  const weights = Array.from({ length: fill }, (_, i) => Math.pow(0.78, i) * r.range(0.8, 1.2)).sort((a, b) => b - a);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const rest = Math.max(1, coin.stats.top10 - named.reduce((n, h) => n + h.pct, 0));
  const anon = weights.map((w) => ({ key: r.addr(4), label: "", pct: (w / sum) * rest, tag: "" as const }));
  for (const a of anon) a.label = a.key;
  return [...rows, ...[...named, ...anon].sort((a, b) => b.pct - a.pct)];
}

const TAG_STYLE: Record<HolderRow["tag"], string> = {
  LP: "border-line-hi text-dim",
  YOU: "border-blue/60 bg-blue/15 text-blue",
  DEV: "border-amber/60 bg-amber/15 text-amber",
  KOL: "border-violet/60 bg-violet/15 text-violet",
  "": "",
};

function Holders({ coin, known }: { coin: CoinView; known: Props["holders"] }) {
  const rows = topHolders(coin, known);
  return (
    <div>
      <div className="grid grid-cols-6 border-b border-line">
        <StatBox k="Holders" v={coin.holders.toLocaleString("en-US")} />
        <StatBox k="Top 10" v={`${coin.stats.top10}%`} bad={coin.stats.top10 >= 25} />
        <StatBox k="You hold" v={`${known.youPct.toFixed(2)}%`} bad={known.youPct >= 4} />
        <StatBox k="Dev holds" v={`${known.devPct.toFixed(2)}%`} bad={known.devPct >= 5} />
        <StatBox k="KOLs in" v={String(known.kols.length)} />
        <StatBox k="Bonded" v={coin.stage === "migrated" ? "100%" : `${Math.round(coin.progress * 100)}%`} />
      </div>
      <table className="w-full text-[12.5px]">
        <thead className={HEAD}>
          <tr>
            <Th first>#</Th>
            <Th>Holder</Th>
            <Th right>% of supply</Th>
            <Th right last>Value</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr key={h.key} className={`border-b border-line/60 ${h.tag === "YOU" ? "bg-blue/[0.07]" : ""}`}>
              <td className="tabular py-1.5 pl-4 text-faint">{i + 1}</td>
              <td className="py-1.5">
                <span className="flex items-center gap-2">
                  {h.pic && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.pic} alt="" className="h-5 w-5 rounded-full object-cover" />
                  )}
                  <span className={h.tag ? "font-semibold text-ink" : "font-mono text-dim"}>{h.label}</span>
                  {h.tag && <span className={`rounded border px-1 text-[9.5px] font-black ${TAG_STYLE[h.tag]}`}>{h.tag}</span>}
                </span>
              </td>
              <td className="tabular py-1.5 text-right">
                <span className="mr-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-line align-middle">
                  <span className={`block h-full ${h.tag === "YOU" ? "bg-blue" : h.pct >= 4 && h.tag !== "LP" ? "bg-down/80" : "bg-up/70"}`} style={{ width: `${Math.min(100, h.pct * 4)}%` }} />
                </span>
                {h.pct.toFixed(2)}%
              </td>
              <td className="tabular py-1.5 pr-4 text-right text-dim">{usd((coin.mcUsd * h.pct) / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Traders({ tape }: { tape: readonly TapeEntry[] }) {
  const traders = useMemo(() => {
    const by = new Map<string, { buy: number; sell: number; n: number }>();
    for (const t of tape) {
      const r = by.get(t.trader) ?? { buy: 0, sell: 0, n: 0 };
      if (t.side === "buy") r.buy += t.sol;
      else r.sell += t.sol;
      r.n++;
      by.set(t.trader, r);
    }
    return [...by.entries()].map(([trader, r]) => ({ trader, ...r, net: r.sell - r.buy })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 20);
  }, [tape]);
  if (traders.length === 0) return <Empty>No trades yet.</Empty>;
  return (
    <table className="w-full text-[12.5px]">
      <thead className={HEAD}>
        <tr>
          <Th first>Trader</Th>
          <Th right>Bought</Th>
          <Th right>Sold</Th>
          <Th right>Txns</Th>
          <Th right last>Net (SOL)</Th>
        </tr>
      </thead>
      <tbody>
        {traders.map((r) => (
          <tr key={r.trader} className="border-b border-line/60">
            <td className={`py-1.5 pl-4 font-mono ${r.trader === "You" ? "font-bold text-blue" : "text-dim"}`}>{r.trader}</td>
            <td className="tabular py-1.5 text-right text-up">{sol(r.buy)}</td>
            <td className="tabular py-1.5 text-right text-down">{sol(r.sell)}</td>
            <td className="tabular py-1.5 text-right text-faint">{r.n}</td>
            <td className={`tabular py-1.5 pr-4 text-right font-semibold ${r.net >= 0 ? "text-up" : "text-down"}`}>{signed(r.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const DEV_NAMES = ["MOON", "PEPE2", "CAT", "DOGE3", "WAGMI", "FROG", "SEND", "GIGA", "BONKER", "TRUMPY", "AIDOG", "RUG", "LFG", "COPE", "BASED"];

/** The deployer's earlier launches: as many migrated ones as the card's dev stat says, plus some that died. */
function devTokens(coin: CoinView) {
  const r = new Rng(hash(coin.id) ^ 0x5bd1e995);
  const dead = r.int(0, 4);
  const list = Array.from({ length: coin.devMigrated + dead }, (_, i) => {
    const migrated = i < coin.devMigrated;
    return {
      ticker: r.pick(DEV_NAMES),
      migrated,
      athUsd: migrated ? Math.exp(r.range(Math.log(50000), Math.log(3000000))) : r.range(4000, 30000),
      nowUsd: 0,
      ageDays: r.int(1, 120),
    };
  });
  for (const t of list) t.nowUsd = t.athUsd * (t.migrated ? r.range(0.05, 0.6) : r.range(0.1, 0.5));
  return list.sort((a, b) => a.ageDays - b.ageDays);
}

function DevTokens({ coin }: { coin: CoinView }) {
  const list = useMemo(() => devTokens(coin), [coin]);
  if (list.length === 0) return <Empty>First launch from this deployer.</Empty>;
  return (
    <table className="w-full text-[12.5px]">
      <thead className={HEAD}>
        <tr>
          <Th first>Token</Th>
          <Th right>Status</Th>
          <Th right>ATH MC</Th>
          <Th right>MC now</Th>
          <Th right last>Age</Th>
        </tr>
      </thead>
      <tbody>
        {list.map((t, i) => (
          <tr key={i} className="border-b border-line/60">
            <td className="py-1.5 pl-4 font-bold">{t.ticker}</td>
            <td className={`py-1.5 text-right font-semibold ${t.migrated ? "text-up" : "text-faint"}`}>{t.migrated ? "Migrated" : "Died on curve"}</td>
            <td className="tabular py-1.5 text-right">{usd(t.athUsd)}</td>
            <td className="tabular py-1.5 text-right text-dim">{usd(t.nowUsd)}</td>
            <td className="tabular py-1.5 pr-4 text-right text-faint">{t.ageDays}d</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
