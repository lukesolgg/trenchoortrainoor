"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Engine, WalletRef } from "@/engine/engine";
import { SOL_USD } from "@/engine/curve";
import { LAUNCH_WALLETS_MAX } from "@/engine/dev";
import type { CoinView, LaunchView } from "@/engine/types";
import { sol } from "../format";
import { SolIcon } from "../icons";
import { WALLET_NAMES } from "../Wallets";

const BUY = [0.1, 0.25, 0.5, 1, 2, 5];
const SELL = [0.1, 0.25, 0.5, 1];

interface Wallet {
  key: string;
  short: string;
  name: string;
  pct: number;
  ref: WalletRef;
}

interface Group {
  id: string;
  name: string;
  hint: string;
  tone: string;
  wallets: Wallet[];
  /** Holder wallets act as one unit (the bot's crowd). */
  crowd?: { count: number };
}

interface Props {
  engine: Engine;
  coin: CoinView;
  launch?: LaunchView;
  balance: number;
  tradingCount: number;
  notify: (text: string) => void;
  /** Below the wallets: your launch, bots, promotion. */
  children?: ReactNode;
}

/**
 * Dev mode's one trade panel. Top: BUY / SELL and one-tap amounts that fire straight away with the wallets you have
 * picked. Then the wallets, in groups (deployer, launch wallets up to 50, trading, trend-bot and holder-bot wallets)
 * with select-all and chips for single wallets. Then your launch, bots and promotion. One balance pays for all.
 */
export function DevTradePanel({ engine, coin, launch, balance, tradingCount, notify, children }: Props) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [custom, setCustom] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set(["t0"]));
  const [open, setOpen] = useState<Set<string>>(() => new Set(["launch"]));
  const id = coin.id;
  const tradePcts = engine.walletPcts(id);
  const solOf = (pct: number) => ((pct / 100) * coin.mcUsd) / SOL_USD;

  const groups: Group[] = useMemo(() => {
    const g: Group[] = [];
    if (launch) {
      g.push({ id: "dep", name: "Deployer", hint: "public: DEV on the chart", tone: "text-violet", wallets: [{ key: "dep", short: "DEV", name: "Deployer", pct: launch.deployerPct, ref: { g: "deployer" } }] });
      g.push({
        id: "launch",
        name: "Launch wallets",
        hint: "look like anyone",
        tone: "text-violet",
        wallets: launch.launchWalletPcts.map((pct, i) => ({ key: `l${i}`, short: `L${i + 1}`, name: `Launch wallet ${i + 1}`, pct, ref: { g: "launch", i } })),
      });
    }
    g.push({
      id: "trade",
      name: "Trading",
      hint: launch ? "your trading wallets" : "",
      tone: "text-blue",
      wallets: Array.from({ length: tradingCount }, (_, i) => ({ key: `t${i}`, short: WALLET_NAMES[i].replace("Side ", "S"), name: WALLET_NAMES[i], pct: tradePcts[i] ?? 0, ref: { g: "trade", i } })),
    });
    if (launch && (launch.botWalletPcts.some((p) => p > 0) || launch.bots.trend)) {
      g.push({ id: "bot", name: "Trend bot wallets", hint: "the trend bot's buys", tone: "text-up", wallets: launch.botWalletPcts.map((pct, i) => ({ key: `b${i}`, short: `B${i + 1}`, name: `Bot wallet ${i + 1}`, pct, ref: { g: "bot", i } })) });
    }
    if (launch && launch.holderWallets.count > 0) {
      g.push({
        id: "holder",
        name: "Holder wallets",
        hint: "the holder bot's crowd",
        tone: "text-amber",
        crowd: { count: launch.holderWallets.count },
        wallets: [{ key: "h", short: "ALL", name: "Holder wallets", pct: launch.holderWallets.pct, ref: { g: "holder" } }],
      });
    }
    return g;
  }, [launch, tradingCount, tradePcts]);

  const all = groups.flatMap((g) => g.wallets);
  const picked = all.filter((w) => sel.has(w.key) && (side === "sell" ? w.pct > 0.0001 : w.ref.g !== "holder"));
  const toggle = (keys: string[], on?: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      const turnOn = on ?? !keys.every((k) => n.has(k));
      for (const k of keys) {
        if (turnOn) n.add(k);
        else n.delete(k);
      }
      return n;
    });
  const flipOpen = (g: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  // One tap fires: buy `v` SOL in each picked wallet, or sell `v` (a fraction) of each picked wallet's bag.
  const fire = (v: number) => {
    if (!picked.length) return notify(side === "buy" ? "Pick wallets below first" : "Pick wallets holding it below");
    const refs = picked.map((w) => w.ref);
    if (side === "buy") {
      const r = engine.walletsBuy(id, refs, v);
      notify(r.ok ? `Bought ${v} SOL in ${r.fills} wallet${r.fills > 1 ? "s" : ""} · ${sol(r.spent)} SOL` : (r.reason ?? "Buy failed"));
    } else {
      const r = engine.walletsSell(id, refs, v);
      notify(r.ok ? `Sold ${Math.round(v * 100)}% from ${r.fills} wallet${r.fills > 1 ? "s" : ""} · ${sol(r.sol)} SOL` : (r.reason ?? "Nothing to sell"));
    }
  };
  const buying = side === "buy";
  const customN = parseFloat(custom);

  return (
    <aside className="h-full min-h-0 overflow-y-auto border-l border-line bg-panel">
      <div className="space-y-2 border-b border-line p-3">
        <div className="grid grid-cols-2 rounded-lg bg-bg p-0.5" role="radiogroup" aria-label="Buy or sell">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => setSide(s)}
              className={`rounded-md py-2 text-[14px] font-black transition-colors ${side === s ? (s === "buy" ? "bg-up text-black" : "bg-down text-white") : "text-dim hover:text-ink"}`}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className={`grid gap-1.5 ${buying ? "grid-cols-3" : "grid-cols-4"}`}>
          {(buying ? BUY : SELL).map((v) => (
            <button
              key={v}
              type="button"
              disabled={!picked.length || (buying && v * picked.length > balance + 1e-9)}
              onPointerDown={(e) => e.button === 0 && fire(v)}
              className={`tabular rounded-lg border py-2 text-[14px] font-extrabold transition-colors disabled:opacity-35 ${
                buying ? "border-up/50 text-up enabled:hover:bg-up/10 enabled:active:bg-up/20" : "border-down/50 text-down enabled:hover:bg-down/10 enabled:active:bg-down/20"
              }`}
            >
              {buying ? (
                <>
                  <SolIcon /> {v}
                </>
              ) : (
                `${Math.round(v * 100)}%`
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="decimal"
            placeholder={buying ? "Custom SOL per wallet" : "Custom % of each bag"}
            className="tabular min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1.5 text-[12px] outline-none focus:border-line-hi"
            onKeyDown={(e) => {
              if (e.key === "Enter" && customN > 0) fire(buying ? customN : Math.min(1, customN / 100));
            }}
          />
          <button
            type="button"
            disabled={!(customN > 0) || !picked.length}
            onClick={() => fire(buying ? customN : Math.min(1, customN / 100))}
            className={`rounded-md px-3 text-[12px] font-black disabled:opacity-35 ${buying ? "bg-up text-black" : "bg-down text-white"}`}
          >
            {buying ? "Buy" : "Sell"}
          </button>
        </div>
        <p className="tabular text-center text-[11px] text-dim">
          {picked.length ? (
            <>
              {buying ? "Each tap buys in" : "Each tap sells from"} <span className="font-bold text-ink">{picked.length}</span> wallet{picked.length > 1 ? "s" : ""} · balance <SolIcon />{" "}
              <span className="font-bold text-ink">{sol(balance)}</span>
            </>
          ) : (
            <span className="text-amber">Pick wallets below</span>
          )}
        </p>
      </div>

      <div className="border-b border-line p-2">
        <div className="mb-1.5 flex gap-1 text-[10.5px]">
          <button type="button" onClick={() => toggle(all.filter((w) => w.pct > 0.0001).map((w) => w.key), true)} className="rounded border border-line px-1.5 py-0.5 text-dim hover:text-ink">
            Select holders
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="rounded border border-line px-1.5 py-0.5 text-dim hover:text-ink">
            Clear
          </button>
          <span className="ml-auto self-center text-faint">{sel.size} picked</span>
        </div>
        <div className="space-y-1.5">
          {groups.map((g) => {
            const keys = g.wallets.map((w) => w.key);
            const n = keys.filter((k) => sel.has(k)).length;
            const pct = g.wallets.reduce((s, w) => s + w.pct, 0);
            const isOpen = open.has(g.id) && !g.crowd && g.wallets.length > 1;
            const filled = g.wallets.filter((w) => w.pct > 0.0001).length;
            return (
              <div key={g.id} className="rounded-lg border border-line">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${g.name}`}
                    checked={n === keys.length && n > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = n > 0 && n < keys.length;
                    }}
                    onChange={() => toggle(keys)}
                    className="accent-[var(--color-up)]"
                  />
                  <button type="button" onClick={() => g.wallets.length > 1 && !g.crowd && flipOpen(g.id)} className="min-w-0 flex-1 text-left leading-tight">
                    <div className={`flex items-center gap-1 text-[12px] font-bold ${g.tone}`}>
                      {g.wallets.length > 1 && !g.crowd && <span className="text-[9px] text-faint">{isOpen ? "▾" : "▸"}</span>}
                      {g.name}
                      <span className="tabular text-[10.5px] font-semibold text-faint">
                        {g.crowd ? `${g.crowd.count}` : g.wallets.length > 1 ? `${filled}/${g.wallets.length}` : ""}
                      </span>
                    </div>
                    {g.hint && <div className="text-[9.5px] text-faint">{g.hint}</div>}
                  </button>
                  <span className="tabular shrink-0 text-right text-[10.5px] leading-tight">
                    <span className={pct >= 5 ? "font-bold text-amber" : pct > 0 ? "text-ink" : "text-faint"}>{pct > 0.0001 ? `${pct.toFixed(2)}%` : "—"}</span>
                    {pct > 0.0001 && (
                      <span className="block text-dim">
                        <SolIcon /> {sol(solOf(pct))}
                      </span>
                    )}
                  </span>
                </div>
                {isOpen && (
                  <div className="grid grid-cols-5 gap-1 border-t border-line/60 p-1.5">
                    {g.wallets.map((w) => (
                      <button
                        key={w.key}
                        type="button"
                        title={`${w.name}: ${w.pct > 0.0001 ? `${w.pct.toFixed(2)}% · ${sol(solOf(w.pct))} SOL` : "empty"}`}
                        onClick={() => toggle([w.key])}
                        className={`tabular rounded border px-0.5 py-0.5 text-center leading-tight transition-colors ${
                          sel.has(w.key) ? "border-up/70 bg-up/15" : "border-line hover:border-line-hi"
                        }`}
                      >
                        <div className="text-[10px] font-bold">{w.short}</div>
                        <div className={`text-[9px] ${w.pct >= 5 ? "text-amber" : w.pct > 0.0001 ? "text-dim" : "text-faint"}`}>{w.pct > 0.0001 ? w.pct.toFixed(2) : "·"}</div>
                      </button>
                    ))}
                    {g.id === "launch" && g.wallets.length < LAUNCH_WALLETS_MAX && (
                      <button
                        type="button"
                        onClick={() => notify(`${engine.addLaunchWallets(id, 10)} launch wallets`)}
                        className="rounded border border-dashed border-violet/50 text-[10px] font-bold text-violet hover:bg-violet/10"
                      >
                        +10
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {children}
    </aside>
  );
}
