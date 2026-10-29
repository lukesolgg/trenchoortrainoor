"use client";

import { useEffect } from "react";
import { levelForXp, rankFor, xpForLevel } from "@/campaign/progression";
import { useCampaign } from "@/store/campaign";
import { useUi } from "@/store/ui";
import { sol } from "./format";
import { SolIcon } from "./icons";

/** Main menu: the Campaign (the levelling journey) up front, the standalone modes beside it. */
export function ModePicker() {
  const pickMode = useUi((s) => s.pickMode);
  const c = useCampaign();
  const level = levelForXp(c.xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const pct = to > from ? ((c.xp - from) / (to - from)) * 100 : 100;
  const started = c.rounds > 0 || c.xp > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === "c") pickMode("campaign");
      if (k === "1") pickMode("trader");
      if (k === "2") pickMode("dev");
      if (k === "3") pickMode("both");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-center px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber/15 text-amber">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M12 3L1 8.5l11 5.5 9-4.5V16h2V8.5L12 3zm-6.5 9.3V16c0 1.9 2.9 3.5 6.5 3.5s6.5-1.6 6.5-3.5v-3.7L12 15.6l-6.5-3.3z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-extrabold leading-none tracking-tight">Trench Academy</h1>
            <span className="rounded border border-up/40 bg-up/10 px-1.5 py-px text-[10px] font-bold text-up">SIM</span>
          </div>
          <p className="mt-1 text-[13px] text-dim">Memecoin trench training. Simulated markets, made-up trades, no real money.</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
        {/* Campaign */}
        <button
          type="button"
          onClick={() => pickMode("campaign")}
          className="group relative flex min-h-[340px] flex-col overflow-hidden rounded-2xl border border-amber/40 bg-card p-7 text-left transition-all hover:-translate-y-0.5 hover:border-amber"
        >
          <span className="absolute inset-x-0 top-0 h-[3px] bg-amber" />
          <span className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber/10 blur-3xl" />
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">Campaign</span>
            <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">C</kbd>
          </div>
          <span className="mt-3 text-[44px] font-black leading-none tracking-tight">{started ? rankFor(level) : "Start at the bottom"}</span>
          <p className="mt-3 max-w-md text-[14px] leading-snug text-dim">
            One balance that carries over. Level up to unlock Saga, more wallets, boosts, the DEX, Hard, then Dev mode and your own following.
          </p>
          <div className="mt-auto pt-6">
            <div className="flex items-center gap-3 text-[12px]">
              <span className="font-bold">Lvl {level}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
              </span>
              <span className="tabular flex items-center gap-1 font-bold">
                <SolIcon /> {sol(c.traderSol)}
              </span>
            </div>
            <span className="mt-4 inline-block text-[14px] font-extrabold text-amber">{started ? "Continue campaign →" : "Start the campaign →"}</span>
          </div>
        </button>

        {/* Standalone modes */}
        <div className="grid grid-rows-3 gap-3">
          <Mode title="Trader mode" hotkey="1" accent="#35d07f" onPick={() => pickMode("trader")} blurb="Read the tweet, buy the right coin first. Scored rounds, Blitz or Saga, any port." />
          <Mode title="Dev mode" hotkey="2" accent="#8b5cf6" onPick={() => pickMode("dev")} blurb="Launch the meme off the tweet before rival devs, pick a strategy, run it, get out." />
          <Mode title="Trader + Dev" hotkey="3" accent="#f472b6" onPick={() => pickMode("both")} blurb="Both on one board and one balance: dev the tweets you rate, trade everything else." />
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-faint">Standalone modes have everything unlocked and only keep personal bests. The campaign is the career.</p>
    </main>
  );
}

function Mode({ title, blurb, accent, hotkey, onPick }: { title: string; blurb: string; accent: string; hotkey: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-card px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]"
      style={{ ["--accent" as string]: accent }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-black tracking-tight">{title}</span>
          <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">{hotkey}</kbd>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-dim">{blurb}</p>
      </div>
      <span className="shrink-0 text-[13px] font-extrabold" style={{ color: accent }}>
        Play →
      </span>
    </button>
  );
}
