"use client";

import { WalletPicker, WALLET_NAMES } from "./Wallets";
import { BIG_WALLET_PCT, MAX_HOLD_PCT } from "@/engine/engine";
import { useState } from "react";
import type { CoinView, Position } from "@/engine/types";
import { pct, signed, sol, tokens, usd } from "./format";
import { GasIcon, ShieldOffIcon, SlipIcon, SolIcon, TipIcon } from "./icons";

interface FireProps {
  label: React.ReactNode;
  hint?: string;
  tone: "buy" | "sell" | "ghost";
  disabled?: boolean;
  onFire: (eventTs: number) => void;
  /** Tailwind height class. */
  h?: string;
  pill?: boolean;
  /** Outlined preset style instead of a filled action button. */
  outline?: boolean;
}

/** Fires on pointerdown/keydown with the raw event timestamp, never on click. */
export function FireButton({ label, hint, tone, disabled, onFire, h = "h-10", pill, outline }: FireProps) {
  const [flash, setFlash] = useState(0);
  const fire = (ts: number) => {
    if (disabled) return;
    onFire(ts);
    setFlash((n) => n + 1);
  };
  const toneCls = outline
    ? tone === "buy"
      ? "border border-up/50 text-up hover:bg-up/10"
      : "border border-down/50 text-down hover:bg-down/10"
    : tone === "buy"
      ? "bg-up text-black hover:brightness-110"
      : tone === "sell"
        ? "bg-down text-white hover:brightness-110"
        : "border border-line-hi text-ink hover:bg-white/5";
  return (
    <span key={flash} className={`block ${pill ? "rounded-full" : "rounded-lg"} ${flash ? "anim-flash" : ""}`}>
      <button
        type="button"
        data-fire
        disabled={disabled}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          fire(e.nativeEvent.timeStamp);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fire(e.nativeEvent.timeStamp);
          }
        }}
        className={`relative flex ${h} w-full items-center justify-center gap-1 ${pill ? "rounded-full" : "rounded-lg"} text-[13px] font-bold transition-[filter,transform] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${toneCls}`}
      >
        {label}
        {hint && <kbd className="absolute right-1.5 top-1 text-[9px] font-semibold opacity-60">{hint}</kbd>}
      </button>
    </span>
  );
}

const Row = ({ k, children, tone }: { k: string; children: React.ReactNode; tone?: string }) => (
  <div className="flex items-baseline justify-between py-1">
    <span className="text-[12px] text-dim">{k}</span>
    <span className={`tabular text-[13px] font-semibold ${tone ?? "text-ink"}`}>{children}</span>
  </div>
);


/** Sell presets, in percent of the position. Order matches the two-row grid. */
export const SELL_PRESETS = [10, 25, 50, 100, 5, 15, 33, 44];

const Cell = ({ k, children, tone }: { k: string; children: React.ReactNode; tone?: string }) => (
  <div className="rounded-lg border border-line bg-card px-2 py-2 text-center">
    <div className={`tabular text-[14px] font-bold ${tone ?? "text-up"}`}>{children}</div>
    <div className="mt-0.5 text-[10px] text-faint">{k}</div>
  </div>
);

const Mini = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="rounded-md border border-line px-2 py-1.5">
    <div className="text-[9.5px] text-faint">{k}</div>
    <div className="tabular text-[12px] font-bold">{children}</div>
  </div>
);

interface Props {
  coin: CoinView;
  walletSol: number;
  position: Position | undefined;
  buyPresets: number[];
  onBuyPresets: (p: number[]) => void;
  presetSet: number;
  onPresetSet: (i: number) => void;
  instant: boolean;
  buyLocked: boolean;
  lockSecs: number;
  /** Session change in percent, shown on the window buttons. */
  changePct: number;
  onBuy: (sol: number, eventTs: number) => void;
  onSell: (fraction: number, eventTs: number) => void;
  /** Your share of supply (%), all wallets. */
  holdingPct: number;
  /** Each wallet's share of supply (%), and which wallets trade. */
  walletPcts: number[];
  walletSel: readonly number[];
  onWalletSel: (s: number[]) => void;
  onSplit: (n: number) => void;
  onConsolidate: () => void;
  onBoost: (label: string) => void;
  onPayDex: () => void;
}

/** Your three wallets on this coin: which ones trade, split the bag, pull it back together, and the 5% / 10% rules. */
function Wallets({ pcts, sel, onSel, held, holdingPct, onSplit, onConsolidate }: {
  pcts: number[];
  sel: readonly number[];
  onSel: (s: number[]) => void;
  held: boolean;
  holdingPct: number;
  onSplit: (n: number) => void;
  onConsolidate: () => void;
}) {
  const bigIdx = pcts.findIndex((p) => p >= BIG_WALLET_PCT);
  const used = pcts.filter((p) => p > 1e-4).length;
  const btn = "rounded-md border border-line px-2 py-1 text-[11px] font-bold text-dim transition-colors enabled:hover:border-line-hi enabled:hover:text-ink disabled:opacity-40";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-bold text-dim">Wallets</span>
        <span className={`tabular ${holdingPct >= MAX_HOLD_PCT - 0.05 ? "font-bold text-down" : "text-faint"}`}>
          {holdingPct.toFixed(2)}% of supply · max {MAX_HOLD_PCT}%
        </span>
      </div>
      <WalletPicker sel={sel} onSel={onSel} pcts={pcts} />
      <div className="flex gap-1.5">
        <button type="button" className={btn} disabled={!held} onClick={() => onSplit(2)} title="Spread the bag evenly over Main and Wallet 2">
          Split ×2
        </button>
        <button type="button" className={btn} disabled={!held} onClick={() => onSplit(3)} title="Spread the bag evenly over all three wallets">
          Split ×3
        </button>
        <button type="button" className={btn} disabled={!held || used < 2} onClick={onConsolidate} title="Move the whole bag into the first selected wallet">
          Consolidate
        </button>
      </div>
      {bigIdx >= 0 && (
        <div className="rounded-lg border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
          <span className="font-extrabold">
            {WALLET_NAMES[bigIdx]} holds {pcts[bigIdx].toFixed(1)}% of supply.
          </span>{" "}
          Buyers hold back from a {BIG_WALLET_PCT}%+ wallet: while it&apos;s that big the coin only climbs a quarter as far. Split it or trim.
        </div>
      )}
    </div>
  );
}

const BOOSTS = [
  { label: "x10", usd: 99 },
  { label: "x30", usd: 249 },
  { label: "x50", usd: 399 },
  { label: "x100", usd: 899 },
  { label: "x500", usd: 3999 },
];
const DEX_USD = 299;
const SOL_PRICE = 104;

/** Spend your own SOL promoting the coin: a DEX boost (may pump it, may not) or the DEX profile, once. */
function Promote({ coin, walletSol, locked, onBoost, onPayDex }: { coin: CoinView; walletSol: number; locked: boolean; onBoost: (l: string) => void; onPayDex: () => void }) {
  const live = coin.stage === "migrated" && !locked;
  const dexCost = DEX_USD / SOL_PRICE;
  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">Promote</h3>
        <span className="text-[10.5px] text-faint">{live ? "Paid from your balance. No guarantees." : "Available after migration"}</span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {BOOSTS.map((b) => {
          const cost = b.usd / SOL_PRICE;
          return (
            <button
              key={b.label}
              type="button"
              disabled={!live || cost > walletSol}
              onClick={() => onBoost(b.label)}
              title={`Boost ${b.label}: $${b.usd.toLocaleString("en-US")} (${cost.toFixed(2)} SOL)`}
              className="flex flex-col items-center rounded-md border border-amber/40 py-1.5 text-[11.5px] font-extrabold text-amber transition-colors hover:bg-amber/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span>🚀 {b.label}</span>
              <span className="tabular text-[9.5px] font-semibold text-dim">{cost.toFixed(cost < 10 ? 2 : 1)}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!live || coin.dexPaid || dexCost > walletSol}
        onClick={onPayDex}
        className="mt-1.5 flex w-full items-center justify-between rounded-md border border-blue/40 px-3 py-1.5 text-[12px] font-bold text-blue transition-colors hover:bg-blue/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span>{coin.dexPaid ? "DEX profile paid" : "Pay DEX profile"}</span>
        <span className="tabular text-[11px] font-semibold text-dim">{coin.dexPaid ? "✓" : `$${DEX_USD} · ${dexCost.toFixed(2)}`}</span>
      </button>
    </div>
  );
}

export function TradePanel({ coin, walletSol, position, buyPresets, onBuyPresets, presetSet, onPresetSet, instant, buyLocked, lockSecs, changePct, onBuy, onSell, holdingPct, walletPcts, walletSel, onWalletSel, onSplit, onConsolidate, onBoost, onPayDex }: Props) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [editing, setEditing] = useState(false);
  const [buyAmt, setBuyAmt] = useState("1");
  const [sellPct, setSellPct] = useState("100");
  const buyN = parseFloat(buyAmt);
  const buyOk = Number.isFinite(buyN) && buyN > 0 && buyN <= walletSol;
  const sellN = parseFloat(sellPct);
  const sellOk = Number.isFinite(sellN) && sellN > 0 && sellN <= 100;

  const held = !!position && position.tokens > 1e-6;
  const pnl = position ? position.soldSol + position.valueSol - position.boughtSol - position.promoSol : 0;
  const pnlTone = pnl > 0 ? "text-up" : pnl < 0 ? "text-down" : "text-ink";
  const chgTone = changePct >= 0 ? "text-up" : "text-down";
  const total = coin.buyVolUsd + coin.sellVolUsd;
  const buyShare = total > 0 ? (coin.buyVolUsd / total) * 100 : 50;
  const net = coin.buyVolUsd - coin.sellVolUsd;
  const t = coin.ticker;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto border-l border-line bg-panel">
      {/* Flow stats */}
      <div className="border-b border-line p-3">
        <div className="grid grid-cols-4 gap-1.5">
          {["5m", "1h", "6h", "24h"].map((w, i) => (
            <div key={w} className={`rounded-md border px-1 py-1 text-center leading-tight ${i === 0 ? "border-line-hi bg-card-hi" : "border-line"}`}>
              <div className="text-[10px] text-dim">{w}</div>
              <div className={`tabular text-[12px] font-bold ${chgTone}`}>{pct(changePct)}</div>
            </div>
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-[10.5px] leading-tight text-faint">
          <div>
            Vol
            <div className="tabular text-[13px] font-bold text-ink">{usd(coin.volumeUsd)}</div>
            <div>{coin.txCount} txns</div>
          </div>
          <div>
            Buys
            <div className="tabular text-[13px] font-bold text-up">{coin.buys}</div>
            <div className="tabular">{usd(coin.buyVolUsd)}</div>
          </div>
          <div>
            Sells
            <div className="tabular text-[13px] font-bold text-down">{coin.sells}</div>
            <div className="tabular">{usd(coin.sellVolUsd)}</div>
          </div>
          <div>
            Net Vol.
            <div className={`tabular text-[13px] font-bold ${net >= 0 ? "text-up" : "text-down"}`}>{net >= 0 ? "+" : "-"}{usd(Math.abs(net))}</div>
            <div>net flow</div>
          </div>
        </div>
        <div className="mt-2 flex h-[3px] overflow-hidden rounded-full bg-down">
          <div className="h-full bg-up" style={{ width: `${buyShare}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-line p-3">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-black/40 p-1">
          {(["buy", "sell"] as const).map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setSide(x)}
              className={`rounded-full py-2 text-[13px] font-bold capitalize transition-colors ${
                side === x ? (x === "buy" ? "bg-up text-black" : "bg-down text-white") : "text-dim hover:text-ink"
              }`}
            >
              {x}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-3 font-semibold">
            <span className="rounded-md bg-card-hi px-2 py-1 text-ink">Market</span>
            <span className="text-faint" title="Use the Orders tab under the chart for TP / SL">Limit</span>
          </div>
          <div className="flex overflow-hidden rounded-md border border-line-hi text-[11.5px] font-bold" role="radiogroup" aria-label="Preset set">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={presetSet === i}
                onClick={() => onPresetSet(i)}
                className={`px-2.5 py-1 transition-colors ${presetSet === i ? "bg-buy text-white" : "text-dim hover:text-ink"}`}
                title={`Preset set ${i + 1}`}
              >
                P{i + 1}
              </button>
            ))}
          </div>
        </div>

        {side === "buy" ? (
          <>
            <label className="flex items-center justify-between rounded-xl border border-line-hi bg-black/30 px-3 py-3">
              <span className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-dim">
                Amount
                <span className="tabular mt-0.5 text-[10.5px] font-semibold normal-case tracking-normal text-faint" title="Paper wallet">
                  Bal <SolIcon /> {sol(walletSol, walletSol < 100 ? 2 : 0)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <input
                  value={buyAmt}
                  onChange={(e) => setBuyAmt(e.target.value)}
                  inputMode="decimal"
                  aria-label="Buy amount in SOL"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && buyOk) onBuy(buyN, e.nativeEvent.timeStamp);
                  }}
                  className="tabular w-24 bg-transparent text-right text-[20px] font-bold outline-none"
                />
                <SolIcon />
              </span>
            </label>

            {editing ? (
              <div className="grid grid-cols-4 gap-1.5">
                {buyPresets.map((p, i) => (
                  <input
                    key={`${presetSet}-${i}`}
                    defaultValue={p}
                    inputMode="decimal"
                    aria-label={`Buy preset ${i + 1}`}
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value);
                      if (!Number.isFinite(n) || n <= 0) return;
                      const next = [...buyPresets];
                      next[i] = Math.min(n, 100);
                      onBuyPresets(next);
                    }}
                    className="tabular h-9 w-full rounded-full border border-line-hi bg-black/30 text-center text-[13px] font-bold outline-none focus:border-up"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {buyPresets.map((p, i) =>
                  instant ? (
                    <FireButton key={i} tone="buy" outline pill h="h-9" hint={String(i + 1)} disabled={p > walletSol || buyLocked} label={<><SolIcon />{sol(p, p % 1 ? (p < 1 ? 2 : 1) : 0)}</>} onFire={(ts) => onBuy(p, ts)} />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setBuyAmt(String(p))}
                      className={`h-9 rounded-full border text-[13px] font-bold transition-colors ${buyN === p ? "border-up bg-up/15 text-up" : "border-up/40 text-up/80 hover:bg-up/10"}`}
                    >
                      <SolIcon />{sol(p, p % 1 ? (p < 1 ? 2 : 1) : 0)}
                    </button>
                  ),
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] text-faint">
              <span>{instant ? "1-click buy" : "Pick an amount"}</span>
              <button type="button" onClick={() => setEditing((v) => !v)} className="rounded px-1.5 py-0.5 text-dim hover:text-ink" title="Edit presets">
                {editing ? "Done" : "✎ Edit"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="flex items-center justify-between rounded-xl border border-line-hi bg-black/30 px-3 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-dim">Amount</span>
              <span className="flex items-center gap-1.5">
                <input
                  value={sellPct}
                  onChange={(e) => setSellPct(e.target.value)}
                  inputMode="decimal"
                  aria-label="Sell amount in percent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sellOk && held) onSell(sellN / 100, e.nativeEvent.timeStamp);
                  }}
                  className="tabular w-24 bg-transparent text-right text-[20px] font-bold outline-none"
                />
                <span className="text-dim">%</span>
              </span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {SELL_PRESETS.map((p) =>
                instant ? (
                  <FireButton key={p} tone="sell" outline pill h="h-9" disabled={!held} label={`${p}%`} onFire={(ts) => onSell(p / 100, ts)} />
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSellPct(String(p))}
                    className={`h-9 rounded-full border text-[13px] font-bold transition-colors ${sellN === p ? "border-down bg-down/15 text-down" : "border-down/40 text-down/80 hover:bg-down/10"}`}
                  >
                    {p}%
                  </button>
                ),
              )}
            </div>
            <div className="text-[11px] text-faint">{instant ? "1-click sell" : "Pick a percentage"}</div>
          </>
        )}

        <div className="flex items-center justify-between px-1 text-[12px] font-semibold text-dim" title="Simulated: fixed in the trainer">
          <span className="flex items-center gap-1" title="Slippage">
            <SlipIcon /> 20%
          </span>
          <span className="flex items-center gap-1" title="Priority fee">
            <GasIcon /> 0.001
          </span>
          <span className="flex items-center gap-1" title="Tip">
            <TipIcon /> 0.001
          </span>
          <span className="flex items-center gap-1 text-faint" title="MEV protection off">
            <ShieldOffIcon />
          </span>
        </div>

        {side === "buy" && buyLocked && (
          <div className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-center text-[12px] font-bold text-amber">
            Migrating… buys reopen in {lockSecs.toFixed(1)}s
          </div>
        )}

        {side === "buy" ? (
          !instant && <FireButton tone="buy" pill h="h-11" label={`Buy ${t}`} disabled={!buyOk || buyLocked} onFire={(ts) => onBuy(buyN, ts)} />
        ) : (
          !instant && <FireButton tone="sell" pill h="h-11" label={`Sell ${t}`} disabled={!held || !sellOk} onFire={(ts) => onSell(sellN / 100, ts)} />
        )}
        {instant && (
          <div className={`rounded-full py-3 text-center text-[13px] font-bold ${side === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
            Instant trade is on: tap a preset to {side}
          </div>
        )}

        <Wallets
          pcts={walletPcts}
          sel={walletSel}
          onSel={onWalletSel}
          held={held}
          holdingPct={holdingPct}
          onSplit={onSplit}
          onConsolidate={onConsolidate}
        />
        <div className="grid grid-cols-4 gap-1.5">
          <Mini k="Bought">
            <SolIcon />{sol(position?.boughtSol ?? 0)}
            {(position?.promoSol ?? 0) > 0 && <div className="text-[9.5px] font-semibold text-amber">+{sol(position!.promoSol)} promo</div>}
          </Mini>
          <Mini k="Sold"><SolIcon />{sol(position?.soldSol ?? 0)}</Mini>
          <Mini k="Holding">
            {held && position ? (
              <>
                <SolIcon />{sol(position.valueSol)}
                <div className="text-[9.5px] font-semibold text-faint">{tokens(position.tokens)}</div>
              </>
            ) : (
              "0"
            )}
          </Mini>
          <Mini k="PnL">
            <span className={pnlTone}>{position ? signed(pnl) : "0"}</span>
          </Mini>
        </div>

      </div>

      <Promote coin={coin} walletSol={walletSol} locked={buyLocked} onBoost={onBoost} onPayDex={onPayDex} />

      {/* Token info */}
      <div className="p-3">
        <h3 className="mb-2 text-[13px] font-bold">Token Info</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <Cell k="Top 10 H." tone={coin.stats.top10 >= 25 ? "text-down" : "text-up"}>{coin.stats.top10}%</Cell>
          <Cell k="Dev H." tone={coin.stats.dev >= 5 ? "text-down" : "text-up"}>{coin.stats.dev}%</Cell>
          <Cell k="Snipers H." tone={coin.stats.snipers >= 8 ? "text-down" : "text-up"}>{coin.stats.snipers}%</Cell>
          <Cell k="Insiders" tone={coin.stats.insiders >= 3 ? "text-down" : "text-up"}>{coin.stats.insiders}%</Cell>
          <Cell k="Bundlers" tone={coin.bundlers >= 5 ? "text-down" : "text-up"}>{coin.bundlers}%</Cell>
          <Cell k="LP Burned">100%</Cell>
          <Cell k="Holders" tone="text-ink">{coin.holders >= 1000 ? `${(coin.holders / 1000).toFixed(1)}k` : coin.holders}</Cell>
          <Cell k="Pro Traders" tone="text-ink">{coin.proTraders}</Cell>
          <Cell k="Dex Paid" tone={coin.dexPaid ? "text-up" : "text-down"}>{coin.dexPaid ? "Paid" : "Unpaid"}</Cell>
        </div>
        <div className="mt-2 space-y-1.5 text-[12px]">
          {[
            ["CA", coin.mint],
            ["DA", coin.creator],
            ["Pair", coin.pair],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span className="text-faint">{k}:</span>
              <span className="font-mono font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
