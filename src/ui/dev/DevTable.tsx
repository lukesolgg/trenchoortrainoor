"use client";

import type { DevScenarioView, LaunchView } from "@/engine/types";
import { usd } from "../format";
import { Avatar } from "../TweetFeed";

interface Props {
  scenarios: DevScenarioView[];
  launches: LaunchView[];
  now: number;
  onLaunch: (scenarioId: string) => void;
  onOpenCoin: (coinId: string) => void;
}

/**
 * The Dev table: every launchable tweet, newest first, with how long ago it landed and where it stands (open, a
 * rival's right coin already out, launched with its market cap, or gone stale). Click one to fill out the coin.
 */
export function DevTable({ scenarios, launches, now, onLaunch, onOpenCoin }: Props) {
  const byId = new Map(launches.map((l) => [l.coinId, l]));
  return (
    <section className="flex h-full min-h-0 flex-col border-r border-line bg-panel">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="text-[13px] font-bold">
          Dev table <span className="ml-1 rounded bg-violet/20 px-1.5 py-px text-[10px] font-black text-violet">DEV</span>
        </span>
        <span className="text-[11px] text-faint">{scenarios.filter((s) => !s.launchedCoinId).length} open</span>
      </header>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {scenarios.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-dim">Launchable tweets land here every 35-55 s.</p>}
        {scenarios.slice(0, 20).map((s) => {
          const since = Math.max(0, (now - s.tweetAt) / 1000);
          const l = s.launchedCoinId ? byId.get(s.launchedCoinId) : undefined;
          const stale = !l && since > 90;
          const status = l
            ? { t: l.ended ? (l.endReason === "closed" ? "Closed" : "Dead") : `Launched · ${usd(l.mcUsd)}`, c: "bg-violet/20 text-violet" }
            : stale
              ? { t: "Stale", c: "bg-line text-dim" }
              : s.rivalFirst
                ? { t: "Rival out", c: "bg-down/15 text-down" }
                : { t: "Open", c: "bg-up/15 text-up" };
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => (l ? onOpenCoin(l.coinId) : onLaunch(s.id))}
              className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                l ? "border-violet/40 bg-violet/[0.05] hover:border-violet" : stale ? "border-line opacity-60 hover:opacity-100" : "border-line hover:border-violet/70 hover:bg-violet/[0.06]"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="origin-left scale-[0.8]">
                  <Avatar name={s.authorName} hue={s.authorHue} src={s.authorAvatar ?? `/avatars/${s.authorHandle.toLowerCase()}.jpg`} />
                </div>
                <span className="-ml-1.5 min-w-0 flex-1 truncate text-[12.5px] font-bold">{s.authorName}</span>
                {!l && (
                  <span className={`tabular rounded px-1.5 py-px text-[11px] font-black ${since < 5 ? "bg-up/15 text-up" : since < 15 ? "bg-amber/15 text-amber" : "text-faint"}`}>
                    {since < 600 ? `+${since.toFixed(since < 60 ? 1 : 0)}s` : "10m+"}
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink/90">{s.text}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className={`rounded px-1.5 py-px text-[10px] font-black uppercase tracking-wide ${status.c}`}>{status.t}</span>
                <span className="text-[11px] font-bold text-violet">{l ? "Open →" : stale ? "" : "Launch →"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
