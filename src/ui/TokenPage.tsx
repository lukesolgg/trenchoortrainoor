"use client";

import { WalletColumn } from "./dev/WalletColumn";
import { DevOps } from "./dev/DevOps";
import { KOL_BUBBLE_TIER, type Features } from "@/campaign/progression";
import { buyWarning, WALLET_NAMES } from "./Wallets";
import { useEffect, useRef, useState } from "react";
import { MIGRATION_MC_USD, SOL_USD, SUPPLY } from "@/engine/curve";
import type { Engine } from "@/engine/engine";
import type { Snapshot } from "@/engine/types";
import { Art } from "./Art";
import { PAIR_STYLE } from "./chips";
import { ChartPanel, type ChartHandle, type Metric, type ScaleMode, type Unit } from "./ChartPanel";
import { fmtPrice } from "./chartData";
import { InfoTabs } from "./InfoTabs";
import { BoltIcon } from "./icons";
import { SolIcon } from "./icons";
import { SourceBadge } from "./SourceBadge";
import { QuickWidget } from "./QuickWidget";
import { useUi } from "@/store/ui";
import { age, sol, usd } from "./format";
import { TradePanel } from "./TradePanel";

const Stat = ({ k, v, tone, sub }: { k: string; v: React.ReactNode; tone?: string; sub?: string }) => (
  <div className="leading-tight">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular text-[14px] font-bold ${tone ?? "text-ink"}`}>{v}</div>
    {sub && <div className="tabular text-[10px] text-faint">{sub}</div>}
  </div>
);

const TFS = [
  { s: 1, label: "1s" },
  { s: 5, label: "5s" },
  { s: 15, label: "15s" },
  { s: 30, label: "30s" },
  { s: 60, label: "1m" },
];

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-line-hi text-[11px] font-bold">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-2 py-1 transition-colors ${value === o.v ? "bg-card-hi text-ink" : "text-dim hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Tool = ({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="rounded-md border border-line-hi px-2 py-1 text-[11px] font-semibold text-dim transition-colors hover:text-ink"
  >
    {children}
  </button>
);

interface Props {
  engine: Engine;
  snap: Snapshot;
  coinId: string;
  wallStart: number;
  buyPresets: number[];
  onBuyPresets: (p: number[]) => void;
  presetSet: number;
  onPresetSet: (i: number) => void;
  onBack: () => void;
  /** Jump to another coin's page. */
  onOpen: (coinId: string) => void;
  notify: (text: string) => void;
  /** What this player may use (campaign levels; everything in the standalone modes). */
  features: Features;
  /** Dev mode: open a launch's report card. */
  onLaunchReport?: (coinId: string) => void;
}

/** Toggle the chart's social layers: dev trades, KOL trades, boosts. */
function SocialMenu() {
  const social = useUi((u) => u.social);
  const toggle = useUi((u) => u.toggleSocial);
  const [open, setOpen] = useState(false);
  const on = Object.values(social).filter(Boolean).length;
  const rows: { k: "dev" | "kol" | "boost" | "news"; label: string; hint: string }[] = [
    { k: "dev", label: "Dev buys & sells", hint: "DEV" },
    { k: "kol", label: "KOL buys & sells", hint: "●" },
    { k: "boost", label: "Boosts", hint: "🚀" },
    { k: "news", label: "Tweets, DEX paid, CTO", hint: "𝕏" },
  ];
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-bold transition-colors ${
          on ? "border-line-hi text-ink" : "border-line text-faint"
        }`}
      >
        Socials <span className="tabular text-[10.5px] text-dim">{on}/4</span> <span className="text-[9px] text-faint">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 pt-1">
          <div className="w-52 rounded-lg border border-line-hi bg-card p-1.5 shadow-2xl">
            {rows.map((r) => (
              <label key={r.k} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-card-hi">
                <input type="checkbox" checked={social[r.k]} onChange={() => toggle(r.k)} className="accent-[var(--color-buy)]" />
                <span className="w-7 text-center text-[11px] font-black text-amber">{r.hint}</span>
                {r.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TokenPage({ engine, snap, coinId, wallStart, buyPresets, onBuyPresets, presetSet, onPresetSet, onBack, onOpen, notify, features, onLaunchReport }: Props) {
  const coin = engine.getCoinView(coinId);
  const kol = engine.getKol();
  const launch = snap.launches.find((l) => l.coinId === coinId);
  const devMode = snap.devSol !== null;
  const tape = engine.getTape(coinId);
  const position = snap.positions.find((p) => p.coinId === coinId);
  const instant = useUi((u) => u.instantTrade);
  const setInstant = useUi((u) => u.setInstantTrade);
  const chart = useRef<ChartHandle>(null);
  const social = useUi((u) => u.social);
  const [tf, setTf] = useState(1);
  const [metric, setMetric] = useState<Metric>("mc");
  const [unit, setUnit] = useState<Unit>("usd");
  const [scale, setScale] = useState<ScaleMode>("auto");
  const [widgetOpen, setWidgetOpen] = useState(true);

  const buy = (amount: number, eventTs: number) => {
    const trade = engine.quickBuy(coinId, amount, engine.fromEventTime(eventTs));
    notify(
      buyWarning(engine, coinId, trade !== null) ??
      (trade
        ? `Bought ${sol(trade.sol)} SOL of ${coin?.ticker ?? "coin"} · ${trade.rank} bot buys ahead of you`
        : engine.isMigrating(coinId)
          ? "Migrating: buys reopen in a moment"
          : "Buy failed: not enough SOL, or the curve is complete"),
    );
  };

  const sell = (fraction: number, eventTs: number) => {
    const trade = engine.sell(coinId, fraction, engine.fromEventTime(eventTs));
    notify(
      trade
        ? `Sold ${Math.round(fraction * 100)}% for ${sol(trade.sol)} SOL`
        : engine.isMigrating(coinId)
          ? "Migrating: trading reopens in a moment"
          : "Nothing to sell",
    );
  };

  // Buy hotkeys 1-8 fire the active preset set (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog over the page (launch panel, launch card) owns the keyboard.
      if (e.target instanceof HTMLInputElement || e.repeat || document.querySelector("[data-modal]")) return;
      const i = ["1", "2", "3", "4", "5", "6", "7", "8"].indexOf(e.key);
      if (i < 0 || i >= buyPresets.length) return;
      e.preventDefault();
      const trade = engine.quickBuy(coinId, buyPresets[i], engine.fromEventTime(e.timeStamp));
      const ticker = engine.getCoinView(coinId)?.ticker ?? "coin";
      notify(
        trade
          ? `Bought ${sol(trade.sol)} SOL of ${ticker} · ${trade.rank} bot buys ahead of you`
          : engine.isMigrating(coinId)
            ? "Migrating: buys reopen in a moment"
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

  const first = engine.getCandles(coinId)[0];
  const buyLocked = coin.migratingUntil !== null && coin.migratingUntil > snap.now;
  const lockSecs = buyLocked ? ((coin.migratingUntil ?? 0) - snap.now) / 1000 : 0;
  const changePct = first && first.o > 0 ? (coin.mcSol / first.o - 1) * 100 : 0;
  const toggleInstant = () => {
    setInstant(!instant);
    if (!instant) setWidgetOpen(true);
  };
  const positionRows = snap.positions
    .filter((p) => p.tokens > 1e-6 || p.boughtSol > 0 || p.promoSol > 0)
    .map((p) => ({ position: p, ticker: engine.getCoinView(p.coinId)?.ticker ?? "?", name: engine.getCoinView(p.coinId)?.name ?? "" }));
  const sellCoin = (id: string, fraction: number, ts: number) => {
    const trade = engine.sell(id, fraction, engine.fromEventTime(ts));
    notify(
      trade
        ? `Sold ${Math.round(fraction * 100)}% for ${sol(trade.sol)} SOL`
        : engine.isMigrating(id)
          ? "Migrating: trading reopens in a moment"
          : "Nothing to sell",
    );
  };

  const entryMcUsd =
    position && position.boughtTokens > 0 ? (position.boughtSol / position.boughtTokens) * SUPPLY * SOL_USD : null;
  const priceUsd = coin.mcUsd / SUPPLY;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-4 border-b border-line bg-nav px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line-hi px-2.5 py-1.5 text-[12px] font-semibold text-dim transition-colors hover:text-ink"
        >
          ← <kbd className="text-faint">Esc</kbd>
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <Art art={coin.art} className="h-11 w-11 rounded-lg border border-line-hi" glyphSize={22} />
            <span
              className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-nav text-[8px] font-black ${
                coin.config.launchpad === "pump" ? "bg-up text-black" : "bg-amber text-black"
              }`}
            >
              {coin.config.launchpad === "pump" ? "P" : "B"}
            </span>
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[18px] font-extrabold tracking-tight">{coin.ticker}</span>
              <span className={`rounded border px-1.5 py-px text-[10px] font-bold ${PAIR_STYLE[coin.config.pair]}`}>/{coin.config.pair}</span>
              {coin.config.dividends && (
                <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-px text-[10px] font-bold text-amber">DIV</span>
              )}
              {coin.config.launchpad === "bonk" && (
                <span className="rounded border border-line-hi bg-white/5 px-1.5 py-px text-[10px] font-bold text-dim">BONK</span>
              )}
            </div>
            <div className="truncate text-[12px] text-dim">{coin.name}</div>
            <div className="mt-0.5 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]">
              <span className="tabular font-bold text-up">{age(snap.now - coin.createdAt)}</span>
              <span
                className={`rounded-full border px-2 py-px text-[10px] font-bold ${
                  coin.config.launchpad === "pump" ? "border-up/40 bg-up/10 text-up" : "border-amber/40 bg-amber/10 text-amber"
                }`}
              >
                {coin.config.launchpad === "pump" ? "Pump" : "Bonk"}
              </span>
              <SourceBadge source={coin.source} />
              <span className="truncate font-mono text-faint">{coin.mint}</span>
            </div>
          </div>
        </div>

        <div className="ml-2 leading-none">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">Market cap</div>
          <div className={`tabular mt-1 text-[26px] font-black tracking-tight ${coin.stage === "new" ? "text-blue" : "text-up"}`}>
            {usd(coin.mcUsd)}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <Stat k="Price" v={`$${fmtPrice(priceUsd)}`} />
          <Stat k="Liquidity" v={usd(coin.liqUsd)} />
          <Stat k="Supply" v="1B" />
          <Stat k="Global fees" v={<><SolIcon /> {sol(coin.feesSol, 3)}</>} />
          <Stat k="B.Curve" v={`${(coin.progress * 100).toFixed(2)}%`} sub={coin.stage === "migrated" ? "migrated" : `→ ${usd(MIGRATION_MC_USD)}`} />
          <Stat k="Holders" v={String(coin.holders)} />
          <Stat k="Top 10 H." v={`${coin.stats.top10.toFixed(2)}%`} tone={coin.stats.top10 >= 25 ? "text-down" : "text-up"} />
          <Stat k="Dev H." v={`${coin.stats.dev.toFixed(2)}%`} tone={coin.stats.dev >= 5 ? "text-down" : "text-up"} />
          <button
            type="button"
            onClick={toggleInstant}
            aria-pressed={instant}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
              instant ? "border-buy bg-buy/20 text-[#9db0ff]" : "border-line-hi text-dim hover:text-ink"
            }`}
          >
            <BoltIcon className="h-3 w-3" /> Instant Trade
          </button>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 ${devMode ? "grid-cols-[minmax(0,1fr)_340px_250px]" : "grid-cols-[minmax(0,1fr)_380px]"}`}>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-b border-line bg-nav px-3 [scrollbar-width:none]">
            <Seg value={tf} options={TFS.map((t) => ({ v: t.s, label: t.label }))} onChange={setTf} />
            <span className="h-4 w-px bg-line-hi" />
            <Seg value={metric} options={[{ v: "price", label: "Price" }, { v: "mc", label: "MC" }]} onChange={setMetric} />
            <Seg value={unit} options={[{ v: "usd", label: "USD" }, { v: "sol", label: "SOL" }]} onChange={setUnit} />
            <SocialMenu />
            <span className="h-4 w-px bg-line-hi" />
            <Tool onClick={() => chart.current?.firstCandle()} title="Jump to the first candle">First candle</Tool>
            <Tool onClick={() => chart.current?.fit()} title="Fit all candles">Fit</Tool>
            <Tool onClick={() => chart.current?.live()} title="Jump to the latest candle">Live</Tool>
            <div className="ml-auto flex items-center gap-2">
              <Tool onClick={() => chart.current?.screenshot()} title="Save chart as PNG">Screenshot</Tool>
              <Tool onClick={() => chart.current?.fullscreen()} title="Fullscreen chart">⛶</Tool>
            </div>
          </div>
          <div className="relative min-h-0 flex-[3]">
            {instant && widgetOpen && (
              <QuickWidget
                presets={buyPresets}
                buyLocked={buyLocked}
                presetSet={presetSet}
                onPresetSet={onPresetSet}
                walletSol={snap.walletSol}
                held={!!position && position.tokens > 1e-6}
                ticker={coin.ticker}
                onBuy={buy}
                onSell={sell}
                onClose={() => setWidgetOpen(false)}
              />
            )}
            <ChartPanel
              key={coinId}
              ref={chart}
              engine={engine}
              coinId={coinId}
              version={snap.version}
              timeOffset={Math.floor(wallStart / 1000)}
              tf={tf}
              metric={metric}
              unit={unit}
              scale={scale}
              entryMcUsd={entryMcUsd}
              earlyAvgMcUsd={coin.earlyAvgMcUsd}
              ticker={coin.ticker}
              show={social}
              youKol={kol && kol.tier >= KOL_BUBBLE_TIER ? kol : null}
            />
          </div>
          <div className="flex h-7 shrink-0 items-center gap-2 border-t border-line bg-nav px-3">
            <Seg
              value={scale}
              options={[{ v: "pct", label: "%" }, { v: "log", label: "log" }, { v: "auto", label: "auto" }]}
              onChange={setScale}
            />
            <span className="ml-auto flex items-center gap-3 text-[10.5px] text-faint">
              <span><span className="text-[#8b9099]">┅</span> ATH</span>
              <span><span className="text-amber">─</span> Top 10 avg buy</span>
              <span><span className="text-blue">┅</span> Your entry</span>
              <span className="text-faint">·</span>
              <span><span className="rounded-sm bg-amber px-0.5 text-[8.5px] font-black text-black">DEV</span> Dev</span>
              <span><span className="font-black text-violet">●</span> KOL</span>
              <span>🚀 Boost</span>
            </span>
          </div>
          <div className="min-h-[260px] flex-[2] border-t border-line bg-panel">
            <InfoTabs
              ordersLocked={!features.orders}
              holders={engine.getHolders(coinId)}
              coin={coin}
              tape={tape}
              now={snap.now}
              positions={positionRows}
              orders={snap.orders}
              entryMcUsd={entryMcUsd}
              held={!!position && position.tokens > 1e-6}
              onSellCoin={sellCoin}
              onOpenCoin={onOpen}
              onAddOrder={(kind, trigger, fraction) => {
                const o = engine.addOrder(coinId, kind, trigger, fraction);
                notify(o ? `${kind === "tp" ? "Take profit" : "Stop loss"} set at ${usd(trigger)} MC` : "Buy first to set a TP or SL");
              }}
              onCancelOrder={(id) => engine.cancelOrder(id)}
              currentId={coinId}
            />
          </div>
        </div>
        <TradePanel
          top={
            launch && (
              <DevOps
                l={launch}
                now={snap.now}
                devSol={snap.devSol ?? 0}
                onSell={(from, p) => {
                  const r = engine.devSellFrom(coinId, from, p);
                  notify(r.ok ? `Sold ${p === "max" ? "everything" : `${p}% of supply`} from ${from === "deployer" ? "the deployer" : "your other wallets"} for ${sol(r.sol ?? 0)} SOL` : (r.reason ?? "Sell failed"));
                }}
                onDevBuy={(v) => {
                  const r = engine.devBuy(coinId, v);
                  notify(r.ok ? `Dev bought ${v} SOL` : (r.reason ?? "Buy failed"));
                }}
                onNuke={() => {
                  const r = engine.nuke(coinId);
                  notify(r.ok ? `☢ Nuked: ${sol(r.sol ?? 0)} SOL out` : (r.reason ?? "Nothing to sell"));
                }}
                onClaim={() => {
                  const r = engine.claimRewards(coinId);
                  if (r.ok) notify(`Claimed ${sol(r.sol ?? 0, 3)} SOL of creator fees`);
                }}
                onReport={() => onLaunchReport?.(coinId)}
              />
            )
          }
          holdingPct={engine.holdingPct(coinId)}
          walletPcts={engine.walletPcts(coinId)}
          walletSel={snap.walletSel}
          walletCount={snap.walletCount}
          kol={kol}
          onPostCall={(text) => {
            const r = engine.postThesis(coinId, text);
            notify(r.ok ? `Call posted to ${kol?.followers.toLocaleString("en-US")} followers: they're coming in` : (r.reason ?? "Could not post"));
          }}
          canConsolidate={features.consolidate}
          canBoost={features.boosts}
          canPayDex={features.dex}
          onWalletSel={(s) => engine.setWalletSel(s)}
          onSplit={(n) => {
            if (engine.splitPosition(coinId, n)) notify(`Split your ${coin.ticker} evenly over ${n} wallets · trading from all ${n}`);
          }}
          onConsolidate={() => {
            if (engine.consolidate(coinId)) notify(`Moved all your ${coin.ticker} into ${WALLET_NAMES[engine.getWalletSel()[0]]}`);
          }}
          onBoost={(label) => {
            const r = engine.buyBoost(coinId, label);
            notify(r.ok ? `🚀 Boost ${label} is live on ${coin.ticker}` : (r.reason ?? "Boost failed"));
          }}
          onPayDex={() => {
            const r = engine.payDex(coinId);
            notify(r.ok ? `DEX profile paid for ${coin.ticker}` : (r.reason ?? "Could not pay DEX"));
          }}
          coin={coin}
          walletSol={snap.walletSol}
          position={position}
          buyPresets={buyPresets}
          onBuyPresets={onBuyPresets}
          presetSet={presetSet}
          onPresetSet={onPresetSet}
          buyLocked={buyLocked}
          lockSecs={lockSecs}
          instant={instant}
          changePct={changePct}
          onBuy={buy}
          onSell={sell}
        />
        {devMode && <WalletColumn engine={engine} coin={coin} launch={launch} devSol={snap.devSol ?? 0} walletSol={snap.walletSol} walletCount={snap.walletCount} notify={notify} />}
      </div>
    </div>
  );
}
