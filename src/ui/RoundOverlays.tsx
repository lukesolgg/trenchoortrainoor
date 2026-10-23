"use client";

import type { Flaw, RoundResult, ScoredView } from "@/engine/types";
import { Art } from "./Art";
import { ConfigChips } from "./chips";
import { signed, sol, usd } from "./format";

/** Center-screen countdown, "armed" pill and the GO flash. Never blocks clicks: a click here is a false start. */
export function RoundOverlay({ scored, now }: { scored: ScoredView; now: number }) {
  if (scored.phase === "countdown") {
    const n = Math.max(1, Math.ceil((scored.tArm - now) / 1000));
    return (
      <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-black/55">
        <div className="text-center">
          <div key={n} className="anim-count text-[180px] font-black leading-none tracking-tighter text-white">
            {n}
          </div>
          <p className="mt-2 text-[14px] font-semibold uppercase tracking-[0.2em] text-dim">
            Get ready. Don&apos;t buy before the tweet.
          </p>
        </div>
      </div>
    );
  }
  if (scored.phase === "armed") {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[132px] z-30 flex justify-center">
        <div className="anim-armed rounded-full border border-amber/60 bg-bg/90 px-5 py-2 text-[13px] font-extrabold uppercase tracking-[0.18em] text-amber">
          Armed. Wait for the tweet.
        </div>
      </div>
    );
  }
  if (scored.phase === "live" && now - scored.tTweet < 900) {
    return (
      <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center">
        <div className="anim-go text-[150px] font-black leading-none tracking-tighter text-up drop-shadow-[0_0_40px_rgba(46,230,166,.6)]">
          GO
        </div>
      </div>
    );
  }
  return null;
}

/** Status text for the session strip. */
export function RoundStatus({ scored, now }: { scored: ScoredView; now: number }) {
  switch (scored.phase) {
    case "countdown":
      return <span className="font-semibold text-dim">Starting…</span>;
    case "armed":
      return <span className="font-bold text-amber">ARMED: don&apos;t buy until the tweet lands</span>;
    case "live":
      return (
        <>
          <span className="tabular rounded bg-up/15 px-2 py-0.5 font-bold text-up">
            LIVE {Math.max(0, (now - scored.tTweet) / 1000).toFixed(1)}s
          </span>
          <span className="text-dim">
            Buy the right coin. <kbd className="rounded border border-line-hi px-1 text-[11px]">Space</kbd> ends the
            round and closes your position.
          </span>
        </>
      );
    case "ended":
      return <span className="font-semibold text-dim">Round over</span>;
  }
}

function flawReason(flaw: Flaw | "unrelated" | null, ticker: string, config: { pair: string }, right: RoundResult["rightCoin"]) {
  switch (flaw) {
    case "ticker":
      return `Wrong ticker: ${ticker}, the best one is ${right.ticker}`;
    case "launchpad":
      return "Launched on Bonk, not Pump";
    case "dividends":
      return "Dividends are off";
    case "pair":
      return `Wrong pair: /${config.pair}, the author's pair is /${right.config.pair}`;
    case "unrelated":
      return "Not the meme from the tweet";
    default:
      return "";
  }
}

const HEAD = {
  success: { kicker: "Round complete", tone: "text-up", edge: "bg-up" },
  false_start: { kicker: "False start", tone: "text-amber", edge: "bg-amber" },
  wrong_coin: { kicker: "Wrong coin", tone: "text-down", edge: "bg-down" },
  missed: { kicker: "Missed it", tone: "text-down", edge: "bg-down" },
} as const;

const Stat = ({ k, v, tone }: { k: string; v: string; tone?: string }) => (
  <div className="rounded-xl border border-line bg-card px-3 py-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular mt-0.5 text-[18px] font-extrabold ${tone ?? "text-ink"}`}>{v}</div>
  </div>
);

export function ResultsOverlay({ result: r, onNext, onMenu }: { result: RoundResult; onNext: () => void; onMenu: () => void }) {
  const head = HEAD[r.outcome];
  const landed = r.rightAppearMs !== null ? `${(r.rightAppearMs / 1000).toFixed(1)}s after the tweet` : "never";

  let big = "";
  let sub = "";
  switch (r.outcome) {
    case "success":
      big = `${Math.round(r.reactionMs ?? 0)} ms`;
      sub = `The right coin landed ${landed}. You were buyer #${r.buyNumber}.`;
      break;
    case "false_start":
      big = "Too early";
      sub = `You bought ${Math.round(r.earlyMs ?? 0)} ms before the tweet landed. Wait for it.`;
      break;
    case "wrong_coin":
      big = r.bought?.ticker ?? "";
      sub = flawReason(r.bought?.flaw ?? null, r.bought?.ticker ?? "", r.bought?.config ?? r.rightCoin.config, r.rightCoin);
      break;
    case "missed":
      big = "No buy";
      sub = `The right coin landed ${landed}, and you did not buy it.`;
      break;
  }

  const boughtDecoy = (d: RoundResult["decoys"][number]) =>
    r.bought !== null &&
    r.bought.ticker === d.ticker &&
    r.bought.config.pair === d.config.pair &&
    r.bought.config.launchpad === d.config.launchpad &&
    r.bought.config.dividends === d.config.dividends;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Round result">
      <div className="relative flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-line-hi bg-panel shadow-2xl">
        <span className={`absolute inset-x-0 top-0 h-[3px] ${head.edge}`} />
        <div className="overflow-y-auto p-6">
          <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${head.tone}`}>{head.kicker}</p>
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className={`tabular text-[54px] font-black leading-none tracking-tight ${r.outcome === "success" ? "text-ink" : head.tone}`}>{big}</h2>
            {r.rating && (
              <span className="rounded-full border border-up/40 bg-up/10 px-2.5 py-0.5 text-[12px] font-bold text-up">{r.rating}</span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-[14px] leading-snug text-dim">{sub}</p>

          {r.outcome === "success" && (
            <div className="mt-5 grid grid-cols-4 gap-2.5">
              <Stat k="Reaction" v={`${Math.round(r.reactionMs ?? 0)} ms`} />
              <Stat k="Tweet to buy" v={`${((r.tweetToBuyMs ?? 0) / 1000).toFixed(2)} s`} />
              <Stat k="Buyer" v={`#${r.buyNumber}`} />
              <Stat k="Entry MC" v={usd(r.entryMcUsd ?? 0)} />
              <Stat k="Spent" v={`◎ ${sol(r.boughtSol)}`} />
              <Stat k="Closed for" v={`◎ ${sol(r.closedSol)}`} />
              <div className="col-span-2">
                <Stat
                  k="PnL"
                  v={`${signed(r.pnlSol)} SOL (${signed(r.pnlPct, 1)}%)`}
                  tone={r.pnlSol >= 0 ? "text-up" : "text-down"}
                />
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <section className="rounded-xl border border-line bg-card p-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-faint">The tweet</h3>
              <p className="mt-1 text-[11px] text-dim">
                {r.authorName} <span className="text-faint">@{r.authorHandle}</span>
              </p>
              <p className="mt-1.5 text-[14px] leading-snug">
                {r.tweetSegments.map((s, i) =>
                  s.hl ? (
                    <mark key={i} className="rounded bg-pink/90 px-1 py-px font-medium text-white">
                      {s.text}
                    </mark>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </p>
            </section>
            <section className="rounded-xl border border-up/30 bg-up/[0.04] p-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-up">The right coin</h3>
              <div className="mt-2 flex items-center gap-3">
                <Art art={r.rightCoin.art} className="h-12 w-12 shrink-0 rounded-lg border border-line-hi" glyphSize={24} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[16px] font-extrabold">{r.rightCoin.ticker}</span>
                    <ConfigChips config={r.rightCoin.config} />
                  </div>
                  <div className="text-[12px] text-dim">{r.rightCoin.name}</div>
                </div>
              </div>
            </section>
          </div>

          <section className="mt-3 rounded-xl border border-line bg-card p-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-faint">
              Look-alikes that landed ({r.decoys.length}): each gets exactly one thing wrong
            </h3>
            {r.decoys.length === 0 ? (
              <p className="mt-2 text-[12px] text-faint">None had landed by the time the round ended.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {r.decoys.map((d, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${boughtDecoy(d) ? "bg-down/10 ring-1 ring-down/40" : ""}`}
                  >
                    <Art art={d.art} className="h-8 w-8 shrink-0 rounded-md border border-line-hi" glyphSize={16} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[12px] font-bold">{d.ticker}</span>
                        <ConfigChips config={d.config} />
                        {boughtDecoy(d) && <span className="text-[10px] font-bold text-down">YOU BOUGHT</span>}
                      </div>
                      <div className="text-[11px] text-down">{flawReason(d.flaw, d.ticker, d.config, r.rightCoin)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-line bg-bg/60 px-6 py-3.5">
          <button
            type="button"
            onClick={onMenu}
            className="rounded-lg border border-line-hi px-4 py-2 text-[13px] font-semibold text-dim transition-colors hover:text-ink"
          >
            Menu <kbd className="ml-1 text-faint">Esc</kbd>
          </button>
          <button
            type="button"
            onClick={onNext}
            autoFocus
            className="flex items-center gap-2 rounded-lg bg-up px-5 py-2.5 text-[14px] font-extrabold text-black shadow-[0_0_24px_rgba(46,230,166,.35)] transition-[filter] hover:brightness-110"
          >
            Next round <kbd className="rounded bg-black/20 px-1.5 text-[11px]">R</kbd>
            <kbd className="rounded bg-black/20 px-1.5 text-[11px]">Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
