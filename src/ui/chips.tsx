import type { CoinConfig, Pair } from "@/engine/types";

export const PAIR_STYLE: Record<Pair, string> = {
  SPACEX: "bg-blue/10 text-blue border-blue/40",
  TESLA: "bg-down/15 text-down border-down/40",
  PUMP: "bg-white/10 text-ink border-white/20",
  SOL: "bg-violet/15 text-violet border-violet/40",
};

const base = "rounded border px-1.5 py-px text-[10px] font-bold leading-4 tracking-wide";

/** Pair, dividends and launchpad chips, the same on cards, the token page and results. */
export function ConfigChips({ config }: { config: CoinConfig }) {
  return (
    <>
      <span className={`${base} ${PAIR_STYLE[config.pair]}`}>/{config.pair}</span>
      {config.dividends && <span className={`${base} border-amber/40 bg-amber/15 text-amber`}>DIV</span>}
      <span
        className={`${base} ${config.launchpad === "pump" ? "border-up/40 bg-up/10 text-up" : "border-line-hi bg-white/5 text-dim"}`}
      >
        {config.launchpad === "pump" ? "PUMP" : "BONK"}
      </span>
    </>
  );
}
