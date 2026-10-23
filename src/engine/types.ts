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
  holders: number;
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
  /** Session-relative ms taken from the input event timestamp. */
  at: number;
  sol: number;
  tokens: number;
  /** Bot buys already on this coin when the player bought. */
  rank: number;
}

export interface Position {
  coinId: string;
  tokens: number;
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
}
