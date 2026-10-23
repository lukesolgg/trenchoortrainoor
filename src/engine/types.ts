export type Pair = "SOL" | "SPACEX" | "TESLA" | "PUMP";
export type Launchpad = "pump" | "bonk";
export type DifficultyId = "paper" | "trencher" | "sniper";
export type CoinRole = "target" | "decoy" | "noise" | "ambient";
export type Flaw = "ticker" | "launchpad" | "dividends" | "pair";
export type Stage = "new" | "final" | "migrated";
export type Profile = "run" | "runLite" | "flat" | "bleed";

export interface ArtSpec {
  hue: number;
  glyph: string;
  /** Real image once the meme pack ships assets. Falls back to hue + glyph. */
  src?: string;
}

export interface CoinConfig {
  launchpad: Launchpad;
  dividends: boolean;
  pair: Pair;
}

export interface Candle {
  /** Whole seconds since session start. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** The tweet a coin was deployed off, shown on hover. */
export interface TweetSource {
  author: Author;
  segments: TweetSeg[];
}

export interface CoinView {
  id: string;
  ticker: string;
  name: string;
  art: ArtSpec;
  config: CoinConfig;
  createdAt: number;
  stage: Stage;
  mcSol: number;
  mcUsd: number;
  volumeUsd: number;
  progress: number;
  txCount: number;
  buys: number;
  sells: number;
  holders: number;
  /** Fees paid so far, in SOL (1% of volume). */
  feesSol: number;
  /** Liquidity in USD: SOL in the curve, or the pool after migration. */
  liqUsd: number;
  /** Volume-weighted average market cap of the earliest buys, in USD. Stands in for "top holders' avg buy". */
  earlyAvgMcUsd: number;
  /** USD bought and sold so far. */
  buyVolUsd: number;
  sellVolUsd: number;
  /** Tweet this coin was deployed off, or null when it has no socials. */
  source: TweetSource | null;
  /** How many of the deployer's earlier coins migrated. */
  devMigrated: number;
  proTraders: number;
  bundlers: number;
  dexPaid: boolean;
  /** Shortened pool address. */
  pair: string;
  /** Shortened mint address, e.g. "cJK...pump". */
  mint: string;
  creator: string;
  /** Percent chips shown under each card. */
  stats: { top10: number; dev: number; snipers: number; insiders: number };
  /** Set once the player has bought, for card highlighting. */
  held: boolean;
}

export interface Author {
  name: string;
  handle: string;
  followers: string;
  verified: boolean;
  hue: number;
  /** Accounts whose tweets can start a round. */
  authority: boolean;
}

export interface TweetSeg {
  text: string;
  hl?: boolean;
}

export interface TweetView {
  id: string;
  at: number;
  author: Author;
  segments: TweetSeg[];
  art?: ArtSpec;
  /** True for tweets that name a meme (purple card border). */
  memeTweet: boolean;
}

export interface Meme {
  id: string;
  name: string;
  /** Ranked best to worst. Index 0 is the right ticker. */
  tickers: string[];
  art: ArtSpec;
  author: "elon" | "toly" | "alon" | "pumpfun";
  /** Elon tweets about Tesla memes pair with TESLA instead of SPACEX. */
  tag?: "tesla";
  /** Templates must contain {name}. */
  tweets: string[];
}

export interface RoundView {
  memeId: string;
  tTweet: number;
  /** Time the right coin landed in New Pairs. Null until it does. */
  tTargetAppear: number | null;
  targetCoinId: string | null;
  rightPair: Pair;
}

export interface PlayerTrade {
  coinId: string;
  side: "buy" | "sell";
  /** Session-relative ms taken from the input event timestamp (used for scoring). */
  at: number;
  /** Engine time the trade actually executed (used to place chart markers). */
  execAt: number;
  sol: number;
  tokens: number;
  /** Bot buys already on this coin when the player bought. */
  rank: number;
}

export interface TapeEntry {
  id: number;
  at: number;
  by: "bot" | "you";
  /** Short fake wallet, stable per trade. "You" for the player. */
  trader: string;
  side: "buy" | "sell";
  sol: number;
  mcUsd: number;
}

export interface Position {
  coinId: string;
  tokens: number;
  /** Total tokens ever bought, for average entry price. */
  boughtTokens: number;
  boughtSol: number;
  soldSol: number;
  /** Mark-to-market value of the remaining tokens. */
  valueSol: number;
}

export interface Snapshot {
  version: number;
  now: number;
  newPairs: CoinView[];
  finalStretch: CoinView[];
  migrated: CoinView[];
  feed: TweetView[];
  walletSol: number;
  positions: Position[];
  round: RoundView | null;
  /** Present only in scored rounds. */
  scored: ScoredView | null;
}

export type RoundPhase = "countdown" | "armed" | "live" | "ended";
export type RoundOutcome = "success" | "false_start" | "wrong_coin" | "missed";

export interface CoinSummary {
  ticker: string;
  name: string;
  art: ArtSpec;
  config: CoinConfig;
}

export interface DecoySummary extends CoinSummary {
  flaw: Flaw;
}

export interface RoundResult {
  outcome: RoundOutcome;
  memeName: string;
  authorName: string;
  authorHandle: string;
  tweetSegments: TweetSeg[];
  rightCoin: CoinSummary;
  /** ms after the tweet that the right coin landed. Null if it never did. */
  rightAppearMs: number | null;
  /** Look-alikes that had landed by the end, each with its one flaw. */
  decoys: DecoySummary[];
  /** The coin you bought first, if any. `flaw` is null for the right coin. */
  bought: (CoinSummary & { flaw: Flaw | "unrelated" | null }) | null;
  /** False start only: how long before the tweet you bought. */
  earlyMs: number | null;
  /** Right coin landed to your buy. Success only. */
  reactionMs: number | null;
  tweetToBuyMs: number | null;
  /** 1 = first buyer (the dev counts as a buyer). */
  buyNumber: number | null;
  entryMcUsd: number | null;
  boughtSol: number;
  closedSol: number;
  pnlSol: number;
  pnlPct: number;
  rating: string | null;
}

export interface ScoredView {
  phase: RoundPhase;
  tStart: number;
  /** Countdown ends, board is armed. */
  tArm: number;
  tTweet: number;
  tEnd: number | null;
  result: RoundResult | null;
}
