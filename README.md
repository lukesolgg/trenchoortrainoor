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
| 4 | Pulse UI, streaming board, quick-buy, hover-pause | done (checkpoint) |
| 5 | FIRST TX loop: scoring, false starts, results | next |
| 6 | Token page: chart, buy/sell, PnL | |
| 7 | DEV mode: deploy form, pre-fill, rival deployers | |
| 8 | Setup and results screens, personal bests | |
| 9 | Polish: audio, animation, perf, keyboard pass | |

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
- UI/settings state: Zustand (`src/store/ui.ts`). Game state lives in the engine.

## Assumptions to confirm

- Only tweets from authority accounts (Elon, Toly, Alon, pump.fun) can start a round. Other accounts also
  post meme-naming tweets as distractors.
- Card chips: pair chip, DIV chip, and a launchpad badge on the art (P = Pump, B = Bonk).
