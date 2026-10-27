# Trench Academy

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

## Menu and campaign

Main menu: **Campaign** (the levelling journey) plus standalone modes: **FIRST TX** (live), Dev mode, OG mode, Mix
(coming), and Free play. Standalone modes have everything unlocked and keep personal bests only.

Campaign (rules in `src/campaign/progression.ts`, state in `src/store/campaign.ts`, saved in localStorage
`ta.campaign.v1`; the full plan is the project doc `trench-academy-plan.md`):

- One trader balance that carries between rounds, starting at 2.5 SOL. Under 0.5 SOL at the end of a round tops you
  back up to 2.5 at the cost of half your progress into the level. Leaving mid-round keeps what open bags were worth.
- XP = score / 10 (half in Casual), plus first-time bonuses (first 10×, first vamp, first Saga) and hit streaks.
  `xpForLevel(L) = 150 × (L − 1)^1.3`.
- Ranks: Fresh Wallet 1, Paper Hands 3, Jeeter 5, Trencher 8, Degen 11, Sniper 15, Chad 20, Whale 25, Insider 30.
- Level gates on existing features: Medium 2, TP/SL 3, Saga 4, side wallets at 5/8/11/18, boosts 7, DEX and Hard 10,
  consolidate 11, Dev 15. Market threats per level are listed on the road (only vamps are in so far).
- **KOL Rep** (from level 8, campaign only): Rep points → tiers Anon Caller 30 / Micro KOL 120 / Rising 400 / KOL 1200 /
  Big KOL 3500, followers 50 → 50K. Followers tail your buys 1.5-6 s later (real buys, capped at 2× yours) and
  follow you out when you sell. Post a call on a coin you hold (once per coin) for a bigger wave; it goes to the
  Tracker and the chart. From Rising your trades draw as your own bubble. Rep per round: profitable trades, early
  entries and calls that play out add; getting rugged, bad calls and dumping on followers (selling 25%+ within
  20 s of them buying) cost.
- **Admin (temporary):** the ADMIN button on menu screens, or the backtick key anywhere: set level, balances, reps,
  unlock everything, or reset the campaign.

## Dev mode (phase 1)

Standalone Dev mode (menu `2`): pick difficulty and a dev wallet of 10 / 50 / 200 SOL. A launchable tweet lands on
the Tracker every 35-55 s with a **Dev this** button (spec: project doc `dev-mode-spec.md`; rules in
`src/engine/dev.ts`).

- **Launch panel:** name + ticker and picture picked from 3 / 4 / 5 near-miss options (Easy / Medium / Hard; keys
  1-5 pick the name), launchpad, dividends, pair; Manual or Organic mode (Block-0 is next); dev buy, organic buys;
  creator fees to you or cashback to holders; summary of opening MC, supply held and cost. Deploy fee 0.02 SOL.
- **Rivals** deploy the right coin and its look-alikes 4-22 s after the tweet (faster on harder levels). First right
  coin gets the narrative; a rival's right coin that lands after yours only gets scraps.
- **Demand model:** your coins are not scripted. Organic buys and sells come from the tweet's heat, how right the
  launch is (a wrong name or ticker never bonds), your share of the narrative, room under a per-launch ceiling,
  momentum, your selling, and a per-launch narrative-luck roll. Tuned with `dev.harness.test.ts`
  (`HARNESS=1 npx vitest run src/engine/dev.harness.test.ts --silent=false`): right and fast bonds ~80% (median peak
  ~$150K, 1 in 20 near $1M+), right but late ~15%, a wrong picture ~30%, a wrong pair ~15%, a wrong ticker never.
- **Dev Ops** on your coin's page: deployer and other-wallet holdings with sells of 0.1% / 1% / 3% / MAX of supply
  (deployer sells are public, the others look like anyone), dev buy (forcing a bond works, it won't run), claim
  creator fees, Nuke. A wrong launch gets roasted on the Tracker and a "buyers aren't biting" warning.
- **Wallet column** (Dev mode, right of the trade panel): one row per wallet: the deployer, launch wallets 1-10
  (organic buys land in them; they look like anyone) and your trading wallets, each with its own buttons; flip the column between BUY (SOL per wallet)
  and SELL (10/25/50/100% of that wallet's bag).
- **Where it went wrong:** hover a launch chip (it carries ✓ or ✗N), the "buyers aren't biting" warning, or the
  ✓/✗ next to Launch report on your coin to see the tweet's name / ticker / picture / config against yours,
  mistakes first.
- **KOLs and promotion on your launch:** a right coin that runs draws KOL buys (real impact) at $25K / 50K / 100K /
  200K ... milestones, and sometimes a KOL tweet; they take profit as it bleeds. DEX profile and boosts on your own
  launch work any time (curve or pool), are paid from the dev wallet, and show up as attention in the demand model.
  Dividends are out of Dev mode for now.
- **Launches bar** (dev wallet, every launch, session realised PnL) and a **launch card** when a launch ends:
  outcome, peak MC, realised PnL, still holding, fees, and the tweet's name / ticker / picture / config against yours.

## Trader journey (FIRST TX setup)

Home is "Choose your path": Trader (live) or Dev (coming soon). Levelling comes later. The trader picks:

- **Length:** Blitz (one launch, tops inside about a minute) or Saga (5-10 min story with fades, revivals, catalysts and vamps).
- **Difficulty:** Easy / Medium / Hard.
- **Style:** Competitive (a wrong buy ends the round, counts towards PBs) or Casual (keep going, nothing recorded as a PB).
- **Starting balance:** Low port 2.5 SOL, Medium port 25 SOL, Whale port 250 SOL. Quick-buy and preset sizes scale with it.

Rules worth knowing:

- The runner sits in New Pairs for a few seconds, then Almost bonded for a few seconds, then migrates.
- **Wallets and the 5% rule:** you have up to five wallets (Main, Side 1-4), sharing one SOL balance. Pick which
  trade from the balance menu or the trade panel; a buy spends the amount in each selected wallet (GMGN-style: 3 wallets × 1 SOL = 3 SOL, three fills), sells come out of each.
  While any one wallet holds 5%+ of a coin, buyers hold back: before migration the launch runs at quarter speed,
  after it the coin only gets a quarter of each rise the script asks for (the rest is lost for good; drops land in
  full; boosts and DEX are blunted to a quarter). **Split ×2 / ×3** spreads a bag evenly, **Consolidate** pulls it
  into one wallet. There is no cap on the total, only the per-wallet 5%.
- **Promote** (token page, post-migration): buy x10-x500 boosts or pay the DEX profile ($299) from your balance. Each has a chance,
  not a promise, of pumping the coin back towards its ATH.
- KOL tweets and catalysts print an immediate giga candle, then heavy volume either way.
- Holders is the default token tab and lists you, the dev and any KOLs with their share of supply.
- **Real price impact:** migrated coins trade against a constant-product pool (about 20% of supply at migration,
  thinning as the price climbs). Your trades, the dev's dump and every KOL sell are priced through it.
- The dev dumps the whole bag at (or just before) migration. Later nukes are insiders, never the dev alone.
- KOLs never hold 4%+. They take profit by dumping their whole bag, and are all out before a coin falls under the
  migration line; dead coins bleed out around $5-15K.
- The DEX profile is paid once per coin; a later "DEX" catalyst becomes an x100 boost instead.
- A CTO is two or three (fictional) takeover crews tweeting it.
- Boosts and DEX payments you buy count against your PnL.
- **Course changes:** paying the DEX starts a leg up ~85% of the time and lifts the coin's course for good; a boost
  that works lifts it a little; about half of your own buy/sell impact sticks instead of being faded back.
- Holder spread: no anonymous wallet over ~3%, except coins scripted to rug (one or two 5-9% whales). Top 10 % is
  the real sum of the list.
- Chart: marks sit centred on the candle they traded in and stack vertically; your fills in one candle merge into a
  badge with a count. Every fill pops over the chart (SOLD 25% · +1.34 SOL · profit), rapid sells roll into one pop.
- Saga rounds end a few seconds after the last coin reaches its final stage; anything you still hold is market-sold.
- The first tweet lands 4-30 s after the countdown.


| Key | Where | Does |
| --- | --- | --- |
| `T` / `1` / `F` | Home | Trader path / Free play (Dev path coming) |
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

A round is: 3 s countdown, an armed wait of 4 to 30 s, then the tweet and the flood.

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
- Length: Blitz (the run tops inside about a minute) or Saga (`saga.ts`): a 5-10 minute story planned as chapters of beats.
  Pumps (KOL waves, boosts), fades (KOL exits), revivals off a catalyst (authority retweet or quote, KOL tweet, DEX paid, CTO,
  big KOL buy) and a final rug or bleed; peaks mostly $150K-1M, sometimes $1-5M, rarely $10M+, very rarely $30M+. Vamps (0, 1,
  rarely 2; written per meme as `vamps` in memes.json, e.g. Polar Bear Cub -> Polly -> Nora): the vamp tweet lands, the old coin's
  dev sells everything and it rugs, the new coin launches with its own look-alikes. Getting on it fast is scored; missing it or
  buying a look-alike is a penalty, never the end. A saga round runs until its story is over (Space ends it early when flat).
  Saga score: speed 450-600, entry 100, vamps 200 (if any), exit 250-300 on PnL across the whole story.
- Chart marks: DEV (partial) and DEV SOLD ALL with SOL, MC and % of supply; KOL pictures; tweets and retweets with the poster's
  picture; rocket boosts (tier, price, hours); DEX PAID and CTO tags. Hover any of them for details. PBs are per difficulty and length.
- Scoring (`scoreRound` in scoring.ts): out of 1000. Speed up to 800 (full at 150 ms, 0 at 3 s), entry up to 100 (buyer #1-5 full,
  0 by #40), exit up to 100 (PnL, full at +200%), minus 150 per wrong buy in Training. Only a correct buy scores.
- Feedback: the strip under the nav goes amber when armed and flashes green with TWEET LANDED; a WebAudio ping plays (mute in the
  nav). Buying the right coin flashes your reaction ms immediately; a wrong coin or false start flashes red before the results open.
- Styles: Strict (a wrong buy ends the round, counts for PBs) and Training (−150 per wrong buy, keep going, no PBs).
- Progression (`store/runs.ts`, localStorage `gngm.runs.v1`): PB reaction and best score per difficulty, average reaction,
  accuracy, streaks, last 10 runs on the setup screen; results compare against your PB and show this session's stats.
- The flood after the tweet is only the runner and its look-alikes (no random fillers); the slow background trickle carries on.
- Social layer (`SocialEvent`, `engine.getSocial`): the dev's buy at launch and one sell, either just before it bonds or within
  ~4 s of migration; 16 real trench KOLs (`KOLS` in content.ts, pictures in `public/kols/`) making simulated trades (max 10 a
  coin) on pumps and dips; 1-3 paid boosts after migration. Drawn by the `ChartMarks` primitive (DEV tag, KOL profile pictures,
  lightning boost tags). Hover any mark for who, bought/sold how much, and at what market cap. Toggle each from Socials.
- Endings: nothing sits still. A standard big-coin round either rugs to $10-15K straight after its top or makes a second leg up
  (1.4-2.2x) and then rugs; after any script ends the coin keeps bleeding (halving every ~90 s) with the bot chopping around it.
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
