"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "@/store/history";
import { DIFFICULTIES } from "@/engine/difficulty";
import { useUi } from "@/store/ui";
import { PulseBoard } from "./PulseBoard";
import { ResultsOverlay, RoundOverlay, RoundStatus } from "./RoundOverlays";
import { TokenPage } from "./TokenPage";
import { Portfolio, type OpenRow } from "./Portfolio";
import { MultiplierFlash } from "./MultiplierFlash";
import { Rewards } from "./Rewards";
import { StatusBar } from "./StatusBar";
import { Trending } from "./Trending";
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
    mode, difficulty, tab, setTab, quickAmount, setQuickAmount, quickEnabled, feedOpen, buySets, presetSet,
    setQuickEnabled, setBuyPresets, setPresetSet, setFeedOpen, toModes, start,
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
          : engine.isMigrating(coinId)
            ? "Migrating: buys reopen in a moment"
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
      // Space ends a live round when you are flat (unless it is pressing a trade button). Holding, it is refused.
      if (e.code === "Space" && phase === "live" && !typing && !(e.target instanceof Element && e.target.closest("[data-fire]"))) {
        e.preventDefault();
        if (!engine.endRound()) notify("You're still holding. Sell 100% to end the round.");
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
  }, [toModes, openId, start, engine, notify]);

  const buyPresets = buySets[presetSet];
  const allCoins = useMemo(() => [...snap.newPairs, ...snap.finalStretch, ...snap.migrated], [snap.newPairs, snap.finalStretch, snap.migrated]);
  const openRows: OpenRow[] = snap.positions.map((p) => {
    const v = engine.getCoinView(p.coinId);
    return { position: p, ticker: v?.ticker ?? "?", name: v?.name ?? "", art: v?.art ?? { hue: 0, glyph: "?" } };
  });
  const sellFromPortfolio = (coinId: string, fraction: number, ts: number) => {
    const trade = engine.sell(coinId, fraction, engine.fromEventTime(ts));
    notify(
      trade
        ? `Sold ${Math.round(fraction * 100)}% for ${sol(trade.sol)} SOL`
        : engine.isMigrating(coinId)
          ? "Migrating: trading reopens in a moment"
          : "Nothing to sell",
    );
  };

  // Closed positions go to the Portfolio history (kept in this browser).
  const savedClosed = useRef(0);
  const addHistory = useHistory((h) => h.add);
  useEffect(() => {
    const fresh = snap.closed.slice(savedClosed.current);
    if (!fresh.length) return;
    savedClosed.current = snap.closed.length;
    addHistory(fresh.map((t) => ({ key: `${wallStart}-${t.id}`, ticker: t.ticker, name: t.name, art: t.art, invested: t.invested, returned: t.returned, closedAt: Date.now() })));
  }, [snap.closed, addHistory, wallStart]);
  const tickerOf = useCallback((id: string) => engine.getCoinView(id)?.ticker ?? "", [engine]);
  const diff = DIFFICULTIES[difficulty];

  return (
    <div className="flex h-dvh">
      {/* The Tracker is its own window: full height, outside the app chrome. */}
      <div className={`h-full shrink-0 ${feedOpen ? "w-[350px]" : "w-10"}`}>
        <TweetFeed tweets={snap.feed} wallStart={wallStart} pauseOnHover={!scoredMode} open={feedOpen} onToggle={() => setFeedOpen(!feedOpen)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
      <TopNav
        tab={tab}
        onTab={(t) => {
          setOpenId(null);
          setTab(t);
        }}
        modeLabel={MODE_LABEL[mode]}
        difficultyLabel={diff.label}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        walletSol={snap.walletSol}
        onMenu={toModes}
      />
      <div className="flex h-8 shrink-0 items-center justify-center gap-3 border-b border-line bg-bg px-4 text-[12px]">
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

      <div className="min-h-0 flex-1 bg-bg p-2">
        <div className="h-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-line bg-bg">
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
            onOpen={setOpenId}
            notify={notify}
          />
        ) : tab === "trending" ? (
          <Trending
            coins={allCoins}
            now={snap.now}
            query={query}
            quickSol={quickAmount}
            quickEnabled={quickEnabled}
            onQuickBuy={onQuickBuy}
            onOpen={setOpenId}
          />
        ) : tab === "portfolio" ? (
          <Portfolio walletSol={snap.walletSol} open={openRows} onOpenCoin={setOpenId} onSell={sellFromPortfolio} />
        ) : tab === "rewards" ? (
          <Rewards />
        ) : (
        <PulseBoard
          newPairs={snap.newPairs}
          finalStretch={snap.finalStretch}
          migrated={snap.migrated}
          now={snap.now}
          query={query}
          quickAmount={quickAmount}
          onQuickAmount={setQuickAmount}
          quickEnabled={quickEnabled}
          onQuickEnabled={setQuickEnabled}
          onQuickBuy={onQuickBuy}
          onOpen={setOpenId}
        />
        )}
        </div>
      </div>

      <StatusBar hint="Hover a column to pause it and click the coin you see" />
      </div>

      <MultiplierFlash positions={snap.positions} tickerOf={tickerOf} />
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
