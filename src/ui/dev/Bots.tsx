"use client";

import type { Engine } from "@/engine/engine";
import { HOLDER_PACKAGES, HOLDER_SOL, TREND_TARGETS, VOLUME_PACKAGES, volumeCostSol } from "@/engine/dev";
import type { LaunchView } from "@/engine/types";
import { sol, usd } from "../format";

interface Props {
  engine: Engine;
  l: LaunchView;
  devSol: number;
  notify: (text: string) => void;
}

const btn = "tabular flex flex-col items-center rounded-md border py-1 leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-35";
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Bots for your launch, paid from the dev wallet: volume packages, a trend bot towards a target, holders. */
export function Bots({ engine, l, devSol, notify }: Props) {
  const id = l.coinId;
  const b = l.bots;
  const run = (r: { ok: boolean; reason?: string }, ok: string) => notify(r.ok ? ok : (r.reason ?? "Couldn't start it"));
  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-bold">Bots</h3>
        <span className="text-[10.5px] text-faint">Paid from the dev wallet</span>
      </div>

      {/* Volume */}
      <div className="text-[11px] font-semibold text-faint">Volume · wash trades, keeps it trending</div>
      {b.volume ? (
        <Running
          label={`${b.volume.label} volume · ${Math.round(b.volume.done * 100)}% · ${mmss(b.volume.endsInMs)} left`}
          pct={b.volume.done}
          onStop={() => notify(`Volume bot stopped: ${sol(engine.stopVolumeBot(id))} SOL back`)}
        />
      ) : (
        <div className="mt-1 grid grid-cols-3 gap-1">
          {VOLUME_PACKAGES.map((p) => {
            const cost = volumeCostSol(p.usd);
            return (
              <button
                key={p.id}
                type="button"
                disabled={cost > devSol}
                onClick={() => run(engine.startVolumeBot(id, p.id), `Volume bot on: $${p.usd / 1000}K over ${p.minutes} min`)}
                className={`${btn} border-blue/40 text-blue enabled:hover:bg-blue/10`}
              >
                <span className="text-[11.5px] font-extrabold">
                  ${p.usd / 1000}K · {p.minutes}m
                </span>
                <span className="text-[9.5px] text-dim">{sol(cost)} SOL</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Trend */}
      <div className="mt-2.5 text-[11px] font-semibold text-faint">Trend · buys into your launch wallets up to a target</div>
      {b.trend ? (
        <Running
          label={`→ ${usd(b.trend.targetUsd)} · ${sol(b.trend.spentSol)} / ${sol(b.trend.budgetSol)} SOL`}
          pct={Math.min(1, b.trend.spentSol / b.trend.budgetSol)}
          onStop={() => {
            engine.stopTrendBot(id);
            notify("Trend bot stopped");
          }}
        />
      ) : (
        <div className="mt-1 grid grid-cols-4 gap-1">
          {TREND_TARGETS.map((t) => {
            const q = engine.quoteTrend(id, t.id);
            const past = !q || q.sol <= 0;
            return (
              <button
                key={t.id}
                type="button"
                disabled={past || q!.sol > devSol}
                title={q ? `To ${usd(q.targetUsd)} MC: about ${sol(q.sol)} SOL (an estimate: sellers push back)` : ""}
                onClick={() => run(engine.startTrendBot(id, t.id), `Trend bot on: pushing to ${usd(q!.targetUsd)}`)}
                className={`${btn} border-up/40 text-up enabled:hover:bg-up/10`}
              >
                <span className="text-[11.5px] font-extrabold">{t.label}</span>
                <span className="text-[9.5px] text-dim">{past ? "past it" : `~${sol(q!.sol, q!.sol < 10 ? 2 : 0)}`}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Holders */}
      <div className="mt-2.5 text-[11px] font-semibold text-faint">
        Holders · fresh wallets with a dust buy{b.botHolders > 0 && <span className="text-dim"> · {b.botHolders} added so far</span>}
      </div>
      {b.holders ? (
        <Running label={`${b.holders.added} / ${b.holders.total} holders`} pct={b.holders.added / b.holders.total} />
      ) : (
        <div className="mt-1 grid grid-cols-4 gap-1">
          {HOLDER_PACKAGES.map((n) => (
            <button
              key={n}
              type="button"
              disabled={n * HOLDER_SOL > devSol}
              onClick={() => run(engine.startHolderBot(id, n), `Holder bot on: ${n} holders`)}
              className={`${btn} border-violet/40 text-violet enabled:hover:bg-violet/10`}
            >
              <span className="text-[11.5px] font-extrabold">{n}</span>
              <span className="text-[9.5px] text-dim">{sol(n * HOLDER_SOL)}</span>
            </button>
          ))}
        </div>
      )}
      {b.lastBot && <p className="mt-2 text-[11px] text-dim">{b.lastBot}</p>}
    </div>
  );
}

function Running({ label, pct, onStop }: { label: string; pct: number; onStop?: () => void }) {
  return (
    <div className="mt-1 flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
      <span className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 rounded-full bg-up" style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
      <span className="tabular min-w-0 flex-1 truncate text-[11.5px] font-semibold">{label}</span>
      {onStop && (
        <button type="button" onClick={onStop} className="shrink-0 rounded border border-down/50 px-1.5 text-[10.5px] font-bold text-down hover:bg-down/10">
          Stop
        </button>
      )}
    </div>
  );
}
