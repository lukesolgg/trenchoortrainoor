"use client";

import { useEffect, useMemo } from "react";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/engine/difficulty";
import { statsFor, useRuns, type RunRecord } from "@/store/runs";
import { PORTS, useUi, type Port } from "@/store/ui";

const COPY = {
  firsttx: {
    title: "FIRST TX",
    lead: "Quick-buy the first right pair the moment it hits New Pairs: the best ticker, on Pump, with Dividends on, paired the way the tweet's author trades.",
    steps: [
      ["Read the tweet", "Work out the meme from an authority account and its best ticker."],
      ["Check the config", "The right coin is on Pump with Dividends on. The pair follows the author: /SPACEX for Elon (/TESLA for Tesla tweets), SOL for Toly and Solana, /PUMP for Alon, Ansem, Truth Terminal, pump.fun, Trench Report and Lowcap Larry. Look-alikes get exactly one thing wrong."],
      ["Quick-buy it first", "Hit the ⚡ button on its card. Buy before the tweet and it is a false start; buy a look-alike and the round ends (Casual lets you keep going). The round ends when you sell 100%. Score: speed up to 800, entry up to 100, exit up to 100."],
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
  const { mode, difficulty, setDifficulty, start, toModes, style, setStyle, length, setLength, port, setPort } = useUi();
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
    <main className="mx-auto flex h-dvh max-w-5xl flex-col overflow-y-auto px-6 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">{mode === "dev" ? "Dev" : "Trader"} · Level 0</p>
      <h1 className="mt-1 text-[40px] font-black leading-none tracking-tight">{mode === "dev" ? copy.title : "Your journey"}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-snug text-dim">{copy.lead}</p>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Before you start</h2>
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
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Length</div>
              <div className="flex gap-2" role="radiogroup" aria-label="Round length">
                {(
                  [
                    ["blitz", "Blitz"],
                    ["saga", "Saga"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={length === id}
                    onClick={() => setLength(id)}
                    className={`rounded-lg border px-3.5 py-2 text-[13px] font-bold transition-colors ${
                      length === id ? "border-violet bg-violet/15 text-violet" : "border-line-hi text-dim hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-dim">
                {length === "blitz"
                  ? "Fast rounds: the run tops out inside about a minute, then rugs or goes again."
                  : "A 5-10 minute story: pumps, fades, revivals off retweets, KOLs and boosts, and sometimes a new narrative that vamps the coin. Get onto each new one fast."}
              </p>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Style</div>
              <div className="flex gap-2" role="radiogroup" aria-label="Style">
                {(
                  [
                    ["strict", "Competitive"],
                    ["training", "Casual"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={style === id}
                    onClick={() => setStyle(id)}
                    className={`rounded-lg border px-3.5 py-2 text-[13px] font-bold transition-colors ${
                      style === id ? "border-up bg-up/10 text-up" : "border-line-hi text-dim hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-dim">
                {style === "strict"
                  ? "A wrong buy ends the round. Counts towards your personal bests."
                  : "A wrong buy costs 150 points and the round keeps going, so you can practise spotting the right one. No PBs."}
              </p>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Starting balance</div>
              <div className="flex gap-2" role="radiogroup" aria-label="Starting balance">
                {(Object.keys(PORTS) as Port[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={port === id}
                    onClick={() => setPort(id)}
                    className={`rounded-lg border px-3.5 py-2 text-left text-[13px] font-bold transition-colors ${
                      port === id ? "border-amber bg-amber/10 text-amber" : "border-line-hi text-dim hover:text-ink"
                    }`}
                  >
                    {PORTS[id].label}
                    <span className="tabular ml-1.5 text-[12px] font-semibold opacity-80">{PORTS[id].sol} SOL</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-dim">
                Buy sizes scale with it. Careful with size: a wallet over 4% of a coin&apos;s supply scares buyers off and it won&apos;t run.
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
          : "Each round: 3 s countdown, then an armed wait of 4 to 55 s, then the tweet. Your reaction is timed from the moment the right coin lands."}
      </p>

      {mode !== "dev" && <Progress difficulty={difficulty} length={length} />}

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

const OUTCOME: Record<RunRecord["outcome"], { label: string; tone: string }> = {
  success: { label: "Hit", tone: "text-up" },
  false_start: { label: "False start", tone: "text-amber" },
  wrong_coin: { label: "Wrong coin", tone: "text-down" },
  missed: { label: "Missed", tone: "text-down" },
};

const ms = (v: number | null) => (v === null ? "—" : `${Math.round(v)} ms`);

/** Personal bests and recent runs for the selected difficulty, from this browser's run history. */
function Progress({ difficulty, length }: { difficulty: keyof typeof DIFFICULTIES; length: "blitz" | "saga" }) {
  const runs = useRuns((r) => r.runs);
  const stats = useMemo(() => statsFor(runs, difficulty, { length }), [runs, difficulty, length]);
  const last = useMemo(() => runs.filter((r) => r.difficulty === difficulty && (r.length ?? "blitz") === length).slice(-10).reverse(), [runs, difficulty, length]);
  const tile = (k: string, v: string, tone = "text-ink") => (
    <div className="rounded-lg border border-line bg-panel px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={`tabular text-[17px] font-extrabold ${tone}`}>{v}</div>
    </div>
  );
  return (
    <section className="mt-5 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Your progress · {DIFFICULTIES[difficulty].label} · {length === "blitz" ? "Blitz" : "Saga"}
        </h2>
        <span className="text-[11px] text-faint">Kept in this browser</span>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-2">
        {tile("PB reaction", ms(stats.pbReactionMs), "text-amber")}
        {tile("Best score", stats.pbScore === null ? "—" : String(stats.pbScore), "text-amber")}
        {tile("Avg reaction", ms(stats.avgReactionMs))}
        {tile("Accuracy", stats.accuracyPct === null ? "—" : `${Math.round(stats.accuracyPct)}%`)}
        {tile("Best streak", String(stats.bestStreak))}
        {tile("Rounds", String(stats.runs))}
      </div>
      {last.length > 0 && (
        <table className="mt-3 w-full text-[12.5px]">
          <thead className="text-[10px] uppercase tracking-wider text-faint">
            <tr>
              <th className="py-1 text-left font-semibold">Last {last.length}</th>
              <th className="py-1 text-left font-semibold">Coin</th>
              <th className="py-1 text-right font-semibold">Reaction</th>
              <th className="py-1 text-right font-semibold">Score</th>
              <th className="py-1 text-right font-semibold">Look-alikes</th>
              <th className="py-1 text-right font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {last.map((r) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className={`py-1 font-bold ${OUTCOME[r.outcome].tone}`}>
                  {OUTCOME[r.outcome].label}
                  {r.training && <span className="ml-1.5 text-[10px] font-semibold text-faint">casual</span>}
                </td>
                <td className="py-1 font-semibold">{r.ticker}</td>
                <td className="tabular py-1 text-right">{ms(r.reactionMs)}</td>
                <td className="tabular py-1 text-right font-bold">{r.score}</td>
                <td className="tabular py-1 text-right text-dim">{r.decoys}</td>
                <td className="tabular py-1 text-right text-faint">{new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
