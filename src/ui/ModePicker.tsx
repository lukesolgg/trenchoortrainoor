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
      if (k === "1") pickMode("firsttx");
      if (k === "f") pickMode("freeplay");
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
        <div className="grid grid-cols-2 gap-3">
          <Mode title="FIRST TX" hotkey="1" accent="#35d07f" live onPick={() => pickMode("firsttx")} blurb="Read the tweet, buy the right coin first. Blitz or Saga, any port." />
          <Mode title="Dev mode" accent="#8b5cf6" blurb="Launch the meme, bundle it, bot it, bond it, run it." />
          <Mode title="OG mode" accent="#4db8ff" blurb="Spot the original launch among the copies." />
          <Mode title="Mix" accent="#f472b6" blurb="Random rounds from every mode." />
        </div>
      </div>

      <button
        type="button"
        onClick={() => pickMode("freeplay")}
        className="mt-4 flex items-center justify-between rounded-2xl border border-dashed border-line-hi bg-card/60 px-5 py-3.5 text-left transition-colors hover:border-buy"
      >
        <div>
          <div className="text-[14px] font-bold">Free play</div>
          <div className="text-[12px] text-dim">Warm up: a tweet and its runner every 30-60 s. Nothing is scored.</div>
        </div>
        <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">F</kbd>
      </button>
      <p className="mt-3 text-[11.5px] text-faint">Standalone modes have everything unlocked and only keep personal bests. The campaign is the career.</p>
    </main>
  );
}

function Mode({ title, blurb, accent, live, hotkey, onPick }: { title: string; blurb: string; accent: string; live?: boolean; hotkey?: string; onPick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!live}
      onClick={onPick}
      className="relative flex flex-col rounded-2xl border border-line bg-card p-4 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--accent)] disabled:cursor-not-allowed"
      style={{ ["--accent" as string]: accent }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl" style={{ background: accent, opacity: live ? 1 : 0.35 }} />
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[20px] font-black tracking-tight ${live ? "" : "text-ink/50"}`}>{title}</span>
        {live ? (
          hotkey && <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">{hotkey}</kbd>
        ) : (
          <span className="shrink-0 rounded-full border border-line-hi px-2 py-0.5 text-[10px] font-bold text-faint">Soon</span>
        )}
      </div>
      <p className={`mt-1.5 text-[12.5px] leading-snug ${live ? "text-dim" : "text-faint"}`}>{blurb}</p>
      {live && (
        <span className="mt-auto pt-3 text-[12.5px] font-extrabold" style={{ color: accent }}>
          Play →
        </span>
      )}
    </button>
  );
}
