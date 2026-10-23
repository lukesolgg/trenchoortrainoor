"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIFFICULTIES } from "@/engine/difficulty";
import { SOL_USD } from "@/engine/curve";
import { useUi } from "@/store/ui";
import { PulseBoard } from "./PulseBoard";
import { ResultsOverlay, RoundOverlay, RoundStatus } from "./RoundOverlays";
import { TokenPage } from "./TokenPage";
import { TweetFeed } from "./TweetFeed";
import { sol } from "./format";
import { useEngine, useSnapshot } from "./hooks";

const MODE_LABEL = { firsttx: "FIRST TX", dev: "DEV", freeplay: "FREE PLAY" } as const;

interface Toast {
  id: number;
  text: string;
}

export function Game() {
  const { mode, difficulty, quickSol, quickEnabled, buyPresets, setQuickSol, setQuickEnabled, setBuyPresets, toModes, start } =
    useUi();
  // FIRST TX is a scored round. DEV and free play stay on the unscored free-running board for now.
  const scoredMode = mode === "firsttx";
  const engine = useEngine({ difficulty, autoRounds: !scoredMode });
  const snap = useSnapshot(engine);
  const scored = snap.scored;
  const [wallStart] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastEsc = useRef(0);

  // Latest snapshot for callbacks that must stay referentially stable.
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // Toasts are muted once a scored round is over: the results screen says it all.
  const notify = useCallback(
    (text: string) => {
      if (engine.isScoredOver()) return;
      setToast({ id: Date.now(), text });
    },
    [engine],
  );

  const onQuickBuy = useCallback(
    (coinId: string, eventTs: number) => {
      // Timestamp comes from the input event so click latency is not charged to the player.
      const trade = engine.quickBuy(coinId, quickSol, engine.fromEventTime(eventTs));
      const s = snapRef.current;
      const coin = [...s.newPairs, ...s.finalStretch, ...s.migrated].find((c) => c.id === coinId);
      notify(
        trade
          ? `Bought ${sol(trade.sol, 2)} SOL of ${coin?.ticker ?? "coin"} · ${trade.rank} bot buys ahead of you`
          : "Buy failed: not enough SOL, or the coin is gone",
      );
    },
    [engine, quickSol, notify],
  );

  // Start the scored round once the engine is running (safe under strict mode).
  useEffect(() => {
    if (scoredMode) engine.startScored();
  }, [engine, scoredMode]);

  // Keep the open coin on the board even if it would normally age out.
  useEffect(() => {
    engine.focus(openId);
    return () => engine.focus(null);
  }, [engine, openId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement;
      const phase = snapRef.current.scored?.phase;

      // Results are up: R or Enter plays again, Esc leaves, everything else is ignored.
      if (phase === "ended") {
        if (e.key === "r" || e.key === "R" || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))) {
          e.preventDefault();
          start();
        } else if (e.key === "Escape") toModes();
        return;
      }
      // Space ends a live round, unless it is being used to press a trade button.
      if (e.code === "Space" && phase === "live" && !typing && !(e.target instanceof Element && e.target.closest("[data-fire]"))) {
        e.preventDefault();
        engine.endRound();
        return;
      }

      if (e.key === "/" && !typing && !openId) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === "t" || e.key === "T") && !typing && !openId) {
        const hovered = document.querySelector("[data-coin-id]:hover")?.getAttribute("data-coin-id");
        if (hovered) setOpenId(hovered);
      } else if (e.key === "Escape") {
        if (typing) {
          (e.target as HTMLInputElement).blur();
          return;
        }
        if (openId) {
          setOpenId(null);
          return;
        }
        const now = performance.now();
        if (now - lastEsc.current < 600) toModes();
        lastEsc.current = now;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toModes, openId, start, engine]);

  const diff = DIFFICULTIES[difficulty];

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-up/15 text-up">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
          </div>
          <span className="text-[16px] font-extrabold tracking-tight">Trencher</span>
          <span className="rounded border border-buy/40 bg-buy/15 px-1.5 py-px text-[10px] font-bold text-[#9db0ff]">SIM</span>
        </div>
        <nav className="text-[14px] font-semibold text-ink">Pulse</nav>
        <div className="mx-auto w-full max-w-md">
          <div className="flex h-9 items-center gap-2 rounded-full border border-line bg-card px-3 focus-within:border-line-hi">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ticker or name"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
            <kbd className="rounded border border-line-hi px-1.5 text-[11px] text-dim">/</kbd>
          </div>
        </div>
        <div className="tabular flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[13px] font-semibold">
          <span className="text-dim">◎</span>
          {sol(snap.walletSol)}
        </div>
      </header>

      {/* Session strip */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 text-[12px]">
        <span className="rounded bg-up/15 px-2 py-0.5 font-bold text-up">{MODE_LABEL[mode]}</span>
        <span className="font-semibold text-pink">{diff.label}</span>
        {scored ? (
          <RoundStatus scored={scored} now={snap.now} />
        ) : (
          <span className="text-amber">
            {mode === "dev"
              ? "DEV deploy arrives in phase 7. This is the free-running board for now."
              : "Free play: a tweet and its runner every 30-60 s. Nothing is scored."}
          </span>
        )}
        <button
          type="button"
          onClick={toModes}
          className="ml-auto rounded-md border border-line-hi px-2.5 py-1 font-semibold text-dim transition-colors hover:text-ink"
        >
          Menu <span className="ml-1 text-faint">Esc Esc</span>
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,380px)_1fr]">
        <TweetFeed tweets={snap.feed} wallStart={wallStart} pauseOnHover={!scoredMode} />
        {openId ? (
          <TokenPage
            engine={engine}
            snap={snap}
            coinId={openId}
            wallStart={wallStart}
            buyPresets={buyPresets}
            onBuyPresets={setBuyPresets}
            onBack={() => setOpenId(null)}
            notify={notify}
          />
        ) : (
        <PulseBoard
          newPairs={snap.newPairs}
          finalStretch={snap.finalStretch}
          migrated={snap.migrated}
          now={snap.now}
          query={query}
          quickSol={quickSol}
          quickEnabled={quickEnabled}
          onQuickSol={setQuickSol}
          onQuickEnabled={setQuickEnabled}
          onQuickBuy={onQuickBuy}
          onOpen={setOpenId}
          pauseOnHover={!scoredMode}
        />
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-4 text-[11px] text-dim">
        <span>SOL ${SOL_USD}</span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-up" /> Simulator · no real trades
        </span>
        <span className="ml-auto">
          {scoredMode ? "Scored round: the board never pauses" : "Hover a column or the feed to pause it"}
        </span>
      </footer>

      {scored && scored.phase !== "ended" && <RoundOverlay scored={scored} now={snap.now} />}
      {scored?.result && <ResultsOverlay result={scored.result} onNext={start} onMenu={toModes} />}

      {toast && (
        <div
          key={toast.id}
          className="anim-tweet pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-full border border-line-hi bg-card-hi px-4 py-2 text-[13px] font-semibold shadow-xl"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
