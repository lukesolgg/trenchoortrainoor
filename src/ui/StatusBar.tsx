import { SOL_USD } from "@/engine/curve";
import { FpsMeter } from "./FpsMeter";

export function StatusBar({ hint }: { hint: string }) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-line bg-nav px-4 text-[11px] text-dim">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-up shadow-[0_0_6px_#35d07f]" />
        Simulator · no real trades
      </span>
      <span>
        SOL <span className="tabular font-semibold text-ink">${SOL_USD.toFixed(2)}</span>
      </span>
      <span className="ml-auto">{hint}</span>
      <FpsMeter />
    </footer>
  );
}
