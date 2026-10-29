"use client";

import { useState, type ReactNode } from "react";
import { LAUNCH_KINDS, RUN_DEFAULTS, RUN_RANGES, RUN_TARGETS, type RunConfig } from "@/engine/dev";
import type { Engine } from "@/engine/engine";
import type { LaunchView } from "@/engine/types";
import { sol, usd } from "../format";
import { SolIcon } from "../icons";
import { LaunchCheckTip } from "./LaunchCheckTip";
import { Slider } from "./Slider";

interface Props {
  engine: Engine;
  l: LaunchView;
  now: number;
  holders: number;
  balance: number;
  notify: (text: string) => void;
  onReport: () => void;
  /** Below everything: promotion. */
  children?: ReactNode;
}

type Phase = NonNullable<LaunchView["strategy"]>["phase"];
const PHASE: Record<Phase, { label: string; tone: string }> = {
  push: { label: "Pushing", tone: "bg-violet/20 text-violet" },
  hold: { label: "Holding", tone: "bg-up/15 text-up" },
  profit: { label: "Taking profit", tone: "bg-amber/15 text-amber" },
  stalled: { label: "Stalled", tone: "bg-down/15 text-down" },
  done: { label: "Stopped", tone: "bg-line text-dim" },
};
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const tLabel = (t: number) => (t >= 1e6 ? `$${t / 1e6}M` : `$${t / 1000}K`);

/**
 * Your live launch: the wallets holding it, group by group, each with its own sells; buys into the dev wallet or the
 * launch wallets; and the run strategy (push, volume, holders, dip defence, taking profit) set with sliders.
 */
export function LaunchControl({ engine, l, now, holders, balance, notify, onReport, children }: Props) {
  const off = !Object.values(l.check).every(Boolean);
  const quiet = off && !l.bonded && now - l.launchedAt > 15_000;
  const live = !l.ended;

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-line">
      <div className="border-b border-line bg-violet/[0.04] p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[13px] font-bold">
            Your launch <span className="ml-1 rounded bg-violet/20 px-1.5 py-px text-[10px] font-black text-violet">DEV</span>
          </h3>
          <LaunchCheckTip l={l} align="right">
            <button type="button" onClick={onReport} className="text-[11px] font-semibold text-dim hover:text-ink">
              <span className={off ? "text-down" : "text-up"}>{off ? `✗ ${Object.values(l.check).filter((x) => !x).length} wrong` : "✓ all right"}</span> · Report →
            </button>
          </LaunchCheckTip>
        </div>
        {quiet && (
          <LaunchCheckTip l={l}>
            <div className="mb-2 cursor-help rounded-md border border-amber/50 bg-amber/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber">
              Buyers aren&apos;t biting. Something about this launch is off. <span className="font-bold underline decoration-dotted">Hover to see what.</span>
            </div>
          </LaunchCheckTip>
        )}
        {l.bundle.flagged ? (
          <div className="mb-2 rounded-md border border-down/60 bg-down/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-down">
            <span className="font-black">BUNDLED {l.bundle.flagged.pct.toFixed(0)}%</span> · called out {Math.round((l.bundle.flagged.at - l.launchedAt) / 1000)} s in. Buyers thin
            out and KOLs won&apos;t touch it.
          </div>
        ) : l.bundle.clusterPct >= 6 && l.bundle.hiddenForMs > 0 ? (
          <div className="tabular mb-2 flex items-center justify-between gap-2 whitespace-nowrap rounded-md border border-up/40 bg-up/[0.05] px-2.5 py-1.5 text-[11.5px] text-up">
            <span>
              Hidden from bubble maps · <span className="font-bold">{mmss(l.bundle.hiddenForMs)}</span>
            </span>
            <span className="text-dim">then {Math.round(l.bundle.risk * 100)}%/check</span>
          </div>
        ) : null}

        <Wallets engine={engine} l={l} balance={balance} live={live} notify={notify} />

        <div className="tabular mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
          <Stat k="Spent" v={sol(l.spentSol, 1)} sub="SOL in" />
          <Stat k="Realised" v={`${l.pnlSol >= 0 ? "+" : ""}${sol(l.pnlSol, 1)}`} sub="SOL" tone={l.pnlSol >= 0 ? "text-up" : "text-down"} />
          <Stat k="Holders" v={holders.toLocaleString("en-US")} sub={l.snipers.count ? `${l.snipers.count} snipers in` : "on chain"} />
        </div>
      </div>

      {live && <RunPanel key={l.coinId} engine={engine} l={l} balance={balance} notify={notify} />}
      {children}
    </aside>
  );
}

/** Every wallet group holding your launch, with its own sells; buys; sell-all, fees and Nuke. */
function Wallets({ engine, l, balance, live, notify }: { engine: Engine; l: LaunchView; balance: number; live: boolean; notify: (t: string) => void }) {
  const [into, setInto] = useState<"deployer" | "launch">("launch");
  const id = l.coinId;
  const sell = (group: "deployer" | "launch" | "bot" | "holder", f: number, label: string) => {
    const r = engine.sellGroup(id, group, f);
    notify(r.ok ? `Sold ${f * 100}% of ${label}: +${sol(r.sol ?? 0)} SOL` : (r.reason ?? "Nothing to sell"));
  };
  const solOf = (pct: number) => (l.totalPct > 0 ? (pct / l.totalPct) * l.holdingsSol : 0);
  const rows: { key: "deployer" | "launch" | "bot" | "holder"; name: string; sub: string; pct: number; tone: string }[] = [
    { key: "deployer", name: "Dev wallet", sub: "public: DEV on the chart", pct: l.deployerPct, tone: "text-amber" },
    {
      key: "launch",
      name: `Launch wallets · ${l.walletCounts.launch}`,
      sub: l.plan ? `${LAUNCH_KINDS[l.plan.kind].label}: ${l.plan.kind === "organic" ? "bought after launch" : "block 0"}, look like anyone` : "look like anyone",
      pct: l.holdersPct,
      tone: "text-violet",
    },
  ];
  if (l.botWalletPcts.some((x) => x > 0)) rows.push({ key: "bot", name: `Push wallets · ${l.walletCounts.bot}`, sub: "the push buys into these", pct: l.botWalletPcts.reduce((a, b) => a + b, 0), tone: "text-blue" });
  if (l.holderWallets.count > 0) rows.push({ key: "holder", name: `Holder wallets · ${l.holderWallets.count}`, sub: "the holder bot's crowd", pct: l.holderWallets.pct, tone: "text-up" });

  return (
    <div className="rounded-lg border border-line">
      <div className="tabular flex items-baseline justify-between border-b border-line px-2.5 py-2">
        <span className="text-[11px] font-semibold text-faint">Your wallets</span>
        <span className="text-[12.5px] font-black">
          {l.totalPct.toFixed(2)}% <span className="text-[11px] font-semibold text-dim">≈ {sol(l.holdingsSol)} SOL</span>
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0">
          <div className="min-w-0 flex-1 leading-tight">
            <div className={`truncate text-[12px] font-bold ${r.tone}`}>{r.name}</div>
            <div className="truncate text-[10px] text-faint">{r.sub}</div>
          </div>
          <div className="tabular w-[62px] text-right leading-tight">
            <div className="text-[12px] font-bold">{r.pct.toFixed(2)}%</div>
            <div className="text-[10px] text-dim">{sol(solOf(r.pct), 1)}</div>
          </div>
          <div className="flex gap-0.5">
            {[0.25, 0.5, 1].map((f) => (
              <button
                key={f}
                type="button"
                disabled={r.pct <= 0.0001}
                onClick={() => sell(r.key, f, r.name.split(" · ")[0].toLowerCase())}
                className="tabular rounded border border-down/40 px-1.5 py-1 text-[10.5px] font-black text-down transition-colors enabled:hover:bg-down/15 disabled:opacity-30"
              >
                {f === 1 ? "All" : `${f * 100}%`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <div className="flex overflow-hidden rounded border border-line text-[10.5px] font-bold">
          {(["deployer", "launch"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setInto(k)} className={`px-1.5 py-1 ${into === k ? "bg-up/15 text-up" : "text-dim hover:text-ink"}`}>
              {k === "deployer" ? "Dev" : "Launch"}
            </button>
          ))}
        </div>
        {[0.5, 1, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={s > balance || !live}
            onClick={() => {
              const r = engine.buyDevBag(l.coinId, s, into);
              notify(r.ok ? `Bought ${s} SOL into the ${into === "deployer" ? "dev wallet" : "launch wallets"}` : (r.reason ?? "Buy failed"));
            }}
            className="tabular flex flex-1 items-center justify-center gap-1 rounded border border-up/50 bg-up/10 py-1 text-[11px] font-black text-up transition-colors enabled:hover:bg-up/20 disabled:opacity-35"
          >
            <SolIcon /> {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 border-t border-line p-2">
        {l.rewardsMode === "creator" ? (
          <button
            type="button"
            disabled={l.rewardsSol <= 0}
            onClick={() => {
              const r = engine.claimRewards(l.coinId);
              if (r.ok) notify(`Claimed ${sol(r.sol ?? 0, 3)} SOL of creator fees`);
            }}
            className="flex items-center justify-between rounded-md border border-amber/50 bg-amber/10 px-2.5 py-1.5 text-[12px] font-bold text-amber transition-colors enabled:hover:bg-amber/20 disabled:opacity-40"
          >
            <span>Claim fees</span>
            <span className="tabular">{sol(l.rewardsSol, 3)}</span>
          </button>
        ) : (
          <div className="rounded-md border border-line px-2.5 py-1.5 text-[11.5px] text-dim">Cashback to holders</div>
        )}
        <button
          type="button"
          disabled={l.totalPct <= 0.0001}
          onClick={() => {
            const r = engine.nuke(l.coinId);
            notify(r.ok ? `☢ Nuked: ${sol(r.sol ?? 0)} SOL out` : (r.reason ?? "Nothing to sell"));
          }}
          className="rounded-md border border-down/60 bg-down/10 px-2.5 py-1.5 text-[12px] font-black text-down transition-colors enabled:hover:bg-down/20 disabled:opacity-40"
        >
          ☢ Nuke everything
        </button>
      </div>
    </div>
  );
}

/** The run strategy: a status card while it runs, and the sliders to set it up or change it. */
function RunPanel({ engine, l, balance, notify }: { engine: Engine; l: LaunchView; balance: number; notify: (t: string) => void }) {
  const g = l.strategy;
  const [cfg, setCfg] = useState<RunConfig>(() => (g ? { ...g.cfg } : { ...RUN_DEFAULTS, targetUsd: nextTarget(l.mcUsd) }));
  const [editing, setEditing] = useState(!g);
  const set = <K extends keyof RunConfig>(k: K, v: RunConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const q = engine.quoteRun(l.coinId, cfg);
  const running = !!g && g.phase !== "done";
  const target = cfg.targetUsd;
  const pushOn = target !== null;
  const lo = Math.max(RUN_RANGES.targetUsd[0], l.mcUsd * 1.2);

  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">Run strategy</h3>
        {running && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-semibold text-violet hover:underline">
            Change it
          </button>
        )}
      </div>

      {g && running && (
        <div className="mb-2 rounded-lg border border-line bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-extrabold">{g.cfg.targetUsd ? `Push → ${usd(g.cfg.targetUsd)}` : "No push"}</span>
            <span className={`rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide ${PHASE[g.phase].tone}`}>
              {g.paused && g.phase === "push" ? "Paused" : PHASE[g.phase].label}
            </span>
          </div>
          {g.cfg.targetUsd && (
            <>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full rounded-full ${l.peakMcUsd >= g.cfg.targetUsd ? "bg-up" : "bg-violet"}`}
                  style={{ width: `${Math.max(2, Math.min(100, (Math.log(Math.max(1, l.mcUsd) / 4000) / Math.log(g.cfg.targetUsd / 4000)) * 100))}%` }}
                />
              </div>
              <div className="tabular mt-1 flex justify-between text-[10.5px] text-dim">
                <span>
                  {usd(l.mcUsd)} · push {sol(g.pushSpentSol, 1)} / {sol(g.pushBudgetSol, 1)} SOL
                </span>
                <span>{g.phase === "push" && !g.paused ? `${mmss(g.pushEndsInMs)} left` : g.cfg.exit === "auto" ? `then ${g.cfg.profitPace}%/min out` : "holds there"}</span>
              </div>
            </>
          )}
          <div className="tabular mt-1.5 flex flex-wrap gap-1 text-[10px]">
            {l.bots.volume && <Tag>Volume {l.bots.volume.label} · {Math.round(l.bots.volume.done * 100)}%</Tag>}
            {l.bots.holders && <Tag>Holders {l.bots.holders.added}/{l.bots.holders.total}</Tag>}
            {l.mm && (
              <Tag>
                {l.mm.strategy === "defend" ? `Defending ±${l.mm.band * 100}% · ${sol(l.mm.spentSol, 1)}/${sol(l.mm.budgetSol, 0)}` : `Selling · ${Math.round(l.mm.soldPct * 100)}% out · +${sol(l.mm.gotSol, 1)}`}
              </Tag>
            )}
          </div>
          {g.msg && <p className="mt-1.5 text-[11px] leading-snug text-dim">{g.msg}</p>}
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button
              type="button"
              disabled={g.phase !== "push"}
              onClick={() => engine.setStrategyPaused(l.coinId, !g.paused)}
              className="rounded-md border border-line-hi py-1.5 text-[11px] font-bold text-dim enabled:hover:text-ink disabled:opacity-35"
            >
              {g.paused ? "▶ Resume" : "❚❚ Pause push"}
            </button>
            <button
              type="button"
              disabled={g.phase === "profit"}
              onClick={() => {
                const r = engine.takeProfit(l.coinId, cfg.profitPace);
                notify(r.ok ? `Taking profit: ${cfg.profitPace}% of the bag a minute` : (r.reason ?? "Couldn't start"));
              }}
              className="rounded-md border border-amber/60 bg-amber/10 py-1.5 text-[11px] font-black text-amber enabled:hover:bg-amber/20 disabled:opacity-35"
            >
              Take profit
            </button>
            <button
              type="button"
              onClick={() => {
                engine.stopRun(l.coinId);
                notify("Run strategy stopped");
              }}
              className="rounded-md border border-down/50 py-1.5 text-[11px] font-bold text-down hover:bg-down/10"
            >
              Stop all
            </button>
          </div>
        </div>
      )}

      {(editing || !running) && (
        <div className="space-y-3">
          {/* Push */}
          <Part title="Push" on={pushOn} onToggle={() => set("targetUsd", pushOn ? null : Math.max(lo, 250_000))} cost={q.pushSol}>
            {pushOn && (
              <>
                <div className="mb-1.5 grid grid-cols-6 gap-1">
                  {RUN_TARGETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={t < lo}
                      onClick={() => set("targetUsd", t)}
                      className={`tabular rounded border py-1 text-[10.5px] font-bold transition-colors disabled:opacity-30 ${
                        target === t ? "border-violet bg-violet/15 text-violet" : "border-line text-dim enabled:hover:border-line-hi enabled:hover:text-ink"
                      }`}
                    >
                      {tLabel(t)}
                    </button>
                  ))}
                </div>
                <Slider label="Target market cap" value={Math.max(lo, target!)} min={lo} max={RUN_RANGES.targetUsd[1]} log format={usd} onChange={(v) => set("targetUsd", v)} />
                <Slider
                  label="Get there in"
                  value={cfg.pushMinutes}
                  min={RUN_RANGES.pushMinutes[0]}
                  max={RUN_RANGES.pushMinutes[1]}
                  step={0.5}
                  format={(v) => `${v} min`}
                  onChange={(v) => set("pushMinutes", v)}
                  hint="Faster leaves sellers less time to fight it; slower looks more natural."
                />
              </>
            )}
          </Part>

          {/* Volume */}
          <Part title="Volume" on={cfg.volumePerMin > 0} onToggle={() => set("volumePerMin", cfg.volumePerMin > 0 ? 0 : 5_000)} cost={q.volumeSol}>
            {cfg.volumePerMin > 0 && (
              <>
                <Slider label="Rate" value={cfg.volumePerMin} min={1_000} max={RUN_RANGES.volumePerMin[1]} log format={(v) => `${usd(v)} / min`} onChange={(v) => set("volumePerMin", v)} />
                <Slider label="For" value={cfg.volumeMinutes} min={RUN_RANGES.volumeMinutes[0]} max={RUN_RANGES.volumeMinutes[1]} step={1} format={(v) => `${v} min`} onChange={(v) => set("volumeMinutes", v)} />
              </>
            )}
          </Part>

          {/* Holders */}
          <Part title="Holders" on={cfg.holders > 0} onToggle={() => set("holders", cfg.holders > 0 ? 0 : 100)} cost={q.holdersSol}>
            {cfg.holders > 0 && (
              <Slider
                label="Fresh holder wallets"
                value={cfg.holders}
                min={10}
                max={RUN_RANGES.holders[1]}
                step={5}
                format={(v) => `${v} · ~${(v * 0.03).toFixed(1)}% of supply`}
                onChange={(v) => set("holders", v)}
              />
            )}
          </Part>

          {/* Defend */}
          <Part title="Defend dips" on={cfg.defendSol > 0} onToggle={() => set("defendSol", cfg.defendSol > 0 ? 0 : 5)} cost={q.defendSol}>
            {cfg.defendSol > 0 && (
              <>
                <Slider label="Budget" value={cfg.defendSol} min={1} max={RUN_RANGES.defendSol[1]} log format={(v) => `${sol(v, v < 10 ? 1 : 0)} SOL`} onChange={(v) => set("defendSol", v)} />
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="mr-1 font-semibold text-faint">Buys dips past</span>
                  {[0.05, 0.1, 0.2].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => set("band", b)}
                      className={`rounded border px-2 py-0.5 font-bold ${cfg.band === b ? "border-violet bg-violet/15 text-violet" : "border-line text-dim hover:text-ink"}`}
                    >
                      {b * 100}%
                    </button>
                  ))}
                </div>
              </>
            )}
          </Part>

          {/* Exit */}
          <div className="rounded-lg border border-line p-2.5">
            <div className="mb-1.5 text-[12px] font-bold">At the target</div>
            <div className="mb-2 grid grid-cols-2 gap-1">
              {(["hold", "auto"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => set("exit", x)}
                  className={`rounded-md border py-1.5 text-[11.5px] font-bold ${cfg.exit === x ? "border-violet bg-violet/15 text-violet" : "border-line text-dim hover:text-ink"}`}
                >
                  {x === "hold" ? "Hold, I exit" : "Take profit"}
                </button>
              ))}
            </div>
            <Slider
              label="Profit pace"
              value={cfg.profitPace}
              min={RUN_RANGES.profitPace[0]}
              max={RUN_RANGES.profitPace[1]}
              step={1}
              format={(v) => `${v}% of the bag / min`}
              onChange={(v) => set("profitPace", v)}
              hint="Also used by Take profit. Faster gets out sooner but leans on the chart harder."
            />
          </div>

          {/* Estimate */}
          <div className="tabular rounded-lg bg-black/25 p-2.5 text-[11.5px]">
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-dim">Up to (total)</span>
              <span className={`text-right font-black ${q.totalSol > balance ? "text-down" : ""}`}>
                <SolIcon /> {sol(q.totalSol, 1)}
              </span>
              {pushOn && (
                <>
                  <span className="text-dim">Your bag now → at {usd(target!)}</span>
                  <span className="text-right font-bold">
                    {q.bagPctNow.toFixed(0)}% → {q.bagPctAtTarget.toFixed(0)}%
                  </span>
                  <span className="text-dim">Worth there · dump it all</span>
                  <span className="text-right font-bold">
                    {usd(q.bagUsdAtTarget)} · <span className="text-amber">≈{sol(q.dumpSolAtTarget, 0)} SOL</span>
                  </span>
                  <span className="text-dim">Holders there</span>
                  <span className="text-right font-bold">~{q.holdersAtTarget.toLocaleString("en-US")}</span>
                </>
              )}
            </div>
            {pushOn && <p className="mt-1.5 text-[10.5px] leading-snug text-faint">The push estimate assumes nobody else trades, +30% for sellers. Organic buyers can make it cheaper; a weak narrative or a bundle callout dearer.</p>}
          </div>

          <div className="flex gap-1.5">
            {running && (
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line-hi px-3 py-2 text-[12px] font-bold text-dim hover:text-ink">
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={q.totalSol > balance}
              onClick={() => {
                const r = engine.startRun(l.coinId, cfg);
                if (r.ok) setEditing(false);
                notify(r.ok ? (running ? "Run strategy updated" : "Run strategy started") : (r.reason ?? "Couldn't start it"));
              }}
              className="flex-1 rounded-lg bg-violet py-2 text-[13px] font-black text-white transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {q.totalSol > balance ? "Not enough SOL" : running ? "Update strategy" : "Start strategy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Part({ title, on, onToggle, cost, children }: { title: string; on: boolean; onToggle: () => void; cost: number; children: ReactNode }) {
  return (
    <div className={`rounded-lg border p-2.5 ${on ? "border-line-hi" : "border-line"}`}>
      <div className={`flex items-center justify-between ${on ? "mb-1.5" : ""}`}>
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-[12px] font-bold">
          <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-violet" : "bg-line-hi"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
          </span>
          {title}
        </button>
        <span className={`tabular text-[11px] font-bold ${on ? "text-ink" : "text-faint"}`}>{on ? `${sol(cost, cost < 10 ? 1 : 0)} SOL` : "off"}</span>
      </div>
      {on && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded border border-line px-1.5 py-px text-dim">{children}</span>;
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-md border border-line px-2 py-1.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={`text-[13px] font-black ${tone ?? ""}`}>{v}</div>
      <div className="text-[9.5px] text-dim">{sub}</div>
    </div>
  );
}

/** The first preset target comfortably above where the coin is now. */
function nextTarget(mcUsd: number): number {
  return RUN_TARGETS.find((t) => t >= mcUsd * 2) ?? RUN_TARGETS[RUN_TARGETS.length - 1];
}
