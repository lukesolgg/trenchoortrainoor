"use client";

import { useEffect, useMemo } from "react";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/engine/difficulty";
import { statsFor, useRuns, type RunRecord } from "@/store/runs";
import { PORTS, useUi, type Port } from "@/store/ui";

const COPY = {
  trader: {
    title: "Trader mode",
    lead: "Quick-buy the first right pair the moment it hits New Pairs: the best ticker, on Pump, with Dividends on, paired the way the tweet's author trades.",
    steps: [
      ["Read the tweet", "Work out the meme from an authority account and its best ticker."],
      ["Check the config", "The right coin is on Pump with Dividends on. The pair follows the author: /SPACEX for Elon (/TESLA for Tesla tweets), SOL for Toly and Solana, /PUMP for Alon, Ansem, Truth Terminal, pump.fun, Trench Report and Lowcap Larry. Look-alikes get exactly one thing wrong."],
      ["Quick-buy it first", "Hit the ⚡ button on its card. Buy before the tweet and it is a false start; buy a look-alike and the round ends (Casual lets you keep going). The round ends when you sell 100%. Score: speed up to 800, entry up to 100, exit up to 100."],
    ],
  },
  dev: {
    title: "Dev mode",
    lead: "Launch the meme from the tweet before the rival devs do, then run it: bond it, push it, and get your SOL out before it dies.",
    steps: [
      ["Hit Dev on a tweet", "Every meme tweet on the Tracker can be launched. Skip the ones you don't rate; launch as many as you like."],
      ["Get it right", "Pick the right name and ticker and the right picture, then the config: Pump and the author's pair. A wrong ticker never bonds; a wrong picture or config cuts the buyers."],
      ["Beat the rivals", "Rival devs launch their own versions a few seconds behind. The first right coin gets the narrative; late ones get scraps."],
      ["Pick a strategy", "Choose a target ($100K to $10M) and a style: Organic, Balanced or Aggressive. The estimate shows the cost, your bag, holders and the exit. The strategy runs the bundle and bots for you."],
      ["Get out", "Hold at the target and exit when you like (take profit, sell part of the bag, Nuke), or let it take profit on its own. A launch card shows how it went."],
    ],
  },
  both: {
    title: "Trader + Dev",
    lead: "Both games on one board and one balance: dev the tweets you rate, and trade the runners and everyone else's launches.",
    steps: [
      ["Dev a tweet", "Hit Dev on a meme tweet, get the name, picture and config right, pick a strategy and deploy before the rivals."],
      ["Or trade it", "Tweets also bring runners and look-alikes: trade them with your trading wallets, nothing is scored."],
      ["One balance", "Your launches and your trades come out of the same SOL. Watch your realised PnL in the launches bar."],
    ],
  },
} as const;

export function Setup() {
  const { mode, difficulty, setDifficulty, start, toModes, style, setStyle, length, setLength, port, setPort, devBalance, setDevBalance } = useUi();
  const devish = mode === "dev" || mode === "both";
  const copy = COPY[mode === "both" ? "both" : mode === "dev" ? "dev" : "trader"];
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
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">{devish ? "Dev" : "Standalone"} · everything unlocked</p>
      <h1 className="mt-1 text-[40px] font-black leading-none tracking-tight">{copy.title}</h1>
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
            {devish && (
              <div>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Dev wallet</div>
                <div className="flex gap-2" role="radiogroup" aria-label="Dev wallet">
                  {([10, 50, 200, 1000] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={devBalance === n}
                      onClick={() => setDevBalance(n)}
                      className={`rounded-lg border px-3.5 py-2 text-[13px] font-bold transition-colors ${
                        devBalance === n ? "border-violet bg-violet/15 text-violet" : "border-line-hi text-dim hover:text-ink"
                      }`}
                    >
                      {n} SOL
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-dim">
                  Pays the 0.02 SOL deploy fee, your dev buy and any organic buys. Options to pick from: 3 on Easy, 4 on Medium, 5 on Hard. Rivals land faster the harder it is.
                </p>
              </div>
            )}
            {!devish && (
            <>
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
                Buy sizes scale with it. You have five wallets: one holding 5%+ of a coin scares buyers off (it only climbs a quarter as far). There's no cap on the total, so split big bags.
              </p>
            </div>
            </>
            )}
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
        {mode === "both"
          ? "A Trader + Dev session runs until you leave: dev tweets every 35-55 s and a tweet with its runner every 30-60 s."
          : mode === "dev"
          ? "A Dev session runs until you leave: a new tweet every 35-55 s. Your trader wallet is there too, for trading other coins."
          : "Each round: 3 s countdown, then an armed wait of 4 to 30 s, then the tweet. Your reaction is timed from the moment the right coin lands."}
      </p>

      {!devish && <Progress difficulty={difficulty} length={length} />}

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
          {devish ? "Start session" : "Start round"} <kbd className="rounded bg-black/20 px-1.5 text-[11px]">Space</kbd>
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
