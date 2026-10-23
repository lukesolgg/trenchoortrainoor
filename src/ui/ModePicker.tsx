"use client";

import { useEffect } from "react";
import { useUi, type ModeId } from "@/store/ui";

interface ModeDef {
  id: ModeId | "og" | "mix";
  key: string;
  title: string;
  blurb: string;
  accent: string;
  live: boolean;
}

const MODES: ModeDef[] = [
  { id: "dev", key: "1", title: "DEV", blurb: "Deploy the meme from the tweet before the rival deployers do.", accent: "#8b5cf6", live: true },
  { id: "og", key: "2", title: "OG", blurb: "Find and buy the original coin, not a copy.", accent: "#f5b942", live: false },
  { id: "firsttx", key: "3", title: "FIRST TX", blurb: "Quick-buy the first right pair the moment it lands in New Pairs.", accent: "#2ee6a6", live: true },
  { id: "mix", key: "4", title: "MIX", blurb: "OG, fresh pair or dev it: every round could be any.", accent: "#fb923c", live: false },
];

export function ModePicker() {
  const pickMode = useUi((s) => s.pickMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = MODES.find((x) => x.key === e.key);
      if (m?.live) pickMode(m.id as ModeId);
      if (e.key.toLowerCase() === "f") pickMode("freeplay");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

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
            <h1 className="text-[28px] font-extrabold leading-none tracking-tight">Trencher Trainer</h1>
            <span className="rounded border border-buy/40 bg-buy/15 px-1.5 py-px text-[10px] font-bold text-[#9db0ff]">SIM</span>
          </div>
          <p className="mt-1 text-[13px] text-dim">Reaction-time training for memecoin traders. Simulator only, no real trades.</p>
        </div>
      </div>

      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Pick a mode</p>
      <div className="grid grid-cols-4 gap-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!m.live}
            onClick={() => m.live && pickMode(m.id as ModeId)}
            className="group relative flex h-44 flex-col rounded-2xl border border-line bg-card p-4 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            style={{ ["--accent" as string]: m.accent }}
          >
            <span className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" style={{ background: m.accent }} />
            <div className="flex items-start justify-between">
              <span className="text-[24px] font-black tracking-tight">{m.title}</span>
              <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">{m.key}</kbd>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-dim">{m.blurb}</p>
            <div className="mt-auto text-[11px] font-semibold text-faint">{m.live ? "No PB yet" : "Coming later"}</div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => pickMode("freeplay")}
        className="mt-3 flex items-center justify-between rounded-2xl border border-dashed border-line-hi bg-card/60 px-5 py-4 text-left transition-colors hover:border-buy"
      >
        <div>
          <div className="text-[15px] font-bold">Free play</div>
          <div className="text-[12px] text-dim">
            Nonstop practice: a tweet and its runner every 30-60 s. Nothing is scored.
          </div>
        </div>
        <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">F</kbd>
      </button>
    </main>
  );
}
