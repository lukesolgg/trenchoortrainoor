"use client";

import { useEffect } from "react";
import { DIFFICULTIES } from "@/engine/difficulty";
import type { DifficultyId } from "@/engine/types";
import { DEV_DEPOSIT_SOL, featuresFor, levelForXp, rankFor, START_SOL, UNLOCKS, xpForLevel, BUST_BELOW_SOL } from "@/campaign/progression";
import { campaignFeatures, useCampaign } from "@/store/campaign";
import { useUi, type Port } from "@/store/ui";
import { sol } from "./format";
import { SolIcon } from "./icons";

/** Buy presets follow the size of your balance. */
const tierFor = (bal: number): Port => (bal < 10 ? "low" : bal < 100 ? "medium" : "whale");

const Lock = ({ level }: { level: number }) => <span className="ml-1 text-[10px] font-bold text-faint">🔒 {level}</span>;

/** The campaign's home: rank and XP, balances, the next round's settings, and the road of unlocks. */
export function CampaignHub() {
  const c = useCampaign();
  const toMenu = useUi((u) => u.toMenu);
  const start = useUi((u) => u.start);
  const setPort = useUi((u) => u.setPort);
  const level = levelForXp(c.xp);
  const f = campaignFeatures(c);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const pct = to > from ? ((c.xp - from) / (to - from)) * 100 : 100;
  const next = UNLOCKS.find((u) => u.level > level);

  // Settings outside what you've unlocked fall back to what you have.
  const difficulty: DifficultyId = f.difficulties.includes(c.difficulty) ? c.difficulty : f.difficulties[f.difficulties.length - 1];
  const length = f.saga ? c.length : "blitz";

  const play = () => {
    if (difficulty !== c.difficulty) c.setDifficulty(difficulty);
    if (length !== c.length) c.setLength(length);
    setPort(tierFor(c.traderSol));
    start();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space" || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))) {
        e.preventDefault();
        play();
      } else if (e.key === "Escape") toMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const opt = (on: boolean, locked: boolean, tone: string) =>
    `rounded-lg border px-3.5 py-2 text-[13px] font-bold transition-colors ${
      locked ? "cursor-not-allowed border-line text-faint opacity-60" : on ? tone : "border-line text-dim hover:border-line-hi hover:text-ink"
    }`;
  const unlockAt = (pred: (l: number) => boolean) => UNLOCKS.find((u) => pred(u.level))?.level ?? 0;
  const diffLevel = (d: DifficultyId) => (d === "paper" ? 1 : d === "trencher" ? 2 : 10);

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-8">
      <div className="flex items-center justify-between">
        <button type="button" onClick={toMenu} className="text-[12.5px] font-semibold text-dim transition-colors hover:text-ink">
          ← Menu <kbd className="ml-1 text-faint">Esc</kbd>
        </button>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-faint">Trench Academy · Campaign</span>
      </div>

      {/* Rank, level and XP */}
      <section className="mt-6 grid grid-cols-[1fr_auto] items-end gap-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">Level {level}</p>
          <h1 className="mt-1 text-[52px] font-black leading-none tracking-tight">{rankFor(level)}</h1>
          <div className="mt-4 flex max-w-xl items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-amber shadow-[0_0_12px_rgba(245,197,66,.5)]" style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular text-[12px] font-semibold text-dim">
              {c.xp - from} / {to - from} XP
            </span>
          </div>
          {next && (
            <p className="mt-2 text-[12.5px] text-dim">
              Next: <span className="font-bold text-ink">Lvl {next.level}</span> · {next.label}
              <span className="text-faint"> · {xpForLevel(next.level) - c.xp} XP to go</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Balance k="Trader" sub={`${f.wallets} wallet${f.wallets > 1 ? "s" : ""}`}>
            <SolIcon /> {sol(c.traderSol)}
          </Balance>
          <Balance k="Dev" locked={!f.dev} sub={f.dev ? (c.devSol === null ? `${DEV_DEPOSIT_SOL} SOL to open` : "dev wallet") : "Lvl 15"}>
            {c.devSol === null ? "—" : <><SolIcon /> {sol(c.devSol)}</>}
          </Balance>
          <Balance k="KOL Rep" locked={!f.kolRep} sub={f.kolRep ? "coming next" : "Lvl 8"}>
            {f.kolRep ? c.kolRep : "—"}
          </Balance>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)_380px] gap-5">
        {/* Next round */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Next round</h2>

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-faint">Length</p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" className={opt(length === "blitz", false, "border-violet/70 bg-violet/15 text-violet")} onClick={() => c.setLength("blitz")}>
              Blitz
            </button>
            <button type="button" disabled={!f.saga} className={opt(length === "saga", !f.saga, "border-violet/70 bg-violet/15 text-violet")} onClick={() => c.setLength("saga")}>
              Saga{!f.saga && <Lock level={unlockAt((l) => featuresFor(l).saga)} />}
            </button>
          </div>

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-faint">Difficulty</p>
          <div className="mt-1.5 flex gap-2">
            {(["paper", "trencher", "sniper"] as DifficultyId[]).map((d) => {
              const locked = !f.difficulties.includes(d);
              return (
                <button key={d} type="button" disabled={locked} className={opt(difficulty === d, locked, "border-pink/70 bg-pink/10 text-pink")} onClick={() => c.setDifficulty(d)}>
                  {DIFFICULTIES[d].label}
                  {locked && <Lock level={diffLevel(d)} />}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-faint">Style</p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" className={opt(c.style === "strict", false, "border-up/70 bg-up/10 text-up")} onClick={() => c.setStyle("strict")}>
              Competitive
            </button>
            <button type="button" className={opt(c.style === "training", false, "border-up/70 bg-up/10 text-up")} onClick={() => c.setStyle("training")}>
              Casual <span className="ml-1 text-[10px] font-semibold text-faint">½ XP</span>
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-line bg-bg/50 px-3.5 py-3 text-[12.5px] leading-snug text-dim">
            You trade with your own balance: what you make or lose carries into the next round. Fall under {BUST_BELOW_SOL} SOL and you&apos;re
            topped back up to {START_SOL} SOL, at the cost of half your progress into this level. Leaving mid-round keeps what your open
            bags are worth.
          </div>

          <button
            type="button"
            onClick={play}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl bg-amber py-3.5 text-[16px] font-black text-black shadow-[0_0_28px_rgba(245,197,66,.3)] transition-[filter] hover:brightness-110"
          >
            Play round {c.rounds + 1}
            <kbd className="rounded bg-black/15 px-1.5 text-[11px]">Space</kbd>
          </button>
          <p className="mt-2 text-center text-[11.5px] text-faint">
            {c.rounds} rounds played · hit streak {c.streak}
          </p>
        </section>

        {/* The road */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">The road</h2>
          <ol className="mt-3 space-y-1">
            {UNLOCKS.map((u) => {
              const done = level >= u.level;
              const isNext = u === next;
              return (
                <li
                  key={u.level}
                  className={`flex gap-3 rounded-lg px-2.5 py-1.5 ${isNext ? "bg-amber/10 ring-1 ring-amber/50" : ""} ${done || isNext ? "" : "opacity-55"}`}
                >
                  <span
                    className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black ${
                      done ? "bg-up/20 text-up" : isNext ? "bg-amber text-black" : "bg-line text-dim"
                    }`}
                  >
                    {done ? "✓" : u.level}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <div className={`text-[12.5px] font-bold ${done ? "text-ink/80" : "text-ink"}`}>{u.label}</div>
                    {u.threat && (
                      <div className="text-[11px] text-down/80">
                        Market adds: {u.threat}
                        {!u.threatLive && <span className="ml-1 text-faint">(soon)</span>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}

function Balance({ k, sub, locked, children }: { k: string; sub: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-[132px] rounded-xl border px-3.5 py-2.5 ${locked ? "border-dashed border-line opacity-60" : "border-line bg-card"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-faint">
        {locked && "🔒 "}
        {k}
      </div>
      <div className="tabular mt-0.5 flex items-center gap-1 text-[20px] font-black">{children}</div>
      <div className="text-[11px] text-dim">{sub}</div>
    </div>
  );
}
