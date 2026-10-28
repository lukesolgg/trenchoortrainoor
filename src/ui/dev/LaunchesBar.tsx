"use client";

import type { LaunchView } from "@/engine/types";
import { Art } from "../Art";
import { LaunchCheckTip } from "./LaunchCheckTip";
import { signed, sol, usd } from "../format";
import { SolIcon } from "../icons";

const status = (l: LaunchView) =>
  l.ended ? { t: l.endReason === "closed" ? "CLOSED" : "DEAD", c: "bg-line text-dim" } : l.bonded ? { t: "BONDED", c: "bg-amber/20 text-amber" } : { t: "LIVE", c: "bg-up/15 text-up" };

/** Dev mode strip: the dev wallet, every launch this session (click to open it), and the session's PnL. */
export function LaunchesBar({ devSol, launches, openId, onOpen }: { devSol: number; launches: LaunchView[]; openId: string | null; onOpen: (coinId: string) => void }) {
  const pnl = launches.reduce((n, l) => n + l.pnlSol, 0);
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-violet/[0.05] px-4 text-[12px]">
      <span className="shrink-0 rounded-md border border-violet/50 bg-violet/10 px-2 py-1 font-bold text-violet">
        Balance <SolIcon /> <span className="tabular">{sol(devSol)}</span>
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {launches.length === 0 ? (
          <span className="text-dim">Hit Dev on a meme tweet in the Tracker to launch it. Rivals are already reading the same tweet.</span>
        ) : (
          <>
          {launches.length > 6 && <span className="shrink-0 text-[11px] text-faint">+{launches.length - 6} earlier</span>}
          {launches.slice(-6).map((l) => {
            const s = status(l);
            const wrong = Object.values(l.check).filter((x) => !x).length;
            return (
              <LaunchCheckTip key={l.coinId} l={l}>
              <button
                type="button"
                onClick={() => onOpen(l.coinId)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors ${openId === l.coinId ? "border-violet bg-violet/15" : "border-line hover:border-line-hi"}`}
              >
                <Art art={l.art} className="h-5 w-5 rounded" glyphSize={11} />
                <span className="font-extrabold">${l.ticker}</span>
                <span className="tabular text-dim">{usd(l.mcUsd)}</span>
                <span className={`rounded px-1 text-[9.5px] font-black ${s.c}`}>{s.t}</span>
                {l.bundle.flagged && <span className="rounded bg-down/15 px-1 text-[9.5px] font-black text-down">BUNDLED</span>}
                <span className={`text-[10px] font-black ${wrong ? "text-down" : "text-up"}`} title={wrong ? `${wrong} wrong` : "all correct"}>
                  {wrong ? `✗${wrong}` : "✓"}
                </span>
              </button>
              </LaunchCheckTip>
            );
          })}
          </>
        )}
      </div>
      {launches.length > 0 && (
        <span className={`tabular shrink-0 font-bold ${pnl >= 0 ? "text-up" : "text-down"}`}>Session realised {signed(pnl)} SOL</span>
      )}
    </div>
  );
}
