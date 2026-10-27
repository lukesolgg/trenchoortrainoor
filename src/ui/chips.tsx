import type { CoinConfig, Pair } from "@/engine/types";

export const PAIR_STYLE: Record<Pair, string> = {
  SPACEX: "bg-blue/25 text-[#9fd8ff] border-blue/70",
  TESLA: "bg-down/25 text-[#ff9aa6] border-down/70",
  PUMP: "bg-up/20 text-[#8ff0bf] border-up/60",
  SOL: "bg-violet/30 text-[#c9b3ff] border-violet/70",
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
