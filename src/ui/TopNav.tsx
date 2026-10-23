"use client";

import type { RefObject } from "react";
import { sol } from "./format";
import { Logo } from "./Logo";

interface Props {
  modeLabel: string;
  difficultyLabel: string;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  walletSol: number;
  onMenu: () => void;
}

/** Top bar: brand, the one real destination, search, wallet. No dead links. */
export function TopNav({ modeLabel, difficultyLabel, query, onQuery, searchRef, walletSol, onMenu }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-5 border-b border-line bg-nav px-4">
      <Logo />
      <nav className="flex items-center gap-1 text-[14px] font-semibold">
        <span className="rounded-md bg-up/10 px-3 py-1.5 text-up">Trenches</span>
      </nav>
      <div className="hidden items-center gap-2 text-[12px] lg:flex">
        <span className="rounded bg-up/15 px-2 py-0.5 font-bold text-up">{modeLabel}</span>
        <span className="font-semibold text-pink">{difficultyLabel}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex h-8 w-[300px] items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-line-hi">
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
        <span className="rounded-md border border-line px-2 py-1 text-[11px] font-bold text-dim">SOL</span>
        <div
          className="tabular flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-bold"
          title="Paper wallet"
        >
          <span className="text-up">◎</span>
          {sol(walletSol)}
        </div>
        <button
          type="button"
          onClick={onMenu}
          className="rounded-lg border border-line-hi px-3 py-1.5 text-[12px] font-semibold text-dim transition-colors hover:text-ink"
        >
          Menu <span className="ml-1 text-faint">Esc Esc</span>
        </button>
      </div>
    </header>
  );
}
