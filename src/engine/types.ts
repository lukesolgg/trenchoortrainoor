export type Pair = "SOL" | "SPACEX" | "TESLA" | "PUMP";
export type Launchpad = "pump" | "bonk";
export type DifficultyId = "paper" | "trencher" | "sniper";
/** "mine": a coin you launched in Dev mode. */
export type CoinRole = "target" | "decoy" | "noise" | "ambient" | "mine";
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
  /** Sim time (ms) the coin migrated, or null. */
  migratedAt: number | null;
  /** Change in market cap since the first candle, in percent. */
  changePct: number;
  /** Sim time (ms) until which trading is frozen after migration, or null. */
  migratingUntil: number | null;
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
  /** KOL Rep: you posted a call on this coin; how many of your followers tailed you in, and with how much. */
  called: boolean;
  tailers: number;
  tailSol: number;
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
  /** Profile picture path, if there is one. */
  avatar?: string;
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
  /** Your own call (KOL Rep thesis). */
  mine?: boolean;
  /** Dev mode: a tweet you can launch a coin off. */
  scenarioId?: string;
}

export interface Meme {
  id: string;
  name: string;
  /** Ranked best to worst. Index 0 is the right ticker. */
  tickers: string[];
  art: ArtSpec;
  author: "elon" | "toly" | "alon" | "pumpfun" | "truthterminal" | "ansem" | "solana" | "trenchreport" | "lowcaplarry";
  /** Elon tweets about Tesla memes pair with TESLA instead of SPACEX. */
  tag?: "tesla";
  /** Templates must contain {name}. */
  tweets: string[];
  /** Target all-time-high market cap in USD (min, max). The round's winner runs to a point in this range. */
  ath?: [number, number];
  /** Big-coin script: launches at $3-10K, bursts to $30-35K in 1-3 s, migrates, holds above $100K, tops out within ~3 min, then can round-trip. USD ranges. */
  big?: { peak: [number, number]; trip: [number, number] };
  /** The tweet does not spell out the coin name, so nothing is highlighted and templates need no {name}. */
  noHighlight?: boolean;
  /** Extra phrases to highlight in pink in the tracker, as hints (not the coin name). */
  highlight?: string[];
  /**
   * Saga mode: the narratives that can take over from this coin, in order (a rename, a sequel, a relative...).
   * When one lands, the original rugs and this one launches with its own look-alikes.
   */
  vamps?: VampDef[];
  /** Reference facts for the real coin this meme is based on. Not used in play yet (results screen later). */
  info?: { launch: string; athMcUsd: string; athDate: string; ca: string; lesson: string };
}

export interface VampDef {
  name: string;
  /** Ranked best to worst; index 0 is the right ticker. */
  tickers: string[];
  author: Meme["author"];
  /** Templates must contain {name} unless noHighlight. */
  tweets: string[];
  /** Defaults to the original meme's art. */
  art?: Partial<ArtSpec>;
  highlight?: string[];
  noHighlight?: boolean;
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
  /** Tokens in each of your wallets. */
  wallets: number[];
  /** Boosts and DEX payments you bought for this coin (count against its PnL). */
  promoSol: number;
  /** Mark-to-market value of the remaining tokens. */
  valueSol: number;
}

/** Take-profit / stop-loss order on a held coin. Triggers on market cap; sells `fraction` of what you hold then. */
export interface Order {
  id: number;
  coinId: string;
  kind: "tp" | "sl";
  triggerMcUsd: number;
  fraction: number;
  status: "open" | "filled" | "cancelled";
  createdAt: number;
  filledAt: number | null;
  filledSol: number | null;
}

/** A position that has been fully sold. The UI keeps these in localStorage for the Portfolio. */
export interface ClosedTrade {
  /** Sequence number within the session. */
  id: number;
  coinId: string;
  ticker: string;
  name: string;
  art: ArtSpec;
  invested: number;
  returned: number;
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
  /** Which of your wallets trade (indexes). */
  walletSel: number[];
  /** How many wallets you may use (1-5). */
  walletCount: number;
  /** Fully closed positions this session, oldest first. */
  closed: ClosedTrade[];
  /** TP/SL orders, newest first. */
  orders: Order[];
  round: RoundView | null;
  /** Present only in scored rounds. */
  scored: ScoredView | null;
  /** Dev mode: the dev wallet (null outside Dev mode) and your launches, oldest first. */
  devSol: number | null;
  launches: LaunchView[];
}

/** A coin you launched in Dev mode, for the launches bar, the Dev Ops panel and the launch card. */
export interface LaunchView {
  coinId: string;
  scenarioId: string;
  ticker: string;
  name: string;
  art: ArtSpec;
  mcUsd: number;
  peakMcUsd: number;
  bonded: boolean;
  ended: boolean;
  endReason: "died" | "closed" | null;
  /** Share of supply in your deployer wallet and in your other launch wallets (%), and what it is all worth (SOL). */
  deployerPct: number;
  holdersPct: number;
  /** Each launch wallet's share of supply (%), 10 to 50 of them. */
  launchWalletPcts: number[];
  /** The trend bot's own wallets (%), and the holder-bot wallets together. */
  botWalletPcts: number[];
  holderWallets: { count: number; pct: number };
  /** Everything you hold in the launch across every group (%). */
  totalPct: number;
  /** Bots running on this launch. */
  bots: {
    volume: { label: string; done: number; endsInMs: number } | null;
    trend: { targetUsd: number; spentSol: number; budgetSol: number } | null;
    holders: { total: number; added: number } | null;
    botHolders: number;
    lastBot: string | null;
  };
  holdingsSol: number;
  /** Everything you put in (deploy fee, dev buy, organic buys, buys after), what your sells returned, rewards. */
  spentSol: number;
  gotSol: number;
  rewardsMode: "creator" | "cashback";
  rewardsSol: number;
  claimedSol: number;
  /** Realised: sells + claimed rewards − everything spent. */
  pnlSol: number;
  launchedAt: number;
  /** ms from the tweet to your deploy. */
  deployMs: number;
  /** You were first with the right coin (rivals got scraps), or a rival beat you to it. */
  first: boolean;
  check: { name: boolean; ticker: boolean; image: boolean; launchpad: boolean; dividends: boolean; pair: boolean };
  /** What the tweet called for. */
  right: { name: string; ticker: string; art: ArtSpec; config: CoinConfig };
  config: CoinConfig;
}

/** What the launch panel shows for a Dev mode tweet. The right answers stay in the engine. */
export interface DevScenarioView {
  id: string;
  tweetAt: number;
  authorName: string;
  names: { name: string; ticker: string }[];
  images: ArtSpec[];
  launchedCoinId: string | null;
  /** A rival's right coin is already on the board. */
  rivalFirst: boolean;
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

/** What your following did this round (campaign KOL Rep). */
export interface KolRoundStats {
  tailers: number;
  tailSol: number;
  /** Followers you sold on within seconds of them buying in. */
  dumpedOn: number;
  /** You posted a call this round. */
  called: boolean;
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
  /** Boosts and DEX payments, included in PnL. */
  promoSol: number;
  closedSol: number;
  pnlSol: number;
  pnlPct: number;
  rating: string | null;
  /** Out of 1000, with its parts. Zero unless you bought the right coin. */
  score: number;
  scoreParts: { speed: number; entry: number; exit: number; penalty: number; vamps: number };
  /** Training style: wrong coins bought before the right one (the round kept going). */
  wrongBuys: WrongBuy[];
  training: boolean;
  length: RoundLength;
  vamps: VampView[];
  kol: KolRoundStats;
}

export interface WrongBuy {
  ticker: string;
  flaw: Flaw | "unrelated";
  /** ms after the tweet. */
  atMs: number;
  /** A look-alike of a saga vamp (a penalty, never the end of the round). */
  vamp?: boolean;
}

/** Shown the instant you buy the right coin, before the round is over. */
export interface Hit {
  reactionMs: number;
  rating: string;
  buyNumber: number;
  ticker: string;
}

export interface ScoredView {
  phase: RoundPhase;
  tStart: number;
  /** Countdown ends, board is armed. */
  tArm: number;
  tTweet: number;
  tEnd: number | null;
  result: RoundResult | null;
  /** Set the moment you buy the right coin. */
  hit: Hit | null;
  /** Wrong coins bought so far. In strict style the first one ends the round. */
  misses: WrongBuy[];
  training: boolean;
  length: RoundLength;
  /** Saga: each new narrative that took over, and how fast you got on it. */
  vamps: VampView[];
}

export type RoundLength = "blitz" | "saga";

export interface VampView {
  ticker: string;
  name: string;
  /** Sim ms the vamp tweet landed / its right coin appeared. */
  tweetAt: number;
  appearAt: number | null;
  coinId: string | null;
  /** Coin appeared to your first buy of it. Null if you never bought it. */
  reactionMs: number | null;
  /** Look-alikes of this vamp you bought. */
  wrong: number;
}

/** Something social happening on a coin, drawn on its chart: the dev trading, a KOL trading, or a paid boost. */
export interface SocialEvent {
  id: number;
  /** Sim ms. */
  at: number;
  kind: "dev" | "kol" | "boost" | "tweet" | "dex" | "cto";
  side: "buy" | "sell" | null;
  /** Market cap in SOL where it happened. */
  mc: number;
  name: string;
  /** KOL X handle (their picture is public/kols/<handle>.jpg). */
  handle?: string;
  sol: number;
  /** Avatar colour for KOLs. */
  hue: number;
  /** Boost size, e.g. "x30". */
  label?: string;
  /** Boosts and DEX paid: what it cost (USD), and how long a boost lasts. */
  usd?: number;
  hours?: number;
  /** Dev trades: share of supply moved, and whether it was the dev's whole bag. */
  pct?: number;
  all?: boolean;
  /** KOL sells: what the bag cost them (SOL). */
  cost?: number;
  /** Tweets on the chart: picture and what was said. */
  avatar?: string;
  text?: string;
}
