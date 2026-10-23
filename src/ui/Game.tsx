"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DIFFICULTIES } from "@/engine/difficulty";
import { useUi } from "@/store/ui";
import { PulseBoard } from "./PulseBoard";
import { ResultsOverlay, RoundOverlay, RoundStatus } from "./RoundOverlays";
import { TokenPage } from "./TokenPage";
import { StatusBar } from "./StatusBar";
import { TopNav } from "./TopNav";
import { TweetFeed } from "./TweetFeed";
import { sol } from "./format";
import { useEngine, useSnapshot } from "./hooks";

const MODE_LABEL = { firsttx: "FIRST TX", dev: "DEV", freeplay: "FREE PLAY" } as const;

interface Toast {
  id: number;
  text: string;
}

export function Game() {
  const {
    mode, difficulty, quickPresets, colPreset, quickEnabled, feedOpen, buySets, presetSet,
    setQuickPreset, setColPreset, setQuickEnabled, setBuyPresets, setPresetSet, setFeedOpen, toModes, start,
  } = useUi();
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
    (coinId: string, amount: number, eventTs: number) => {
      // Timestamp comes from the input event so click latency is not charged to the player.
      const trade = engine.quickBuy(coinId, amount, engine.fromEventTime(eventTs));
      const s = snapRef.current;
      const coin = [...s.newPairs, ...s.finalStretch, ...s.migrated].find((c) => c.id === coinId);
      notify(
        trade
          ? `Bought ${sol(trade.sol, 2)} SOL of ${coin?.ticker ?? "coin"} · ${trade.rank} bot buys ahead of you`
          : "Buy failed: not enough SOL, or the coin is gone",
      );
    },
    [engine, notify],
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

  const buyPresets = buySets[presetSet];
  const diff = DIFFICULTIES[difficulty];

  return (
    <div className="flex h-dvh flex-col">
      <TopNav
        modeLabel={MODE_LABEL[mode]}
        difficultyLabel={diff.label}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        walletSol={snap.walletSol}
        onMenu={toModes}
      />
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 text-[12px]">
        {scored ? (
          <RoundStatus scored={scored} now={snap.now} />
        ) : (
          <span className="text-amber">
            {mode === "dev"
              ? "DEV deploy arrives in phase 7. This is the free-running board for now."
              : "Free play: a tweet and its runner every 30-60 s. Nothing is scored."}
          </span>
        )}
      </div>

      <div className={`grid min-h-0 flex-1 gap-2 bg-bg p-2 ${feedOpen ? "grid-cols-[minmax(300px,350px)_1fr]" : "grid-cols-[40px_1fr]"}`}>
        <TweetFeed tweets={snap.feed} wallStart={wallStart} pauseOnHover={!scoredMode} open={feedOpen} onToggle={() => setFeedOpen(!feedOpen)} />
        <div className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-line bg-bg">
        {openId ? (
          <TokenPage
            engine={engine}
            snap={snap}
            coinId={openId}
            wallStart={wallStart}
            buyPresets={buyPresets}
            onBuyPresets={setBuyPresets}
            presetSet={presetSet}
            onPresetSet={setPresetSet}
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
          presets={quickPresets}
          colPreset={colPreset}
          onPresetValue={setQuickPreset}
          onColPreset={setColPreset}
          quickEnabled={quickEnabled}
          onQuickEnabled={setQuickEnabled}
          onQuickBuy={onQuickBuy}
          onOpen={setOpenId}
          pauseOnHover={!scoredMode}
        />
        )}
        </div>
      </div>

      <StatusBar hint={scoredMode ? "Scored round: the board never pauses" : "Hover a column or the feed to pause it"} />

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
