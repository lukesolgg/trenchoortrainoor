"use client";

import { useEffect, useMemo, useState } from "react";
import type { Engine } from "@/engine/engine";
import type { DevChoice, LaunchKind, LaunchPlan, RewardsMode } from "@/engine/dev";
import { BUNDLE_BUILDS, DEPLOY_FEE_SOL, DEV_BUY_RANGE, LAUNCH_KINDS, ORGANIC_WALLETS, PLAN_SNIPERS, planWallets } from "@/engine/dev";
import type { Launchpad, Pair } from "@/engine/types";
import { Art } from "../Art";
import { sol, usd } from "../format";
import { SolIcon } from "../icons";
import { Slider } from "./Slider";

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
 * Fill out the coin and launch it. The name, ticker, picture, launchpad and pair come prefilled from the tweet:
 * right most of the time, now and then a near miss, so check them. Then how it launches (Organic, Balanced,
 * Aggressive), spelled out in wallets and SOL. How far to run it is set on the coin's page once it is live.
 * Enter deploys, Esc closes.
 */
export function LaunchPanel({ engine, scenarioId, now, devSol, onClose, onDeployed, notify }: Props) {
  const sc = engine.getDevScenario(scenarioId);
  const pre = sc?.prefill;
  const [name, setName] = useState(pre?.name ?? "");
  const [ticker, setTicker] = useState(pre?.ticker ?? "");
  const [imageIdx, setImageIdx] = useState(pre?.imageIdx ?? 0);
  const [launchpad, setLaunchpad] = useState<Launchpad>(pre?.launchpad ?? "pump");
  const [pair, setPair] = useState<Pair>(pre?.pair ?? "SOL");
  const [kind, setKind] = useState<LaunchKind>("balanced");
  const [amounts, setAmounts] = useState<Record<LaunchKind, number>>({
    organic: LAUNCH_KINDS.organic.def,
    balanced: LAUNCH_KINDS.balanced.def,
    aggressive: LAUNCH_KINDS.aggressive.def,
  });
  const [devBuy, setDevBuy] = useState(1);
  const [rewards, setRewards] = useState<RewardsMode>("creator");

  const plan: LaunchPlan = { kind, amount: amounts[kind] };
  const q = useMemo(() => engine.quotePlan(devBuy, { kind, amount: amounts[kind] }), [engine, devBuy, kind, amounts]);
  const wallets = planWallets(plan);
  const cost = q.costSol;
  const ready = !!ticker.trim() && cost <= devSol + 1e-9 && !sc?.launchedCoinId;

  const deploy = () => {
    if (!sc || !ready) return;
    const choice: DevChoice = {
      name,
      ticker,
      nameIdx: 0,
      imageIdx,
      launchpad,
      dividends: false,
      pair,
      mode: "manual",
      devBuySol: devBuy,
      organicSol: 0,
      rewards,
      launch: plan,
    };
    const r = engine.devDeploy(sc.id, choice);
    if (!r.ok) return notify(r.reason ?? "Deploy failed");
    notify(`Deployed $${ticker.replace(/^\$/, "").toUpperCase()} · ${((now - sc.tweetAt) / 1000).toFixed(1)} s after the tweet`);
    onDeployed(r.coinId!);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && ready) {
        e.preventDefault();
        deploy();
      } else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!sc) return null;
  const since = Math.max(0, (now - sc.tweetAt) / 1000);
  const chip = (on: boolean, tone = "border-violet/70 bg-violet/15 text-violet") =>
    `rounded-md border px-2.5 py-1.5 text-[12px] font-bold transition-colors ${on ? tone : "border-line text-dim hover:border-line-hi hover:text-ink"}`;
  const each = (total: number, n: number) => sol(total / n, total / n < 1 ? 2 : 1);
  const explain =
    kind === "organic"
      ? `Your dev wallet buys ${sol(devBuy, 2)} SOL in the create. Then ${ORGANIC_WALLETS} fresh wallets buy about ${each(amounts.organic, ORGANIC_WALLETS)} SOL each over the first 1-6 s, after launch, so snipers usually get in first (expect ${PLAN_SNIPERS.organic}). Looks the most natural.`
      : kind === "balanced"
        ? `Your dev wallet buys ${sol(devBuy, 2)} SOL in the create, and ${wallets} hop-funded wallets buy ${each(amounts.balanced, wallets)} SOL each in block 0 (the same block), ahead of every sniper (expect ${PLAN_SNIPERS.balanced}).`
        : `Your dev wallet buys ${sol(devBuy, 2)} SOL in the create, and ${wallets} aged, CEX-funded wallets take ${amounts.aggressive}% of supply in block 0 in varied sizes (about ${sol(q.bundleSol, 0)} SOL). Snipers find little left (expect ${PLAN_SNIPERS.aggressive}). Close to bonding from the first block.`;

  return (
    <div data-modal className="fixed inset-0 z-40 flex justify-end bg-black/50" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-[560px] flex-col border-l border-line-hi bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet">Launch</div>
            <div className="truncate text-[15px] font-extrabold">Off {sc.authorName}&apos;s tweet</div>
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
          <blockquote className="rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] leading-snug text-ink/90">{sc.text}</blockquote>

          {/* 1. Coin */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">1 · Coin</h3>
              <span className="text-[10.5px] text-faint">Prefilled from the tweet. Check it: now and then something&apos;s off.</span>
            </div>
            <div className="grid grid-cols-[1fr_150px] gap-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-faint">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  spellCheck={false}
                  className="mt-0.5 w-full rounded-md border border-line bg-black/30 px-2.5 py-2 text-[14px] font-bold outline-none focus:border-violet"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-faint">Ticker</span>
                <div className="mt-0.5 flex items-center rounded-md border border-line bg-black/30 focus-within:border-violet">
                  <span className="pl-2.5 text-[14px] font-bold text-dim">$</span>
                  <input
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.replace(/^\$/, "").toUpperCase())}
                    spellCheck={false}
                    className="w-full bg-transparent px-1 py-2 text-[14px] font-extrabold outline-none"
                  />
                </div>
              </label>
            </div>
            <div className="mb-1.5 mt-3 text-[11px] font-semibold text-faint">Picture</div>
            <div className="flex gap-2">
              <Art art={sc.images[imageIdx]} className="h-24 w-24 shrink-0 rounded-lg border-2 border-violet" glyphSize={32} />
              <div className="grid flex-1 grid-cols-5 content-start gap-1.5">
                {sc.images.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setImageIdx(i)}
                    className={`overflow-hidden rounded-md border-2 transition-colors ${imageIdx === i ? "border-violet" : "border-transparent opacity-70 hover:opacity-100"}`}
                    aria-label={`Picture ${i + 1}`}
                  >
                    <Art art={a} className="aspect-square w-full" glyphSize={18} />
                  </button>
                ))}
              </div>
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

          {/* 2. Launch */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">2 · How it launches</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(LAUNCH_KINDS) as LaunchKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${kind === k ? "border-violet bg-violet/15" : "border-line hover:border-line-hi"}`}
                >
                  <div className="text-[13px] font-extrabold">{LAUNCH_KINDS[k].label}</div>
                  <div className="text-[11px] leading-tight text-dim">
                    {LAUNCH_KINDS[k].sub} · {k === "organic" ? `${ORGANIC_WALLETS} wallets` : `${planWallets({ kind: k, amount: amounts[k] })} wallets`}
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 rounded-md bg-black/20 px-3 py-2 text-[12px] leading-snug text-ink/90">{explain}</p>
            <div className="mt-2.5 space-y-2">
              <Slider
                label="Dev buy (public dev wallet)"
                value={devBuy}
                min={DEV_BUY_RANGE[0]}
                max={DEV_BUY_RANGE[1]}
                step={0.25}
                format={(v) => `${sol(v, 2)} SOL`}
                onChange={setDevBuy}
              />
              <Slider
                label={kind === "aggressive" ? "Block-0 share of supply" : kind === "balanced" ? "Block-0 buys (all wallets)" : "After-launch buys (all wallets)"}
                value={amounts[kind]}
                min={LAUNCH_KINDS[kind].range[0]}
                max={LAUNCH_KINDS[kind].range[1]}
                step={LAUNCH_KINDS[kind].step}
                format={(v) => (LAUNCH_KINDS[kind].unit === "%" ? `${v}%` : `${sol(v, 2)} SOL`)}
                onChange={(v) => setAmounts((a) => ({ ...a, [kind]: v }))}
              />
            </div>
          </section>

          {/* 3. Summary */}
          <section className="rounded-xl border border-line bg-card p-3.5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">3 · Summary</h3>
            <div className="tabular grid grid-cols-2 gap-y-1.5 text-[12.5px]">
              <span className="text-dim">Wallets</span>
              <span className="text-right font-bold">
                Dev + {wallets} {kind === "organic" ? "after launch" : "in block 0"}
              </span>
              <span className="text-dim">Opens at</span>
              <span className="text-right font-bold">{usd(q.mcUsd)} MC</span>
              <span className="text-dim">Supply you hold</span>
              <span className="text-right font-bold">{q.supplyPct.toFixed(1)}%</span>
              <span className="text-dim">Snipers to expect</span>
              <span className="text-right font-bold">{PLAN_SNIPERS[kind]}</span>
              {kind !== "organic" && (
                <>
                  <span className="text-dim">Hidden from bubble maps</span>
                  <span className="text-right font-bold text-up">
                    {BUNDLE_BUILDS[kind === "balanced" ? "clean" : "full"].graceMin.join("-")} min
                  </span>
                </>
              )}
              <span className="text-dim">Cost (fee {DEPLOY_FEE_SOL} + buys{q.walletCostSol > 0 ? " + funding" : ""})</span>
              <span className={`text-right font-black ${cost > devSol ? "text-down" : ""}`}>
                <SolIcon /> {sol(cost, 2)}
              </span>
              <span className="text-dim">Balance after</span>
              <span className={`text-right font-bold ${cost > devSol ? "text-down" : ""}`}>
                <SolIcon /> {sol(Math.max(0, devSol - cost), 2)}
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[12px]">
              <span className="mr-1 font-semibold text-faint">Fees</span>
              <button type="button" className={chip(rewards === "creator", "border-up/70 bg-up/10 text-up")} onClick={() => setRewards("creator")}>
                Creator fees to you
              </button>
              <button type="button" className={chip(rewards === "cashback", "border-up/70 bg-up/10 text-up")} onClick={() => setRewards("cashback")}>
                Cashback to holders
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-faint">How far to run it (push, volume, holders, dip defence, taking profit) is set on the coin&apos;s page once it&apos;s live.</p>
          </section>
        </div>

        <footer className="border-t border-line px-5 py-3.5">
          <button
            type="button"
            disabled={!ready}
            onClick={deploy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet py-3 text-[15px] font-black text-white shadow-[0_0_24px_rgba(139,92,246,.35)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {sc.launchedCoinId ? "Already launched" : !ticker.trim() ? "Give it a ticker" : cost > devSol ? "Not enough SOL" : "Deploy"}
            {ready && <kbd className="rounded bg-black/20 px-1.5 text-[11px]">Enter</kbd>}
          </button>
        </footer>
      </aside>
    </div>
  );
}
