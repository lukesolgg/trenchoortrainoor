"use client";

import { useEffect, useState } from "react";
import { levelForXp, MAX_LEVEL, rankFor, xpForLevel } from "@/campaign/progression";
import { useCampaign } from "@/store/campaign";
import { useUi } from "@/store/ui";

/**
 * TEMPORARY test tool: set the campaign level, balances and reps instantly. Toggle with the ` key, or the button
 * on the menu screens. Changes apply from the next round (a running round keeps what it started with).
 */
export function AdminPanel() {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const screen = useUi((u) => u.screen);
  const c = useCampaign();
  const level = levelForXp(c.xp);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" && !(e.target instanceof HTMLInputElement)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0));
  const field = "tabular w-full rounded-md border border-line bg-bg px-2 py-1 text-[12px] outline-none focus:border-line-hi";

  return (
    <>
      {screen !== "play" && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-3 left-3 z-[60] rounded-md border border-dashed border-down/50 bg-bg/80 px-2 py-1 text-[10.5px] font-bold text-down/80 hover:text-down"
        >
          ADMIN <kbd className="text-faint">`</kbd>
        </button>
      )}
      {open && (
        <div className="fixed bottom-3 left-3 z-[60] w-[290px] rounded-xl border border-down/50 bg-card p-3 text-[12px] shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-black text-down">Admin · temporary</span>
            <button type="button" onClick={() => setOpen(false)} className="text-dim hover:text-ink">
              ✕
            </button>
          </div>
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-faint">
            Level · {rankFor(level)}
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={MAX_LEVEL}
              value={level}
              onChange={(e) => c.admin({ xp: xpForLevel(num(e.target.value, 1, MAX_LEVEL)) })}
              className={`${field} w-16`}
            />
            {[1, 4, 8, 10, 15, 20, 30].map((l) => (
              <button key={l} type="button" onClick={() => c.admin({ xp: xpForLevel(l) })} className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${l === level ? "bg-amber text-black" : "bg-line text-dim hover:text-ink"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-faint">
              Trader SOL
              <input type="number" step="0.5" value={Number(c.traderSol.toFixed(3))} onChange={(e) => c.admin({ traderSol: num(e.target.value, 0, 1e6) })} className={`${field} mt-1`} />
            </label>
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-faint">
              Dev SOL
              <input
                type="number"
                step="1"
                placeholder="closed"
                value={c.devSol === null ? "" : Number(c.devSol.toFixed(3))}
                onChange={(e) => c.admin({ devSol: e.target.value === "" ? null : num(e.target.value, 0, 1e6) })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-faint">
              KOL Rep (0-5)
              <input type="number" min={0} max={5} value={c.kolRep} onChange={(e) => c.admin({ kolRep: num(e.target.value, 0, 5) })} className={`${field} mt-1`} />
            </label>
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-faint">
              Dev Rep (0-10)
              <input type="number" min={0} max={10} value={c.devRep} onChange={(e) => c.admin({ devRep: num(e.target.value, 0, 10) })} className={`${field} mt-1`} />
            </label>
          </div>
          <label className="mt-2.5 flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={c.unlockAll} onChange={(e) => c.admin({ unlockAll: e.target.checked })} />
            Unlock everything
          </label>
          <button
            type="button"
            onClick={() => {
              if (!sure) return setSure(true);
              c.reset();
              setSure(false);
            }}
            onBlur={() => setSure(false)}
            className="mt-2.5 w-full rounded-md border border-down/50 py-1.5 text-[11.5px] font-bold text-down hover:bg-down/10"
          >
            {sure ? "Click again to wipe the campaign" : "Reset campaign"}
          </button>
          <p className="mt-2 text-[10.5px] leading-snug text-faint">Applies from the next round. Toggle with `.</p>
        </div>
      )}
    </>
  );
}
