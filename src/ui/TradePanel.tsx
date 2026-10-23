"use client";

import { useState } from "react";
import { SOL_USD, SUPPLY } from "@/engine/curve";
import type { Position } from "@/engine/types";
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
  walletSol: number;
  position: Position | undefined;
  buyPresets: number[];
  onBuyPresets: (p: number[]) => void;
  onBuy: (sol: number, eventTs: number) => void;
  onSell: (fraction: number, eventTs: number) => void;
}

export function TradePanel({ walletSol, position, buyPresets, onBuyPresets, onBuy, onSell }: Props) {
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");
  const customSol = parseFloat(custom);
  const customOk = Number.isFinite(customSol) && customSol > 0 && customSol <= walletSol;

  const held = !!position && position.tokens > 1e-6;
  const entryMcUsd =
    position && position.boughtTokens > 0 ? (position.boughtSol / position.boughtTokens) * SUPPLY * SOL_USD : null;
  const pnl = position ? position.soldSol + position.valueSol - position.boughtSol : 0;
  const pnlPct = position && position.boughtSol > 0 ? (pnl / position.boughtSol) * 100 : 0;
  const pnlTone = pnl >= 0 ? "text-up" : "text-down";

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3">
      <section className="rounded-xl border border-line bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-dim">Buy</h3>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded border border-line-hi px-1.5 py-px text-[10px] font-semibold text-dim hover:text-ink"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
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
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {buyPresets.map((p, i) => (
              <FireButton
                key={i}
                tone="buy"
                hint={String(i + 1)}
                disabled={p > walletSol}
                label={sol(p, p % 1 ? 2 : 0)}
                onFire={(ts) => onBuy(p, ts)}
              />
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
          <div className="w-20">
            <FireButton tone="buy" label="Buy" disabled={!customOk} onFire={(ts) => onBuy(customSol, ts)} />
          </div>
        </div>
        <p className="tabular mt-2 text-[11px] text-dim">
          Wallet <span className="font-semibold text-ink">◎ {sol(walletSol)}</span>
        </p>
      </section>

      <section className="rounded-xl border border-line bg-card p-3">
        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-dim">Sell</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {[0.25, 0.5, 1].map((f) => (
            <FireButton
              key={f}
              tone="sell"
              disabled={!held}
              label={`${f * 100}%`}
              onFire={(ts) => onSell(f, ts)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-3">
        <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wider text-dim">Position</h3>
        {!position ? (
          <p className="py-2 text-[12px] text-faint">No position. Buy to open one.</p>
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
    </aside>
  );
}
