"use client";

import { useEffect, useMemo, useState } from "react";
import type { Engine } from "@/engine/engine";
import type { DevChoice, LaunchMode, RewardsMode } from "@/engine/dev";
import { DEPLOY_FEE_SOL } from "@/engine/dev";
import type { Launchpad, Pair } from "@/engine/types";
import { Art } from "../Art";
import { sol, usd } from "../format";
import { SolIcon } from "../icons";

const PAIRS: Pair[] = ["SOL", "SPACEX", "TESLA", "PUMP"];
const DEV_BUYS = [0.25, 0.5, 1, 2, 5];
const ORGANIC = [0.5, 1, 2, 5];

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
 * Launch a coin off a tweet, Proxima-style: the token (name and ticker, picture, config), the launch mode and
 * your buys, then a summary of what it opens at and costs. Keys: 1-5 pick the name, Enter deploys, Esc closes.
 */
export function LaunchPanel({ engine, scenarioId, now, devSol, onClose, onDeployed, notify }: Props) {
  const sc = engine.getDevScenario(scenarioId);
  const [nameIdx, setNameIdx] = useState<number | null>(null);
  const [imageIdx, setImageIdx] = useState<number | null>(null);
  const [launchpad, setLaunchpad] = useState<Launchpad>("pump");
  const [pair, setPair] = useState<Pair>("SOL");
  const [mode, setMode] = useState<LaunchMode>("organic");
  const [devBuy, setDevBuy] = useState(1);
  const [organic, setOrganic] = useState(1);
  const [rewards, setRewards] = useState<RewardsMode>("creator");

  const organicSol = mode === "organic" ? organic : 0;
  const cost = DEPLOY_FEE_SOL + devBuy + organicSol;
  const quote = useMemo(() => engine.quoteLaunch(devBuy, organicSol), [engine, devBuy, organicSol]);
  const ready = nameIdx !== null && imageIdx !== null && cost <= devSol + 1e-9 && !sc?.launchedCoinId;

  const deploy = () => {
    if (!sc || nameIdx === null || imageIdx === null) return;
    const choice: DevChoice = { nameIdx, imageIdx, launchpad, dividends: true, pair, mode, devBuySol: devBuy, organicSol, rewards };
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

          {/* 2. Mode and buys */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">2 · Launch mode</h3>
            <div className="grid grid-cols-3 gap-1.5">
              <ModeCard on={mode === "manual"} title="Manual" sub="Dev buy only" onPick={() => setMode("manual")} />
              <ModeCard on={mode === "organic"} title="Organic" sub="Dev buy + a few fresh wallets" onPick={() => setMode("organic")} />
              <ModeCard on={false} title="Block-0" sub="Bundle · coming next" locked />
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[12px]">
              <span className="font-semibold text-faint">Dev buy</span>
              <div className="flex flex-wrap gap-1.5">
                {DEV_BUYS.map((v) => (
                  <button key={v} type="button" className={chip(devBuy === v, "border-amber/70 bg-amber/10 text-amber")} onClick={() => setDevBuy(v)}>
                    {v} SOL
                  </button>
                ))}
              </div>
              {mode === "organic" && (
                <>
                  <span className="font-semibold text-faint">Organic buys</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ORGANIC.map((v) => (
                      <button key={v} type="button" className={chip(organic === v, "border-amber/70 bg-amber/10 text-amber")} onClick={() => setOrganic(v)}>
                        {v} SOL
                      </button>
                    ))}
                  </div>
                </>
              )}
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
            <p className="mt-1.5 text-[11px] leading-snug text-faint">
              {rewards === "creator"
                ? "You earn a cut of every trade (more on the curve, less on the pool). Claim it from the launch."
                : "Traders get the fee back instead: a bit more of them come, you earn nothing from volume."}
            </p>
          </section>

          {/* 3. Summary */}
          <section className="rounded-xl border border-line bg-card p-3.5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">3 · Summary</h3>
            <div className="tabular grid grid-cols-2 gap-y-1.5 text-[12.5px]">
              <span className="text-dim">Opens at</span>
              <span className="text-right font-bold">{usd(quote.mcUsd)} MC</span>
              <span className="text-dim">Supply you hold</span>
              <span className={`text-right font-bold ${quote.supplyPct >= 10 ? "text-down" : ""}`}>{quote.supplyPct.toFixed(2)}%</span>
              <span className="text-dim">Cost (fee {DEPLOY_FEE_SOL} + buys)</span>
              <span className="text-right font-bold">
                <SolIcon /> {sol(cost, 2)}
              </span>
              <span className="text-dim">Dev wallet after</span>
              <span className={`text-right font-bold ${cost > devSol ? "text-down" : ""}`}>
                <SolIcon /> {sol(devSol - cost, 2)}
              </span>
            </div>
            {quote.supplyPct >= 10 && <p className="mt-2 text-[11px] text-down">That much supply in your wallets looks like a bundle to anyone who checks.</p>}
          </section>
        </div>

        <footer className="border-t border-line px-5 py-3.5">
          <button
            type="button"
            disabled={!ready}
            onClick={deploy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet py-3 text-[15px] font-black text-white shadow-[0_0_24px_rgba(139,92,246,.35)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {sc.launchedCoinId ? "Already launched" : nameIdx === null || imageIdx === null ? "Pick a name and a picture" : cost > devSol ? "Not enough SOL" : "Deploy"}
            {ready && <kbd className="rounded bg-black/20 px-1.5 text-[11px]">Enter</kbd>}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function ModeCard({ on, title, sub, onPick, locked }: { on: boolean; title: string; sub: string; onPick?: () => void; locked?: boolean }) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onPick}
      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
        locked ? "cursor-not-allowed border-dashed border-line opacity-50" : on ? "border-violet bg-violet/15" : "border-line hover:border-line-hi"
      }`}
    >
      <div className="text-[13px] font-extrabold">{title}</div>
      <div className="text-[11px] leading-tight text-dim">{sub}</div>
    </button>
  );
}
