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
| 3 | Scenario generator, decoy rules, placeholder meme pack | done |
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
| `1`-`4` | Token page | Buy preset 1-4 (editable), fires instantly |
| `/` | Pulse | Search |
| Esc | Token page | Back to Pulse |
| Esc Esc | Pulse | Back to menu |
| Space | Live FIRST TX round | End the round and close your position |
| `R` / Enter | Results | Next round |
| Esc | Results | Back to menu |

## FIRST TX scoring

A round is: 3 s countdown, an armed wait of 1.5 to 4 s, then the tweet and the flood.

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
- `src/engine/memes.json` is the meme pack. It currently holds 4 PLACEHOLDER memes, one per author rule
  (Elon/SPACEX, Elon Tesla/TESLA, Toly/SOL, Alon/PUMP). Replace them with the real pack.
  Schema: `Meme` in `src/engine/types.ts`; `tickers[0]` is the right ticker; every tweet template needs `{name}`.
- Placeholder art is a gradient tile plus glyph (`src/ui/Art.tsx`). Set `art.src` on a meme to use a real image.
- Token page: `src/ui/TokenPage.tsx` (header + `ChartPanel` + `TradePanel` + `TradeTape` + `InfoTabs`). The chart aggregates the
  engine's 1 s candles client-side (`chartData.ts`) into 1s-1m bars, in Price or MC, USD or SOL, and updates through `series.update`.
  "Top 10 avg buy" is the volume-weighted MC of the first 30 SOL bought. Holders/Top Traders show modelled stats, not a fake wallet list. Coins you have open are pinned (`engine.focus`) so they never age off the board.
- UI/settings state: Zustand (`src/store/ui.ts`). Game state lives in the engine.

## Assumptions to confirm

- Only tweets from authority accounts (Elon, Toly, Alon, pump.fun) can start a round. Other accounts also
  post meme-naming tweets as distractors.
- Card chips: pair chip, DIV chip, and a launchpad badge on the art (P = Pump, B = Bonk).
