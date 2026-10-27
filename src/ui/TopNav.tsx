"use client";

import { useUi } from "@/store/ui";
import type { RefObject } from "react";
import type { NavTab } from "@/store/ui";
import { sol } from "./format";
import { Logo } from "./Logo";
import { SolIcon } from "./icons";

interface Props {
  tab: NavTab;
  onTab: (t: NavTab) => void;
  modeLabel: string;
  difficultyLabel: string;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  walletSol: number;
  onMenu: () => void;
}

type Item = { id: NavTab; label: string } | { soon: string };

const ITEMS: Item[] = [
  { id: "trenches", label: "Trenches" },
  { id: "trending", label: "Trending" },
  { soon: "CopyTrade" },
  { soon: "Monitor" },
  { soon: "Track" },
  { id: "portfolio", label: "Portfolio" },
  { id: "rewards", label: "Rewards" },
];

/** Top bar: brand, sections, search, wallet. CopyTrade, Monitor and Track are placeholders. */
function MuteButton() {
  const muted = useUi((u) => u.muted);
  const setMuted = useUi((u) => u.setMuted);
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      title={muted ? "Sound off" : "Sound on"}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-hi text-dim transition-colors hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5L6 9H3v6h3l5 4V5z" />
        {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />}
      </svg>
    </button>
  );
}

export function TopNav({ tab, onTab, modeLabel, difficultyLabel, query, onQuery, searchRef, walletSol, onMenu }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-nav px-4">
      <Logo />
      <nav className="flex items-center gap-0.5 text-[14px] font-semibold">
        {ITEMS.map((it) =>
          "soon" in it ? (
            <span key={it.soon} className="cursor-default rounded-md px-3 py-1.5 text-faint" title="Coming soon">
              {it.soon}
            </span>
          ) : (
            <button
              key={it.id}
              type="button"
              onClick={() => onTab(it.id)}
              aria-current={tab === it.id ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 transition-colors ${tab === it.id ? "bg-up/10 text-up" : "text-dim hover:text-ink"}`}
            >
              {it.label}
            </button>
          ),
        )}
      </nav>
      <div className="hidden items-center gap-2 text-[12px] min-[1700px]:flex">
        <span className="whitespace-nowrap rounded bg-up/15 px-2 py-0.5 font-bold text-up">{modeLabel}</span>
        <span className="whitespace-nowrap font-semibold text-pink">{difficultyLabel}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex h-8 w-[190px] items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-line-hi">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-dim" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name, ticker, CA"
            className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">/</kbd>
        </div>
        <div className="tabular flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-bold" title="Paper wallet">
          <SolIcon />
          {sol(walletSol)}
        </div>
        <MuteButton />
        <button
          type="button"
          onClick={onMenu}
          className="shrink-0 whitespace-nowrap rounded-lg border border-line-hi px-3 py-1.5 text-[12px] font-semibold text-dim transition-colors hover:text-ink"
        >
          Menu <span className="ml-1 text-faint">Esc Esc</span>
        </button>
      </div>
    </header>
  );
}
