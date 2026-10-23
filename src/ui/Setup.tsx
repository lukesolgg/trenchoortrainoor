"use client";

import { useEffect } from "react";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/engine/difficulty";
import { useUi } from "@/store/ui";

const COPY = {
  firsttx: {
    title: "FIRST TX",
    lead: "Quick-buy the first right pair the moment it hits New Pairs: the best ticker, on Pump, with Dividends on, paired the way the tweet's author trades.",
    steps: [
      ["Read the tweet", "Work out the meme from an authority account and its best ticker."],
      ["Check the config", "The right coin is on Pump with Dividends on. The pair follows the author: /SPACEX for Elon (/TESLA for Tesla tweets), SOL for Toly, /PUMP for Alon, Truth Terminal and pump.fun. Look-alikes get exactly one thing wrong."],
      ["Quick-buy it first", "Hit the ⚡ button on its New Pairs card. Buy before the tweet and it is a false start; buy a look-alike and the round ends. Then sell into the run, or press Space to close out."],
    ],
  },
  dev: {
    title: "DEV",
    lead: "Deploy the meme from the tweet before the rival deployers do. Fill the form fast: the right ticker, the right config.",
    steps: [
      ["Read the tweet", "Find the meme name and work out its best ticker."],
      ["Fill the deploy form", "Name, ticker, image and config. Pre-fill gives you a fast guess that may be wrong."],
      ["Deploy first", "Rival deployers land their coins on a clock. Beat them, then sell into the run."],
    ],
  },
} as const;

export function Setup() {
  const { mode, difficulty, setDifficulty, start, toModes } = useUi();
  const copy = COPY[mode === "dev" ? "dev" : "firsttx"];
  const diff = DIFFICULTIES[difficulty];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        start();
      } else if (e.key === "Escape") toModes();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, toModes]);

  return (
    <main className="mx-auto flex h-dvh max-w-5xl flex-col justify-center px-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">How to play</p>
      <h1 className="mt-1 text-[40px] font-black leading-none tracking-tight">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-snug text-dim">{copy.lead}</p>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Your setup</h2>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Difficulty</div>
              <div className="flex gap-2" role="radiogroup" aria-label="Difficulty">
                {DIFFICULTY_ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === id}
                    onClick={() => setDifficulty(id)}
                    className={`rounded-lg border px-3.5 py-2 text-[13px] font-bold transition-colors ${
                      difficulty === id
                        ? "border-pink bg-pink/15 text-pink"
                        : "border-line-hi text-dim hover:text-ink"
                    }`}
                  >
                    {DIFFICULTIES[id].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-dim">{diff.blurb}</p>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Style</div>
              <div className="flex gap-2">
                <span className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-bold text-faint" title="Coming in v1.1">
                  Mess around
                </span>
                <span className="rounded-lg border border-up bg-up/10 px-3.5 py-2 text-[13px] font-bold text-up">Training</span>
              </div>
              <p className="mt-2 text-[12px] text-dim">
                Real bonding-curve price impact and real waits. Deleted tweets and rugs arrive in v1.1.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-5">
          <ol className="space-y-4">
            {copy.steps.map(([h, b], i) => (
              <li key={h} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-up/15 text-[12px] font-bold text-up">
                  {i + 1}
                </span>
                <div>
                  <div className="text-[14px] font-bold">{h}</div>
                  <div className="text-[12.5px] leading-snug text-dim">{b}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className="mt-4 text-[12px] text-amber">
        {mode === "dev"
          ? "DEV deploy arrives in phase 7: Start opens the free-running board for now."
          : "Each round: 3 s countdown, then an armed wait of 1.5 to 4 s, then the tweet. Your reaction is timed from the moment the right coin lands."}
      </p>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={toModes}
          className="rounded-lg border border-line-hi px-4 py-2 text-[13px] font-semibold text-dim transition-colors hover:text-ink"
        >
          Back
        </button>
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-2 rounded-lg bg-up px-5 py-2.5 text-[14px] font-extrabold text-black shadow-[0_0_24px_rgba(46,230,166,.35)] transition-[filter] hover:brightness-110"
        >
          Start round <kbd className="rounded bg-black/20 px-1.5 text-[11px]">Space</kbd>
        </button>
      </div>
    </main>
  );
}
