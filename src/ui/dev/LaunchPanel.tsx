"use client";

import { useEffect, useMemo, useState } from "react";
import type { Engine } from "@/engine/engine";
import type { DevChoice, RewardsMode, StrategyExit, StrategyStyle } from "@/engine/dev";
import { STRATEGY_STYLES, STRATEGY_TARGETS, strategyOdds } from "@/engine/dev";
import type { Launchpad, Pair } from "@/engine/types";
import { Art } from "../Art";
import { sol, usd } from "../format";
import { SolIcon } from "../icons";

const PAIRS: Pair[] = ["SOL", "SPACEX", "TESLA", "PUMP"];

interface Props {
  engine: Engine;
  scenarioId: string;
  now: number;
  devSol: number;
  onClose: () => void;
  onDeployed: (coinId: string) => void;
  notify: (text: string) => void;
}

/**
 * Launch a coin off a tweet: the token (name and ticker, picture, config), then a strategy (a target and a style,
 * hold or take profit there) with its estimate: what it costs line by line, your bag, holders, the exit and the odds.
 * The strategy sets the launch buys and runs the bots. Keys: 1-5 pick the name, Enter deploys, Esc closes.
 */
export function LaunchPanel({ engine, scenarioId, now, devSol, onClose, onDeployed, notify }: Props) {
  const sc = engine.getDevScenario(scenarioId);
  const [nameIdx, setNameIdx] = useState<number | null>(null);
  const [imageIdx, setImageIdx] = useState<number | null>(null);
  const [launchpad, setLaunchpad] = useState<Launchpad>("pump");
  const [pair, setPair] = useState<Pair>("SOL");
  const [style, setStyle] = useState<StrategyStyle>("balanced");
  const [target, setTarget] = useState<number>(250_000);
  const [exit, setExit] = useState<StrategyExit>("hold");
  const [rewards, setRewards] = useState<RewardsMode>("creator");

  const q = useMemo(() => engine.quoteStrategy({ targetUsd: target, style, exit }), [engine, target, style, exit]);
  const cost = q.totalSol;
  const ready = nameIdx !== null && imageIdx !== null && cost <= devSol + 1e-9 && !sc?.launchedCoinId;

  const deploy = () => {
    if (!sc || nameIdx === null || imageIdx === null) return;
    const choice: DevChoice = { nameIdx, imageIdx, launchpad, dividends: false, pair, mode: "manual", devBuySol: 0, organicSol: 0, rewards, strategy: { targetUsd: target, style, exit } };
    const r = engine.devDeploy(sc.id, choice);
    if (!r.ok) return notify(r.reason ?? "Deploy failed");
    notify(`Deployed $${sc.names[nameIdx].ticker} · ${((now - sc.tweetAt) / 1000).toFixed(1)} s after the tweet`);
    onDeployed(r.coinId!);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (sc && n >= 1 && n <= sc.names.length) {
        e.preventDefault();
        setNameIdx(n - 1);
      } else if (e.key === "Enter" && ready) {
        e.preventDefault();
        deploy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!sc) return null;
  const since = Math.max(0, (now - sc.tweetAt) / 1000);
  const chip = (on: boolean, tone = "border-violet/70 bg-violet/15 text-violet") =>
    `rounded-md border px-2.5 py-1.5 text-[12px] font-bold transition-colors ${on ? tone : "border-line text-dim hover:border-line-hi hover:text-ink"}`;

  return (
    <div data-modal className="fixed inset-0 z-40 flex justify-end bg-black/50" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-[560px] flex-col border-l border-line-hi bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet">Launch</div>
            <div className="text-[15px] font-extrabold">Off {sc.authorName}&apos;s tweet</div>
          </div>
          <div className="flex items-center gap-3">
            {sc.rivalFirst && <span className="rounded-md border border-down/60 bg-down/10 px-2 py-1 text-[11px] font-bold text-down">A rival&apos;s right coin is out</span>}
            <span className={`tabular rounded-md px-2 py-1 text-[13px] font-black ${since < 5 ? "bg-up/15 text-up" : since < 12 ? "bg-amber/15 text-amber" : "bg-down/15 text-down"}`}>
              +{since.toFixed(1)}s
            </span>
            <button type="button" onClick={onClose} className="text-dim hover:text-ink" aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* 1. Token */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">1 · Token</h3>
            <div className="mb-1.5 text-[11px] font-semibold text-faint">Name and ticker</div>
            <div className="grid grid-cols-1 gap-1.5">
              {sc.names.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setNameIdx(i)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    nameIdx === i ? "border-violet bg-violet/15" : "border-line hover:border-line-hi"
                  }`}
                >
                  <kbd className="rounded border border-line-hi px-1.5 text-[10px] text-faint">{i + 1}</kbd>
                  <span className="text-[14px] font-extrabold">${o.ticker}</span>
                  <span className="text-[13px] text-dim">{o.name}</span>
                </button>
              ))}
            </div>
            <div className="mb-1.5 mt-3 text-[11px] font-semibold text-faint">Picture</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sc.images.length}, minmax(0, 1fr))` }}>
              {sc.images.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setImageIdx(i)}
                  className={`overflow-hidden rounded-lg border-2 transition-colors ${imageIdx === i ? "border-violet" : "border-transparent hover:border-line-hi"}`}
                >
                  <Art art={a} className="aspect-square w-full" glyphSize={28} />
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
              <span className="font-semibold text-faint">Launchpad</span>
              <div className="flex gap-1.5">
                {(["pump", "bonk"] as Launchpad[]).map((l) => (
                  <button key={l} type="button" className={chip(launchpad === l)} onClick={() => setLaunchpad(l)}>
                    {l === "pump" ? "Pump" : "Bonk"}
                  </button>
                ))}
              </div>
              <span className="font-semibold text-faint">Pair</span>
              <div className="flex gap-1.5">
                {PAIRS.map((p) => (
                  <button key={p} type="button" className={chip(pair === p)} onClick={() => setPair(p)}>
                    /{p}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 2. Strategy */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">2 · Strategy</h3>
            <div className="mb-1.5 text-[11px] font-semibold text-faint">Run it to</div>
            <div className="grid grid-cols-6 gap-1.5">
              {STRATEGY_TARGETS.map((t) => (
                <button key={t} type="button" className={chip(target === t, "border-amber/70 bg-amber/10 text-amber")} onClick={() => setTarget(t)}>
                  {tLabel(t)}
                </button>
              ))}
            </div>
            <div className="mb-1.5 mt-3 text-[11px] font-semibold text-faint">Style</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(STRATEGY_STYLES) as StrategyStyle[]).map((k) => {
                const o = strategyOdds(k, target);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStyle(k)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${style === k ? "border-violet bg-violet/15" : "border-line hover:border-line-hi"}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-extrabold">{STRATEGY_STYLES[k].label}</span>
                      <span className={`text-[10px] font-bold ${ODDS_TONE[o]}`}>{o}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] leading-tight text-dim">{STRATEGY_STYLES[k].sub}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
              <span className="font-semibold text-faint">At the target</span>
              <div className="flex gap-1.5">
                <button type="button" className={chip(exit === "hold")} onClick={() => setExit("hold")}>
                  Hold, I exit
                </button>
                <button type="button" className={chip(exit === "auto")} onClick={() => setExit("auto")}>
                  Take profit
                </button>
              </div>
              <span className="font-semibold text-faint">Fees</span>
              <div className="flex gap-1.5">
                <button type="button" className={chip(rewards === "creator", "border-up/70 bg-up/10 text-up")} onClick={() => setRewards("creator")}>
                  Creator fees to you
                </button>
                <button type="button" className={chip(rewards === "cashback", "border-up/70 bg-up/10 text-up")} onClick={() => setRewards("cashback")}>
                  Cashback to holders
                </button>
              </div>
            </div>
          </section>

          {/* 3. Estimate */}
          <section className="rounded-xl border border-line bg-card p-3.5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">3 · Estimate</h3>
              <span className={`text-[11px] font-bold ${ODDS_TONE[strategyOdds(style, target)]}`}>
                Odds of {usd(target)}: {strategyOdds(style, target)}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {(
                [
                  ["Launch", q.launchSol],
                  ["Push", q.pushSol],
                  ["Volume", q.volumeSol],
                  ["Holders", q.holdersSol],
                  ["Defend", q.defendSol],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-md bg-black/20 py-1.5">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">{k}</div>
                  <div className="tabular text-[12px] font-extrabold">{sol(v, v < 10 ? 1 : 0)}</div>
                </div>
              ))}
            </div>
            <div className="tabular mt-2.5 grid grid-cols-2 gap-y-1.5 text-[12.5px]">
              <span className="text-dim">Up to (it stops at the target)</span>
              <span className={`text-right font-black ${cost > devSol ? "text-down" : ""}`}>
                <SolIcon /> {sol(cost, 1)}
              </span>
              <span className="text-dim">Opens at · your bag</span>
              <span className="text-right font-bold">
                {usd(q.openMcUsd)} · {q.launchPct.toFixed(0)}%
              </span>
              <span className="text-dim">At {usd(target)}: your bag</span>
              <span className="text-right font-bold">
                {q.targetPct.toFixed(0)}% ≈ {usd(q.bagUsdAtTarget)}
              </span>
              <span className="text-dim">Holders there</span>
              <span className="text-right font-bold">~{q.holdersAtTarget.toLocaleString("en-US")}</span>
              <span className="text-dim">Dump it all there</span>
              <span className="text-right font-bold text-amber">
                ≈ <SolIcon /> {sol(q.dumpSolAtTarget, 0)}
              </span>
              <span className="text-dim">Push time</span>
              <span className="text-right font-bold">~{Math.round(q.pushMinutes)} min</span>
              {q.launchPct >= 8 && (
                <>
                  <span className="text-dim">Hidden from bubble maps</span>
                  <span className="text-right font-bold text-up">
                    {q.graceMin[0]}-{q.graceMin[1]} min
                  </span>
                </>
              )}
              <span className="text-dim">Balance after (max)</span>
              <span className={`text-right font-bold ${cost > devSol ? "text-down" : ""}`}>
                <SolIcon /> {sol(Math.max(0, devSol - cost), 1)}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-faint">
              Odds assume the right coin, launched fast. A dump all at once is liquidity-limited; taking profit over time gets more. Late or wrong launches do
              worse whatever you spend.
            </p>
          </section>
        </div>

        <footer className="border-t border-line px-5 py-3.5">
          <button
            type="button"
            disabled={!ready}
            onClick={deploy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet py-3 text-[15px] font-black text-white shadow-[0_0_24px_rgba(139,92,246,.35)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {sc.launchedCoinId ? "Already launched" : nameIdx === null || imageIdx === null ? "Pick a name and a picture" : cost > devSol ? `Needs ${sol(cost, 1)} SOL: pick a smaller target` : "Deploy"}
            {ready && <kbd className="rounded bg-black/20 px-1.5 text-[11px]">Enter</kbd>}
          </button>
        </footer>
      </aside>
    </div>
  );
}

const ODDS_TONE = { High: "text-up", Medium: "text-amber", Low: "text-down" } as const;

/** Compact target label: $100K, $1M, $10M. */
const tLabel = (t: number) => (t >= 1e6 ? `$${t / 1e6}M` : `$${t / 1000}K`);
