"use client";

import { useEffect } from "react";
import { useUi } from "@/store/ui";

/** Level 0: pick a path. Trader is live; Dev is coming. Free play stays as a side door for warming up. */
export function ModePicker() {
  const pickMode = useUi((s) => s.pickMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1" || e.key.toLowerCase() === "t") pickMode("firsttx");
      if (e.key.toLowerCase() === "f") pickMode("freeplay");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

  const Path = ({
    title,
    blurb,
    accent,
    live,
    hotkey,
    onPick,
    perks,
  }: {
    title: string;
    blurb: string;
    accent: string;
    live: boolean;
    hotkey?: string;
    onPick?: () => void;
    perks: string[];
  }) => (
    <button
      type="button"
      disabled={!live}
      onClick={onPick}
      className="group relative flex min-h-[280px] flex-col rounded-2xl border border-line bg-card p-6 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ ["--accent" as string]: accent }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <span className="text-[34px] font-black tracking-tight">{title}</span>
        {live ? (
          hotkey && <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">{hotkey}</kbd>
        ) : (
          <span className="rounded-full border border-line-hi px-2 py-0.5 text-[11px] font-bold text-faint">Coming soon</span>
        )}
      </div>
      <p className="mt-2 max-w-sm text-[14px] leading-snug text-dim">{blurb}</p>
      <ul className="mt-4 space-y-1.5 text-[13px] text-ink/85">
        {perks.map((p) => (
          <li key={p} className="flex gap-2">
            <span style={{ color: accent }}>▸</span>
            {p}
          </li>
        ))}
      </ul>
      {live && (
        <span className="mt-auto pt-5 text-[13px] font-extrabold" style={{ color: accent }}>
          Start as a {title.toLowerCase()} →
        </span>
      )}
    </button>
  );

  return (
    <main className="mx-auto flex h-dvh max-w-5xl flex-col justify-center px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-up/15 text-up">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-extrabold leading-none tracking-tight">GnGm</h1>
            <span className="rounded border border-up/40 bg-up/10 px-1.5 py-px text-[10px] font-bold text-up">SIM</span>
            <span className="rounded border border-line-hi px-1.5 py-px text-[10px] font-bold text-dim">LEVEL 0</span>
          </div>
          <p className="mt-1 text-[13px] text-dim">Memecoin trench training. Simulated markets, made-up trades, no real money.</p>
        </div>
      </div>

      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Choose your path</p>
      <div className="grid grid-cols-2 gap-4">
        <Path
          title="Trader"
          accent="#35d07f"
          live
          hotkey="T"
          onPick={() => pickMode("firsttx")}
          blurb="Read the tweet, find the right coin first, and trade the story it tells."
          perks={["First buy speed and spotting the right pair", "Blitz rounds or 5-10 minute Sagas with vamps", "Your own port: low, medium or whale"]}
        />
        <Path
          title="Dev"
          accent="#8b5cf6"
          live={false}
          blurb="Deploy the meme from the tweet before the rival devs do, then run your launch."
          perks={["Deploy speed and the right config", "Bundles, boosts and the DEX", "Its own levelling route"]}
        />
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
    </main>
  );
}
