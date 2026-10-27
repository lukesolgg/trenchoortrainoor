# Trencher Trainer

Single-player reaction-time trainer for memecoin traders. Simulator only: no real trades, no wallet.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine tests (Vitest)
npm run typecheck
```

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Scaffold, theme, shell | done |
| 2 | Engine core (clock, seeded RNG, scheduler, bonding curve, tests) | done |
| 3 | Scenario generator, decoy rules, meme pack | done |
| 4 | Pulse UI, streaming board, quick-buy, hover-pause | done |
| 5 | Token page: chart, buy/sell, position PnL, trades tape | done |
| 6 | FIRST TX scored round: false starts, wrong coin, reaction ms, results | done |
| 6.5 | GnGm restyle (GMGN look), Trenches columns with P1-P3 presets, token page v2 | done |
| 7 | DEV mode: deploy form, pre-fill, rival deployers | next |
| 8 | Results, personal bests, settings (localStorage) | |
| 9 | Polish: audio, animation, perf, keyboard pass | |

## Controls

| Key | Where | Does |
| --- | --- | --- |
| `3` / `1` / `F` | Home | FIRST TX / DEV / Free play |
| Space | Setup | Start |
| click a card, or hover + `T` | Pulse | Open the coin's page |
| `1`-`8` | Token page | Fires buy preset 1-8 of the active set (3 editable sets) |
| `/` | Pulse | Search |
| Esc | Token page | Back to Pulse |
| Esc Esc | Pulse | Back to menu |
| Space | Live FIRST TX round | End the round (only when you hold nothing; holding, it ends when you sell 100%) |
| `R` / Enter | Results | Next round |
| Esc | Results | Back to menu |

## FIRST TX scoring

A round is: 3 s countdown, an armed wait of 4 to 55 s, then the tweet and the flood.

- **False start:** any buy before the tweet (judged by the click's own timestamp). The buy is not executed.
- **Wrong coin:** your first buy after the tweet is anything but the right coin. The round ends and the results name that coin's flaw.
- **Success:** your first buy is the right coin. Reaction = your click time minus the moment the right coin landed in New Pairs
  (accurate to one display frame). The round ends when you sell out, press Space, or after 90 s; the position is market-sold at the end,
  so PnL includes fees and slippage.
- **Missed:** no buy within 20 s of the tweet, or Space with no buy.
- Hover-pause is off during scored rounds, and the board updates every frame so nothing you are racing for is hidden.
- Reaction bands (`src/engine/scoring.ts`): under 300 ms Bot speed, 600 Elite, 1000 Fast, 1500 Solid, 2500 Slow, then Too slow.

## Architecture

- `src/engine/`: plain TypeScript, no React. `Engine` owns the clock, a seeded RNG, an event scheduler
  and every simulated coin. `advanceTo(t)` runs events in time order, so frame jitter never changes outcomes.
  React reads it through `useSyncExternalStore` (`src/ui/hooks.ts`).
- Bots and the player trade through the same pump.fun-style bonding curve (`curve.ts`), so price impact and
  queue position come from the maths.
- Player input timing uses the raw `event.timeStamp` (pointerdown/keydown), never `click`.
- `src/engine/memes.json` is the meme pack: round 1 is five big Solana memes (PNUT/elon, GOAT and FARTCOIN/Truth Terminal,
  WIF/toly, POPCAT/alon). Author-to-pair: Elon SPACEX (TESLA with `tag: "tesla"`), toly SOL, everyone else PUMP.
  Schema: `Meme` in `src/engine/types.ts`; `tickers[0]` is the right ticker; every tweet template needs `{name}`.
  Optional `info` holds reference facts (launch, ATH, CA) for a later results screen. Tweets are simulated, not real quotes.
- Every coin has a real photo: `public/coins/<meme id>.jpg` for memes (their look-alikes reuse it) and `public/coins/<ticker>.jpg`
  for filler coins. Sources are Pexels (free licence), listed in `public/coins/CREDITS.md`. The gradient + glyph in `Art.tsx` is
  only a fallback if an image fails to load.
- Meme pack: 27 scenarios. The 10 added later (Oracle of Delphi, Silent Observer, Singularity, Out of Hand, Philosophers Stone,
  Eternal Return, Neural Crown, Bag of Holding, Final Form, Glass Cannon) use the big-coin outcome system. Trench Report and
  Lowcap Larry are fictional accounts that can start rounds; their pair is /PUMP.
- Token page: `src/ui/TokenPage.tsx` (header + `ChartPanel` + `TradePanel` + `TradeTape` + `InfoTabs`). The chart aggregates the
  engine's 1 s candles client-side (`chartData.ts`) into 1s-1m bars, in Price or MC, USD or SOL, and updates through `series.update`.
  "Top 10 avg buy" is the volume-weighted MC of the first 30 SOL bought. Holders/Top Traders show modelled stats, not a fake wallet list. Coins you have open are pinned (`engine.focus`) so they never age off the board.
- UI/settings state: Zustand (`src/store/ui.ts`). Game state lives in the engine.
- Nav tabs (`TopNav.tsx`): Trenches (tracker + Memescope), Trending (`Trending.tsx`: Surging / Top gainers / Fresh / Near migration,
  with quick-buy), Portfolio (`Portfolio.tsx`: open positions, closed-trade history, equity curve) and Rewards (coming soon).
  CopyTrade, Monitor and Track are placeholders. Closed trades persist in this browser's localStorage (`store/history.ts`, key `gngm.history.v1`, cap 500).
- Migration: at about $43K MC a coin locks for 3 s. Buys and sells are blocked and the price walk is skipped (chart frozen). The chart
  shows a dotted horizontal "Migration" price line at that market cap. Coins with an `ath` range then run a scripted path (`planRun`):
  3-4 pushes, each followed by a pullback and a low-volume base, sometimes a deep flush, ending at the ATH.
- Round flow: New Pairs is kept thin (1-3 coins at start, a new one every 8-20 s). The tweet brings a flood of 2-4 / 4-7 / 6-12
  coins (Paper / Trencher / Sniper) with the runner landing early. Every runner launch is scripted (`scriptLaunch`) and migrates
  3-15 s after it lands. A scored round only auto-ends once you are flat: hold and it keeps running until you sell 100%. Space only ends it when you hold nothing.
- Scoring (`scoreRound` in scoring.ts): out of 1000. Speed up to 800 (full at 150 ms, 0 at 3 s), entry up to 100 (buyer #1-5 full,
  0 by #40), exit up to 100 (PnL, full at +200%), minus 150 per wrong buy in Training. Only a correct buy scores.
- Feedback: the strip under the nav goes amber when armed and flashes green with TWEET LANDED; a WebAudio ping plays (mute in the
  nav). Buying the right coin flashes your reaction ms immediately; a wrong coin or false start flashes red before the results open.
- Styles: Strict (a wrong buy ends the round, counts for PBs) and Training (−150 per wrong buy, keep going, no PBs).
- Progression (`store/runs.ts`, localStorage `gngm.runs.v1`): PB reaction and best score per difficulty, average reaction,
  accuracy, streaks, last 10 runs on the setup screen; results compare against your PB and show this session's stats.
- The flood after the tweet is only the runner and its look-alikes (no random fillers); the slow background trickle carries on.
- Social layer (`SocialEvent`, `engine.getSocial`): the dev's buy at launch and sell (on the rug or the first dump), made-up KOLs
  (`KOLS` in content.ts, max 10 events a coin) buying pumps and selling dips, and 1-3 paid boosts after migration. Drawn by the
  `ChartMarks` primitive: DEV tag, KOL initials, lightning boost tags; toggle each from Socials in the chart toolbar.
- Runs are choppier: panic sells into pumps and FOMO buys into dips print counter-candles, the volume bot fires 4-7 micro fills a
  step (about 20 tx/s) and volume scales with market cap.
- Look-alikes land 0.3-0.8 s (+ stagger) after the right coin on Paper Hands and Trencher, on top of it on Sniper (`decoyDelayMs`).
  Pair and DIV chips are large and colour-filled; no DIV shows as a struck-through chip.
- `?debug` in the URL exposes the engine as `window.__engine` (used by browser tests).
- Big coins (the five main memes, `big` in memes.json) pick an outcome each round (`BIG_OUTCOME_WEIGHTS`, documented on `BigOutcome`
  in engine.ts): standard, runner ($0.7-2.5M), moon ($3-50M) or top-and-rug ($200-400K then ~$25K within ~8 s). Runners migrate in
  2.5-5 s (sometimes up to 12 s) and top out 13-50 s after launch, calibrated to txgym sweat rounds. $1M+ runs get giga candles.
- Token page: chart with volume overlaid on the price pane; one tabbed panel underneath (Trades, Positions, Orders, Holders (n),
  Top Traders, Dev Tokens). Orders are take profit / stop loss on market cap (`engine.addOrder`), filled the moment the trigger is crossed.
  Holders grow with market cap and the Top 10 avg buy ratchets up behind price. Top holders and dev tokens are modelled per coin.
- Memescope: GMGN-style rows, one quick-buy amount for the whole board, hovering a column pauses it (gold border). A round
  opens with a full New column, 3-4 coins in Almost bonded and the Tracker already scrolled.
- Price action after migration has two layers: the level only moves on size (slow drift plus whale buys/sells that close the gap
  to the script), and a volume bot bounces the price around it with micro fills, so candles get wicks both ways.
- X avatars: `public/avatars/<handle>.jpg` (elonmusk, toly, a1lon9, truth_terminal, blknoiz06, solana are in; pumpdotfun is not yet). Missing files fall back to the gradient initial.
- Your trades show on the chart as round B / S badges at the market cap you traded at (`TradeDots` primitive in ChartPanel.tsx).
- The Tracker is a separate full-height column outside the app chrome. `MultiplierFlash` flashes 2x/5x/10x/20x/50x/100x on open positions.
- Tracker keywords are highlighted pink (`highlightPhrases` in `scenario.ts`); memes can set `highlight` phrases and `noHighlight`.

## Assumptions to confirm

- Only tweets from authority accounts (Elon, Toly, Alon, pump.fun) can start a round. Other accounts also
  post meme-naming tweets as distractors.
- Card chips: pair chip, DIV chip, and a launchpad badge on the art (P = Pump, B = Bonk).
