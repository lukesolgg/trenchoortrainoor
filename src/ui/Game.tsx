"use client";

import { useCampaign, campaignFeatures } from "@/store/campaign";
import { ALL_FEATURES, type Award } from "@/campaign/progression";
import { buyWarning } from "./Wallets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "@/store/history";
import { DIFFICULTIES } from "@/engine/difficulty";
import { PORTS, useUi } from "@/store/ui";
import { PulseBoard } from "./PulseBoard";
import { BuyFlash, FLAW_SHORT, ResultsOverlay, RoundOverlay, RoundStatus, statusStripClass, type Flash } from "./RoundOverlays";
import { SESSION_START, statsFor, useRuns, type RunStats } from "@/store/runs";
import { sfx } from "./sound";
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

const MODE_LABEL = { firsttx: "FIRST TX", dev: "DEV", freeplay: "FREE PLAY", campaign: "CAMPAIGN" } as const;

interface Toast {
  id: number;
  text: string;
}

export function Game() {
  const {
    mode, difficulty: uiDifficulty, tab, setTab, quickAmount, setQuickAmount, quickEnabled, feedOpen, buySets, presetSet,
    setQuickEnabled, setBuyPresets, setPresetSet, setFeedOpen, toModes, start, style: uiStyle, length: uiLength, port,
  } = useUi();
  // FIRST TX and the campaign are scored rounds. DEV and free play stay on the unscored free-running board for now.
  const campaign = mode === "campaign";
  const scoredMode = mode === "firsttx" || campaign;
  // A campaign round plays with the campaign's settings, balance and unlocks (read once: the round is fixed at start).
  const [camp] = useState(() => {
    const c = useCampaign.getState();
    return { difficulty: c.difficulty, length: c.length, style: c.style, sol: c.traderSol, features: campaignFeatures(c) };
  });
  const difficulty = campaign ? camp.difficulty : uiDifficulty;
  const style = campaign ? camp.style : uiStyle;
  const length = campaign ? camp.length : uiLength;
  const features = campaign ? camp.features : ALL_FEATURES;
  const engine = useEngine({
    difficulty,
    autoRounds: !scoredMode,
    training: style === "training",
    length: scoredMode ? length : "blitz",
    startingSol: campaign ? camp.sol : PORTS[port].sol,
    walletCount: features.wallets,
  });
  const snap = useSnapshot(engine);
  // ?debug exposes the engine to the console and to browser tests.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __engine?: typeof engine }).__engine = engine;
  }, [engine]);
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
        buyWarning(engine, coinId, trade !== null) ??
        (trade
          ? `Bought ${sol(trade.sol, 2)} SOL of ${coin?.ticker ?? "coin"} · ${trade.rank} bot buys ahead of you`
          : engine.isMigrating(coinId)
            ? "Migrating: buys reopen in a moment"
            : "Buy failed: not enough SOL, or the coin is gone"),
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
  // ---- Round feedback: sounds, the hit/miss flash, and holding results back a beat so the flash lands first.
  const [flash, setFlash] = useState<(Flash & { id: number }) | null>(null);
  const [resultsShown, setResultsShown] = useState(false);
  const seenMisses = useRef(0);
  const seenHit = useRef<unknown>(null);
  const seenVamps = useRef(0);
  const lastPhase = useRef<string | null>(null);
  const lastCount = useRef(0);
  useEffect(() => {
    if (!scored) return;
    if (scored.phase !== lastPhase.current) {
      if (scored.phase === "live") sfx.tweet();
      if (scored.phase === "ended" && scored.result) {
        const r = scored.result;
        if (r.outcome === "false_start") {
          sfx.miss();
          setFlash({ id: Date.now(), kind: "miss", title: "FALSE START", sub: `${Math.round(r.earlyMs ?? 0)} ms before the tweet` });
        } else if (r.outcome === "wrong_coin" && !r.training) {
          sfx.miss();
          setFlash({ id: Date.now(), kind: "miss", title: "WRONG COIN", sub: `${r.bought?.ticker}: ${FLAW_SHORT[r.bought?.flaw ?? "unrelated"]}` });
        }
      }
      lastPhase.current = scored.phase;
    }
    if (scored.phase === "countdown") {
      const n = Math.ceil((scored.tArm - snap.now) / 1000);
      if (n !== lastCount.current && n > 0) sfx.tick();
      lastCount.current = n;
    }
    if (scored.vamps.length > seenVamps.current) {
      seenVamps.current = scored.vamps.length;
      sfx.tweet();
    }
    if (scored.hit && seenHit.current !== scored.hit) {
      seenHit.current = scored.hit;
      sfx.hit();
      setFlash({ id: Date.now(), kind: "hit", ms: scored.hit.reactionMs, rating: scored.hit.rating, buyer: scored.hit.buyNumber });
    }
    if (scored.misses.length > seenMisses.current) {
      const m = scored.misses[scored.misses.length - 1];
      seenMisses.current = scored.misses.length;
      if (scored.training || m.vamp) {
        sfx.miss();
        setFlash({ id: Date.now(), kind: "miss", title: "WRONG COIN", sub: `${m.ticker}: ${FLAW_SHORT[m.flaw]} · −${m.vamp ? 100 : 150} · keep going` });
      }
    }
  }, [scored, snap.now]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1100);
    return () => clearTimeout(t);
  }, [flash]);
  // Results open a beat after the round ends, longer when a red flash has to land first.
  const endedOutcome = scored?.phase === "ended" ? (scored.result?.outcome ?? null) : null;
  useEffect(() => {
    if (!endedOutcome) return;
    const quiet = endedOutcome === "success" || endedOutcome === "missed";
    const t = setTimeout(() => setResultsShown(true), quiet ? 250 : 1100);
    return () => clearTimeout(t);
  }, [endedOutcome]);

  // ---- Progression: record each finished round once; PB comparison uses the stats from before it.
  const runs = useRuns((r) => r.runs);
  const addRun = useRuns((r) => r.add);
  const [prevStats, setPrevStats] = useState<RunStats | null>(null);
  const runId = useRef(`${wallStart}-${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => {
    const r = scored?.result;
    if (!r || prevStats) return;
    setPrevStats(statsFor(useRuns.getState().runs, difficulty, { length: r.length }));
    addRun({
      id: runId.current,
      at: Date.now(),
      difficulty,
      length: r.length,
      training: r.training,
      outcome: r.outcome,
      reactionMs: r.reactionMs,
      score: r.score,
      ticker: r.rightCoin.ticker,
      rightAppearMs: r.rightAppearMs,
      decoys: r.decoys.length,
      buyNumber: r.buyNumber,
      pnlPct: r.pnlPct,
    });
  }, [scored?.result, prevStats, addRun, difficulty]);
  // ---- Campaign: pay out the round once (XP, bonuses, the balance it ended with). Leaving mid-round keeps what your
  // open bags were worth, so quitting never dodges a loss.
  const [award, setAward] = useState<Award | null>(null);
  const awarded = useRef(false);
  useEffect(() => {
    const r = scored?.result;
    if (!campaign || !r || awarded.current) return;
    awarded.current = true;
    setAward(useCampaign.getState().finishRound(r, snap.walletSol));
  }, [campaign, scored?.result, snap.walletSol]);
  useEffect(() => {
    if (!campaign) return;
    return () => {
      if (awarded.current) return;
      const s = snapRef.current;
      useCampaign.getState().abandonRound(s.walletSol + s.positions.reduce((n, p) => n + p.valueSol, 0));
    };
  }, [campaign]);
  const sessionStats = useMemo(() => statsFor(runs, difficulty, { since: SESSION_START, length: scored?.length ?? "blitz" }), [runs, difficulty, scored?.length]);

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
        walletSel={snap.walletSel}
        walletCount={snap.walletCount}
        onWalletSel={(s) => engine.setWalletSel(s)}
        onMenu={toModes}
      />
      <div className={`flex h-9 shrink-0 items-center justify-center gap-3 border-b border-line px-4 text-[12.5px] transition-colors ${statusStripClass(scored, snap.now)}`}>
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
            features={features}
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
      {flash && <BuyFlash key={flash.id} flash={flash} />}
      {scored?.result && resultsShown && prevStats && (
        <ResultsOverlay result={scored.result} prev={prevStats} session={sessionStats} award={award} onNext={start} onMenu={toModes} />
      )}

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
