"use client";

import { useState } from "react";
import { SOL_USD, SUPPLY } from "@/engine/curve";
import type { CoinView, Position } from "@/engine/types";
import { signed, sol, tokens, usd } from "./format";

interface FireProps {
  label: React.ReactNode;
  hint?: string;
  tone: "buy" | "sell" | "ghost";
  disabled?: boolean;
  onFire: (eventTs: number) => void;
  className?: string;
}

/** Fires on pointerdown/keydown with the raw event timestamp, never on click. */
function FireButton({ label, hint, tone, disabled, onFire, className = "" }: FireProps) {
  const [flash, setFlash] = useState(0);
  const fire = (ts: number) => {
    if (disabled) return;
    onFire(ts);
    setFlash((n) => n + 1);
  };
  const toneCls =
    tone === "buy"
      ? "bg-buy text-white hover:brightness-110"
      : tone === "sell"
        ? "bg-down/90 text-white hover:brightness-110"
        : "border border-line-hi text-ink hover:bg-white/5";
  return (
    <span key={flash} className={`block rounded-lg ${flash ? "anim-flash" : ""}`}>
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
        className={`relative flex h-10 w-full items-center justify-center gap-1 rounded-lg text-[13px] font-bold transition-[filter,transform] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${toneCls} ${className}`}
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

interface Props {
  coin: CoinView;
  walletSol: number;
  position: Position | undefined;
  buyPresets: number[];
  onBuyPresets: (p: number[]) => void;
  instant: boolean;
  onInstant: (b: boolean) => void;
  onBuy: (sol: number, eventTs: number) => void;
  onSell: (fraction: number, eventTs: number) => void;
}

const SELL_FRACTIONS = [0.25, 0.5, 0.75, 1];

const Switch = ({ on, onChange, label }: { on: boolean; onChange: (b: boolean) => void; label: string }) => (
  <label className="flex items-center gap-2 text-[11px] font-semibold text-dim">
    {label}
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-4 w-8 rounded-full transition-colors ${on ? "bg-buy" : "bg-line-hi"}`}
    >
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-[17px]" : "left-0.5"}`} />
    </button>
  </label>
);

export function TradePanel({ coin, walletSol, position, buyPresets, onBuyPresets, instant, onInstant, onBuy, onSell }: Props) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");
  const [armedBuy, setArmedBuy] = useState<number | null>(null);
  const [armedSell, setArmedSell] = useState(1);
  const customSol = parseFloat(custom);
  const customOk = Number.isFinite(customSol) && customSol > 0 && customSol <= walletSol;
  const buyAmount = customOk ? customSol : armedBuy;

  const held = !!position && position.tokens > 1e-6;
  const entryMcUsd =
    position && position.boughtTokens > 0 ? (position.boughtSol / position.boughtTokens) * SUPPLY * SOL_USD : null;
  const pnl = position ? position.soldSol + position.valueSol - position.boughtSol : 0;
  const pnlPct = position && position.boughtSol > 0 ? (pnl / position.boughtSol) * 100 : 0;
  const pnlTone = pnl >= 0 ? "text-up" : "text-down";

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto border-l border-line bg-panel p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`rounded-md py-1.5 text-[13px] font-bold capitalize transition-colors ${
              side === s ? (s === "buy" ? "bg-up text-black" : "bg-down text-white") : "text-dim hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Switch on={instant} onChange={onInstant} label="Instant trade" />
        {side === "buy" && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded border border-line-hi px-1.5 py-px text-[10px] font-semibold text-dim hover:text-ink"
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {side === "buy" ? (
        <section className="rounded-xl border border-line bg-card p-3">
          {editing ? (
            <div className="grid grid-cols-4 gap-1.5">
              {buyPresets.map((p, i) => (
                <input
                  key={i}
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
                  className="tabular h-10 w-full rounded-lg border border-line-hi bg-black/30 text-center text-[13px] font-bold outline-none focus:border-buy"
                />
              ))}
            </div>
          ) : instant ? (
            <div className="grid grid-cols-4 gap-1.5">
              {buyPresets.map((p, i) => (
                <FireButton key={i} tone="buy" hint={String(i + 1)} disabled={p > walletSol} label={sol(p, p % 1 ? 2 : 0)} onFire={(ts) => onBuy(p, ts)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {buyPresets.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setArmedBuy(p);
                    setCustom("");
                  }}
                  className={`h-10 rounded-lg border text-[13px] font-bold transition-colors ${
                    armedBuy === p && !customOk ? "border-buy bg-buy/20 text-ink" : "border-line-hi text-dim hover:text-ink"
                  }`}
                >
                  {sol(p, p % 1 ? 2 : 0)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-1.5">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom SOL"
              inputMode="decimal"
              aria-label="Custom buy amount in SOL"
              onKeyDown={(e) => {
                if (e.key === "Enter" && customOk) onBuy(customSol, e.nativeEvent.timeStamp);
              }}
              className="tabular h-10 min-w-0 flex-1 rounded-lg border border-line-hi bg-black/30 px-3 text-[13px] outline-none placeholder:text-faint focus:border-buy"
            />
            {instant && (
              <div className="w-20">
                <FireButton tone="buy" label="Buy" disabled={!customOk} onFire={(ts) => onBuy(customSol, ts)} />
              </div>
            )}
          </div>
          {!instant && (
            <div className="mt-2">
              <FireButton
                tone="buy"
                label={buyAmount ? `Buy ${sol(buyAmount, buyAmount % 1 ? 2 : 0)} SOL` : "Pick an amount"}
                disabled={!buyAmount || buyAmount > walletSol}
                onFire={(ts) => buyAmount && onBuy(buyAmount, ts)}
              />
            </div>
          )}
          <p className="tabular mt-2 text-[11px] text-dim">
            Wallet <span className="font-semibold text-ink">◎ {sol(walletSol)}</span>
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-card p-3">
          {instant ? (
            <div className="grid grid-cols-4 gap-1.5">
              {SELL_FRACTIONS.map((f) => (
                <FireButton key={f} tone="sell" disabled={!held} label={`${f * 100}%`} onFire={(ts) => onSell(f, ts)} />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {SELL_FRACTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setArmedSell(f)}
                    className={`h-10 rounded-lg border text-[13px] font-bold transition-colors ${
                      armedSell === f ? "border-down bg-down/20 text-ink" : "border-line-hi text-dim hover:text-ink"
                    }`}
                  >
                    {f * 100}%
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <FireButton tone="sell" label={`Sell ${armedSell * 100}%`} disabled={!held} onFire={(ts) => onSell(armedSell, ts)} />
              </div>
            </>
          )}
        </section>
      )}

      <section className="rounded-xl border border-line bg-card p-3">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-dim">Position</h3>
        {!position ? (
          <p className="py-1 text-[12px] text-faint">No position. Buy to open one.</p>
        ) : (
          <>
            <Row k="Holding">{held ? tokens(position.tokens) : "Closed"}</Row>
            <Row k="Avg entry MC">{entryMcUsd ? usd(entryMcUsd) : "-"}</Row>
            <Row k="Invested">◎ {sol(position.boughtSol)}</Row>
            <Row k="Value">◎ {sol(position.valueSol)}</Row>
            <Row k="Sold for">◎ {sol(position.soldSol)}</Row>
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
              <span className="text-[12px] font-semibold text-dim">PnL</span>
              <span className={`tabular text-[15px] font-extrabold ${pnlTone}`}>
                {signed(pnl)} SOL <span className="text-[12px]">({signed(pnlPct, 1)}%)</span>
              </span>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-card p-3">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-dim">Token info</h3>
        <Row k="Top 10 holders" tone={coin.stats.top10 >= 25 ? "text-down" : "text-up"}>{coin.stats.top10}%</Row>
        <Row k="Dev holds" tone={coin.stats.dev >= 5 ? "text-down" : "text-up"}>{coin.stats.dev}%</Row>
        <Row k="Snipers" tone={coin.stats.snipers >= 8 ? "text-down" : "text-up"}>{coin.stats.snipers}%</Row>
        <Row k="Insiders" tone={coin.stats.insiders >= 3 ? "text-down" : "text-up"}>{coin.stats.insiders}%</Row>
        <Row k="Holders">{coin.holders}</Row>
        <Row k="Bonded">{coin.stage === "migrated" ? "Migrated" : `${Math.round(coin.progress * 100)}%`}</Row>
        <Row k="CA"><span className="font-mono text-dim">{coin.mint}</span></Row>
      </section>
    </aside>
  );
}
