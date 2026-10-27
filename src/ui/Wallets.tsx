"use client";

import { BIG_WALLET_PCT, type Engine } from "@/engine/engine";

export const WALLET_NAMES = ["Main", "Side 1", "Side 2", "Side 3", "Side 4"];

/**
 * Pick which wallets trade. Several can be on at once: a buy spends the amount in each of them (3 wallets × 1 SOL = 3 SOL), sells come out of each.
 * With `pcts`, each chip shows that wallet's share of the coin's supply (amber at 5%+).
 */
export function WalletPicker({ sel, onSel, pcts, count }: { sel: readonly number[]; onSel: (s: number[]) => void; pcts?: number[]; count: number }) {
  const toggle = (i: number) => {
    const on = sel.includes(i);
    if (on && sel.length === 1) return;
    onSel(on ? sel.filter((x) => x !== i) : [...sel, i]);
  };
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(count, 3)}, minmax(0, 1fr))` }} role="group" aria-label="Trading wallets">
      {WALLET_NAMES.slice(0, count).map((name, i) => {
        const on = sel.includes(i);
        const pct = pcts?.[i] ?? 0;
        const big = pct >= BIG_WALLET_PCT;
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(i)}
            className={`rounded-md border px-2 py-1.5 text-left leading-tight transition-colors ${
              on ? "border-blue/70 bg-blue/15 text-ink" : "border-line text-dim hover:border-line-hi hover:text-ink"
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold">
              <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-blue" : "bg-line-hi"}`} />
              {name}
            </div>
            {pcts && (
              <div className={`tabular mt-0.5 text-[10.5px] font-semibold ${big ? "text-amber" : pct > 0 ? "text-ink/80" : "text-faint"}`}>
                {pct > 0 ? `${pct.toFixed(2)}%` : "empty"}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The toast after a buy, when there is something to warn about: trimmed or refused at 10%, or a wallet now 5%+. */
export function buyWarning(engine: Engine, coinId: string, bought: boolean): string | null {
  const note = engine.takeBuyNote();
  if (note) return note;
  if (!bought) return null;
  const pcts = engine.walletPcts(coinId);
  const i = pcts.findIndex((p) => p >= BIG_WALLET_PCT);
  return i >= 0
    ? `${WALLET_NAMES[i]} now holds ${pcts[i].toFixed(1)}%: over ${BIG_WALLET_PCT}% it only climbs a quarter as far. Split it across wallets`
    : null;
}
