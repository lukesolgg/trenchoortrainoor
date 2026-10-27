"use client";

import type { Flaw, RoundResult, ScoredView, WrongBuy } from "@/engine/types";
import { SCORE } from "@/engine/scoring";
import type { RunStats } from "@/store/runs";
import { Art } from "./Art";
import { ConfigChips } from "./chips";
import { signed, sol, usd } from "./format";

/** Center-screen countdown and the TWEET LANDED flash. Never blocks clicks: a click here is a false start. */
export function RoundOverlay({ scored, now }: { scored: ScoredView; now: number }) {
  if (scored.phase === "countdown") {
    const n = Math.max(1, Math.ceil((scored.tArm - now) / 1000));
    return (
      <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-black/20">
        <div className="text-center">
          <div key={n} className="anim-count text-[88px] font-black leading-none tracking-tighter text-white drop-shadow-[0_2px_16px_rgba(0,0,0,.6)]">
            {n}
          </div>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.2em] text-ink/80 drop-shadow-[0_1px_8px_rgba(0,0,0,.8)]">
            Get ready. Don&apos;t buy before the tweet.
          </p>
        </div>
      </div>
    );
  }
  const vamp = scored.vamps[scored.vamps.length - 1];
  if (scored.phase === "live" && vamp && now - vamp.tweetAt < 1400) {
    return (
      <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center">
        <div className="anim-go flex items-center gap-4 text-pink drop-shadow-[0_0_40px_rgba(255,79,166,.6)]">
          <span className="text-[56px] font-black leading-none">←</span>
          <span className="text-[56px] font-black leading-none tracking-tighter">NEW NARRATIVE</span>
        </div>
      </div>
    );
  }
  if (scored.phase === "live" && now - scored.tTweet < 1100 && !scored.hit) {
    return (
      <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center">
        <div className="anim-go flex items-center gap-4 text-up drop-shadow-[0_0_40px_rgba(46,230,166,.6)]">
          <span className="text-[64px] font-black leading-none">←</span>
          <span className="text-[64px] font-black leading-none tracking-tighter">TWEET LANDED</span>
        </div>
      </div>
    );
  }
  return null;
}

/** Status text for the strip under the nav. The strip itself changes colour by phase (see `statusStripClass`). */
export function RoundStatus({ scored, now }: { scored: ScoredView; now: number }) {
  switch (scored.phase) {
    case "countdown":
      return <span className="font-semibold text-dim">Starting…</span>;
    case "armed":
      return (
        <span className="flex items-center gap-2 text-[14px] font-extrabold uppercase tracking-wide text-amber">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber" />
          Armed: don&apos;t buy until the tweet lands
        </span>
      );
    case "live": {
      const t = Math.max(0, (now - scored.tTweet) / 1000);
      const fresh = now - scored.tTweet < 2000;
      const vamp = scored.vamps[scored.vamps.length - 1];
      if (scored.length === "saga") {
        const clock = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
        const newNarrative = vamp && now - vamp.tweetAt < 4000;
        return (
          <>
            <span className={`tabular rounded px-2.5 py-0.5 text-[14px] font-black ${fresh ? "bg-up text-black" : "bg-violet/20 text-violet"}`}>
              {fresh ? "TWEET LANDED" : "SAGA"} {clock}
            </span>
            {newNarrative ? (
              <span className="font-extrabold text-pink">NEW NARRATIVE: {vamp.name} (${vamp.ticker}). Find it.</span>
            ) : (
              <span className="text-dim">
                {scored.hit ? "Trade the story. " : "Buy the right coin. "}Watch the Tracker for catalysts and new narratives.{" "}
                <kbd className="rounded border border-line-hi px-1 text-[11px]">Space</kbd> ends it when you&apos;re flat.
              </span>
            )}
            {scored.vamps.length > 0 && (
              <span className="text-[12px] font-bold text-dim">
                Vamps {scored.vamps.filter((v) => v.reactionMs !== null).length}/{scored.vamps.length}
              </span>
            )}
          </>
        );
      }
      return (
        <>
          <span className={`tabular rounded px-2.5 py-0.5 text-[14px] font-black ${fresh ? "bg-up text-black" : "bg-up/15 text-up"}`}>
            {fresh ? "TWEET LANDED" : "LIVE"} {t.toFixed(1)}s
          </span>
          {scored.hit ? (
            <span className="font-bold text-up">
              Hit in {Math.round(scored.hit.reactionMs)} ms. Sell 100% to end the round.
            </span>
          ) : (
            <span className="text-dim">
              Buy the right coin. The round ends when you sell 100%. Not holding?{" "}
              <kbd className="rounded border border-line-hi px-1 text-[11px]">Space</kbd> ends it.
            </span>
          )}
          {scored.training && scored.misses.length > 0 && (
            <span className="font-bold text-down">
              {scored.misses.length} wrong (−{scored.misses.length * SCORE.wrongPenalty})
            </span>
          )}
        </>
      );
    }
    case "ended":
      return <span className="font-semibold text-dim">Round over</span>;
  }
}

/** Colours the status strip so the phase reads from the corner of your eye. */
export function statusStripClass(scored: ScoredView | null, now: number): string {
  if (!scored) return "bg-bg";
  if (scored.phase === "armed") return "bg-amber/[0.08] border-amber/40";
  const vamp = scored.vamps[scored.vamps.length - 1];
  if (scored.phase === "live" && vamp && now - vamp.tweetAt < 4000) return "bg-pink/20 border-pink/60";
  if (scored.phase === "live") return now - scored.tTweet < 2000 ? "bg-up/25 border-up/60" : "bg-up/[0.07] border-up/30";
  return "bg-bg";
}

export const FLAW_SHORT: Record<Flaw | "unrelated", string> = {
  ticker: "Wrong ticker",
  launchpad: "Launched on Bonk, not Pump",
  dividends: "Dividends are off",
  pair: "Wrong pair",
  unrelated: "Not the meme from the tweet",
};

export type Flash = { kind: "hit"; ms: number; rating: string; buyer: number } | { kind: "miss"; title: string; sub: string };

/** The instant reaction to a buy: green with your time, or red with what was wrong. */
export function BuyFlash({ flash }: { flash: Flash }) {
  const hit = flash.kind === "hit";
  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center">
      <div className={`absolute inset-0 ${hit ? "anim-edge-up" : "anim-edge-down"}`} />
      <div className={`anim-mult rounded-3xl border bg-black/75 px-10 py-6 text-center shadow-2xl backdrop-blur-md ${hit ? "border-up/50" : "border-down/50"}`}>
        {hit ? (
          <>
            <div className="tabular text-[104px] font-black leading-none tracking-tighter text-up drop-shadow-[0_0_40px_rgba(46,230,166,.55)]">
              {Math.round(flash.ms)}
              <span className="ml-1 text-[44px]">ms</span>
            </div>
            <div className="mt-2 text-[15px] font-extrabold uppercase tracking-[0.2em] text-ink drop-shadow-[0_1px_8px_rgba(0,0,0,.8)]">
              {flash.rating} · Buyer #{flash.buyer}
            </div>
          </>
        ) : (
          <>
            <div className="text-[84px] font-black leading-none tracking-tighter text-down drop-shadow-[0_0_40px_rgba(240,69,90,.55)]">{flash.title}</div>
            <div className="mt-2 text-[15px] font-bold text-ink drop-shadow-[0_1px_8px_rgba(0,0,0,.8)]">{flash.sub}</div>
          </>
        )}
      </div>
    </div>
  );
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

const Stat = ({ k, v, tone, sub }: { k: string; v: React.ReactNode; tone?: string; sub?: string }) => (
  <div className="rounded-xl border border-line bg-card px-3 py-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">{k}</div>
    <div className={`tabular mt-0.5 text-[18px] font-extrabold ${tone ?? "text-ink"}`}>{v}</div>
    {sub && <div className="text-[11px] text-dim">{sub}</div>}
  </div>
);

/** Score bar: how the 1000 splits between speed, entry and exit. */
function ScoreBreakdown({ r }: { r: RoundResult }) {
  const p = r.scoreParts;
  const saga = r.length === "saga";
  const hasV = r.vamps.length > 0;
  const speedMax = saga ? (hasV ? 450 : 600) : SCORE.speedMax;
  const exitMax = saga ? (hasV ? 250 : 300) : SCORE.exitMax;
  const seg = (v: number, color: string) => <span className={`h-full ${color}`} style={{ width: `${(v / 1000) * 100}%` }} />;
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[34px] font-black leading-none">{r.score}</span>
        <span className="text-[14px] font-bold text-dim">/ 1000</span>
      </div>
      <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-line">
        {seg(p.speed, "bg-up")}
        {seg(p.entry, "bg-blue")}
        {hasV && seg(p.vamps, "bg-pink")}
        {seg(p.exit, "bg-amber")}
      </div>
      <div className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim">
        <span>
          <span className="font-bold text-up">Speed {p.speed}</span>/{speedMax} · full at {SCORE.fastMs} ms, 0 at {SCORE.slowMs / 1000} s
        </span>
        <span>
          <span className="font-bold text-blue">Entry {p.entry}</span>/{SCORE.entryMax} · buyer #1-5 full, 0 by #40
        </span>
        {hasV && (
          <span>
            <span className="font-bold text-pink">Vamps {p.vamps}</span>/200 · how fast you got onto each new narrative
          </span>
        )}
        <span>
          <span className="font-bold text-amber">Exit {p.exit}</span>/{exitMax} · {saga ? "PnL across the whole story, full at +300%" : "PnL, full at +200%"}
        </span>
        {p.penalty > 0 && <span className="font-bold text-down">Penalties −{p.penalty}</span>}
      </div>
    </div>
  );
}

/** Saga: each new narrative, when its coin landed, and how fast you got on it. */
function VampList({ r }: { r: RoundResult }) {
  return (
    <section className="mt-3 rounded-xl border border-pink/30 bg-pink/[0.05] p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-pink">New narratives ({r.vamps.length})</h3>
      <ul className="mt-1.5 space-y-1 text-[12.5px]">
        {r.vamps.map((v, i) => (
          <li key={i} className="tabular flex items-center justify-between gap-3">
            <span>
              <span className="font-bold text-ink">${v.ticker}</span> <span className="text-dim">{v.name}</span>
              {v.appearAt !== null && <span className="text-faint"> · landed +{((v.appearAt - v.tweetAt) / 1000).toFixed(1)} s after its tweet</span>}
            </span>
            <span className={`font-bold ${v.reactionMs === null ? "text-down" : "text-up"}`}>
              {v.reactionMs === null ? "missed" : `${Math.round(v.reactionMs)} ms`}
              {v.wrong > 0 && <span className="ml-2 text-down">{v.wrong} wrong (−{v.wrong * 100})</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "+47 ms better than your PB" / "Missed PB by 89 ms" / "First PB". */
function PbLine({ r, prev }: { r: RoundResult; prev: RunStats }) {
  if (r.outcome !== "success" || r.reactionMs === null) return null;
  if (r.training) return <p className="mt-1 text-[13px] font-semibold text-faint">Training round: doesn&apos;t count towards PBs.</p>;
  const ms = Math.round(r.reactionMs);
  if (prev.pbReactionMs === null) return <p className="mt-1 text-[13px] font-extrabold text-amber">First PB on this difficulty: {ms} ms</p>;
  const d = Math.round(prev.pbReactionMs - r.reactionMs);
  return d > 0 ? (
    <p className="mt-1 text-[13px] font-extrabold text-amber">New PB! {d} ms better than your best ({Math.round(prev.pbReactionMs)} ms)</p>
  ) : (
    <p className="mt-1 text-[13px] font-semibold text-dim">
      Missed your PB ({Math.round(prev.pbReactionMs)} ms) by {-d} ms
    </p>
  );
}

const fmtMs = (v: number | null) => (v === null ? "—" : `${Math.round(v)} ms`);

export function ResultsOverlay({
  result: r,
  prev,
  session,
  onNext,
  onMenu,
}: {
  result: RoundResult;
  /** Stats before this round (for the PB comparison). */
  prev: RunStats;
  /** This session's stats including this round. */
  session: RunStats;
  onNext: () => void;
  onMenu: () => void;
}) {
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
      <div className="relative flex max-h-[92vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-line-hi bg-panel shadow-2xl">
        <span className={`absolute inset-x-0 top-0 h-[3px] ${head.edge}`} />
        <div className="overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${head.tone}`}>
                {head.kicker}
                {r.length === "saga" && <span className="ml-2 rounded bg-violet/20 px-1.5 py-px text-[10px] text-violet">SAGA</span>}
                {r.training && <span className="ml-2 rounded bg-card-hi px-1.5 py-px text-[10px] text-dim">TRAINING</span>}
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <h2 className={`tabular text-[54px] font-black leading-none tracking-tight ${r.outcome === "success" ? "text-ink" : head.tone}`}>{big}</h2>
                {r.rating && <span className="rounded-full border border-up/40 bg-up/10 px-2.5 py-0.5 text-[12px] font-bold text-up">{r.rating}</span>}
              </div>
              <PbLine r={r} prev={prev} />
              <p className="mt-2 max-w-xl text-[14px] leading-snug text-dim">{sub}</p>
            </div>
            <div className="shrink-0 rounded-xl border border-line bg-card px-4 py-3 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">This session</div>
              <div className="tabular mt-1 space-y-0.5 text-[12.5px] text-dim">
                <div>
                  Accuracy <span className="font-bold text-ink">{session.accuracyPct === null ? "—" : `${Math.round(session.accuracyPct)}%`}</span>{" "}
                  <span className="text-faint">
                    ({session.hits}/{session.runs})
                  </span>
                </div>
                <div>
                  Avg reaction <span className="font-bold text-ink">{fmtMs(session.avgReactionMs)}</span>
                </div>
                <div>
                  Streak <span className="font-bold text-ink">{session.streak}</span> · best <span className="font-bold text-ink">{session.bestStreak}</span>
                </div>
              </div>
            </div>
          </div>

          {r.outcome === "success" && <ScoreBreakdown r={r} />}

          <div className="mt-5 grid grid-cols-4 gap-2.5">
            <Stat k="Right coin landed" v={r.rightAppearMs === null ? "never" : `+${(r.rightAppearMs / 1000).toFixed(2)} s`} sub="after the tweet" />
            <Stat k="Look-alikes landed" v={String(r.decoys.length)} sub="each one thing wrong" />
            {r.outcome === "success" ? (
              <>
                <Stat k="Tweet to buy" v={`${((r.tweetToBuyMs ?? 0) / 1000).toFixed(2)} s`} sub={`buyer #${r.buyNumber} · entry ${usd(r.entryMcUsd ?? 0)}`} />
                <Stat
                  k="PnL"
                  v={`${signed(r.pnlSol)} SOL`}
                  sub={`${signed(r.pnlPct, 1)}% · spent ${sol(r.boughtSol)}`}
                  tone={r.pnlSol >= 0 ? "text-up" : "text-down"}
                />
              </>
            ) : (
              <>
                <Stat k="PB reaction" v={fmtMs(prev.pbReactionMs)} sub="this difficulty" />
                <Stat k="Best score" v={prev.pbScore === null ? "—" : String(prev.pbScore)} sub="this difficulty" />
              </>
            )}
          </div>

          {r.vamps.length > 0 && <VampList r={r} />}
          {r.wrongBuys.filter((w) => !w.vamp).length > 0 && <WrongList list={r.wrongBuys.filter((w) => !w.vamp)} />}

          <div className="mt-4 grid grid-cols-2 gap-3">
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
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-faint">Look-alikes that landed ({r.decoys.length}): each gets exactly one thing wrong</h3>
            {r.decoys.length === 0 ? (
              <p className="mt-2 text-[12px] text-faint">None had landed by the time the round ended.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {r.decoys.map((d, i) => (
                  <li key={i} className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${boughtDecoy(d) ? "bg-down/10 ring-1 ring-down/40" : ""}`}>
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

function WrongList({ list }: { list: WrongBuy[] }) {
  return (
    <section className="mt-3 rounded-xl border border-down/30 bg-down/[0.05] p-3">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-down">
        Wrong coins bought on the way ({list.length}) · −{list.length * SCORE.wrongPenalty}
      </h3>
      <ul className="mt-1.5 space-y-0.5 text-[12.5px]">
        {list.map((w, i) => (
          <li key={i} className="tabular text-dim">
            <span className="font-bold text-ink">{w.ticker}</span> at +{(w.atMs / 1000).toFixed(2)} s · {FLAW_SHORT[w.flaw]}
          </li>
        ))}
      </ul>
    </section>
  );
}

