import rawPack from "./memes.json";
import {
  AUTHORITIES,
  AUTHORITY_TWEETS,
  FILLER_COINS,
  NOISE_AUTHORS,
  NOISE_MEMES,
  NOISE_TWEETS,
  rightPairFor,
} from "./content";
import type { Rng } from "./rng";
import type { Difficulty } from "./difficulty";
import type { ArtSpec, Author, TweetSource, CoinConfig, CoinRole, Flaw, Meme, Pair, Profile, TweetSeg } from "./types";

const PAIRS: Pair[] = ["SOL", "SPACEX", "TESLA", "PUMP"];

export function validateMeme(m: Meme): Meme {
  if (!m.id || !m.name) throw new Error(`meme missing id or name: ${JSON.stringify(m)}`);
  if (!m.tickers?.length) throw new Error(`meme ${m.id} needs at least one ticker`);
  if (!(m.author in AUTHORITIES)) throw new Error(`meme ${m.id} has unknown author ${m.author}`);
  if (!m.tweets?.length) throw new Error(`meme ${m.id} needs at least one tweet`);
  for (const t of m.tweets) {
    if (!m.noHighlight && !t.includes("{name}")) throw new Error(`meme ${m.id} tweet is missing {name}: ${t}`);
  }
  return m;
}

export const MEME_PACK: Meme[] = (rawPack.memes as Meme[]).map(validateMeme);

export interface CoinSpec {
  ticker: string;
  name: string;
  art: ArtSpec;
  config: CoinConfig;
  role: CoinRole;
  flaw?: Flaw;
  profile: Profile;
  /** How long organic flow keeps running. Null means until it migrates. */
  ttlMs: number | null;
}

export interface TimedSpawn {
  /** ms after the round tweet. */
  at: number;
  spec: CoinSpec;
}

export interface DistractorPlan {
  at: number;
  author: Author;
  segments: TweetSeg[];
  art: ArtSpec;
  spawns: TimedSpawn[];
}

export interface RoundPlan {
  meme: Meme;
  author: Author;
  segments: TweetSeg[];
  rightPair: Pair;
  rightConfig: CoinConfig;
  spawns: TimedSpawn[];
  /** Index into spawns of the right coin. */
  targetIndex: number;
  /** Where the winner's run should peak, in USD market cap. Undefined: generic run. */
  athMcUsd?: number;
  snipers: number;
  sniperReactMs: [number, number];
  distractors: DistractorPlan[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pink-highlight whole-word, case-insensitive matches of `phrases` in the plain segments. */
export function highlightPhrases(segs: TweetSeg[], phrases: readonly string[]): TweetSeg[] {
  if (!phrases.length) return segs;
  const re = new RegExp(`\\b(${[...phrases].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})\\b`, "gi");
  const out: TweetSeg[] = [];
  for (const seg of segs) {
    if (seg.hl) {
      out.push(seg);
      continue;
    }
    let last = 0;
    for (const m of seg.text.matchAll(re)) {
      const i = m.index ?? 0;
      if (i > last) out.push({ text: seg.text.slice(last, i) });
      out.push({ text: m[0], hl: true });
      last = i + m[0].length;
    }
    if (last < seg.text.length) out.push({ text: seg.text.slice(last) });
  }
  return out;
}

/** Words the tracker picks out in pink on ordinary chatter, like a real trenching feed. */
export const KEYWORDS = [
  "dev", "bundlers", "migration", "migrated", "slippage", "stop loss", "wallet", "take profits", "dex paid",
  "snipers", "insiders", "rug", "jeet", "liquidity", "chart", "candle", "mint", "fees", "conviction", "market cap",
];

export function splitTemplate(template: string, name: string): TweetSeg[] {
  if (!template.includes("{name}")) return [{ text: template }];
  const [before, after] = template.split("{name}");
  return [
    { text: before },
    { text: name, hl: true },
    { text: after ?? "" },
  ].filter((s) => s.text.length > 0);
}

function noiseProfile(rng: Rng): Profile {
  const r = rng.next();
  if (r < 0.45) return "bleed";
  if (r < 0.9) return "flat";
  return "runLite";
}

function randomConfig(rng: Rng): CoinConfig {
  return {
    launchpad: rng.chance(0.8) ? "pump" : "bonk",
    dividends: rng.chance(0.55),
    pair: rng.pick(PAIRS),
  };
}

export function makeFillerCoin(rng: Rng, role: CoinRole = "noise", used?: Set<string>): CoinSpec {
  // Within a round, avoid repeating a filler name so the board is not full of clones.
  const fresh = used ? FILLER_COINS.filter((c) => !used.has(c.ticker)) : FILLER_COINS;
  const f = rng.pick(fresh.length ? fresh : FILLER_COINS);
  used?.add(f.ticker);
  // Tickers get a numeric suffix sometimes so repeats do not look like duplicates.
  const ticker = rng.chance(0.2) ? `${f.ticker}${rng.int(2, 9)}` : f.ticker;
  return {
    ticker,
    name: f.name,
    art: { hue: Math.floor(rng.range(0, 360)), glyph: f.glyph },
    config: randomConfig(rng),
    role,
    profile: noiseProfile(rng),
    ttlMs: rng.range(6000, 35000),
  };
}

const TICKER_SUFFIXES = ["INU", "COIN", "2", "AI", "X"];

/** A look-alike that gets exactly one thing wrong. */
export function makeDecoy(rng: Rng, meme: Meme, right: CoinConfig, flaw: Flaw, nth: number): CoinSpec {
  let ticker = meme.tickers[0];
  const config: CoinConfig = { ...right };
  switch (flaw) {
    case "ticker":
      ticker =
        meme.tickers[1 + nth] ??
        `${meme.tickers[0]}${TICKER_SUFFIXES[nth % TICKER_SUFFIXES.length]}`;
      break;
    case "launchpad":
      config.launchpad = "bonk";
      break;
    case "dividends":
      config.dividends = false;
      break;
    case "pair": {
      const wrong = PAIRS.filter((p) => p !== right.pair);
      config.pair = rng.pick(wrong);
      break;
    }
  }
  return {
    ticker,
    name: meme.name,
    art: meme.art,
    config,
    role: "decoy",
    flaw,
    profile: rng.chance(0.6) ? "bleed" : rng.chance(0.5) ? "flat" : "runLite",
    ttlMs: rng.range(15000, 40000),
  };
}

/** Ordinary chatter. Authority accounts post here too, but never name a meme. */
export function makeNoiseTweet(rng: Rng): { author: Author; segments: TweetSeg[] } {
  if (rng.chance(0.22)) {
    const key = rng.pick(Object.keys(AUTHORITIES));
    return { author: AUTHORITIES[key], segments: highlightPhrases([{ text: rng.pick(AUTHORITY_TWEETS[key]) }], KEYWORDS) };
  }
  return { author: rng.pick(NOISE_AUTHORS), segments: highlightPhrases([{ text: rng.pick(NOISE_TWEETS) }], KEYWORDS) };
}

export function makeDistractor(rng: Rng, atMs: number): DistractorPlan {
  const nm = rng.pick(NOISE_MEMES);
  const author = rng.pick(NOISE_AUTHORS);
  const art: ArtSpec = { hue: nm.hue, glyph: nm.glyph };
  const count = rng.int(3, 5);
  const spawns: TimedSpawn[] = [];
  for (let i = 0; i < count; i++) {
    spawns.push({
      at: atMs + 200 + i * rng.range(150, 500),
      spec: {
        ticker: i === 0 ? nm.ticker : `${nm.ticker}${rng.pick(["", "2", "INU", "X"])}`,
        name: nm.name,
        art,
        config: randomConfig(rng),
        role: "noise",
        profile: noiseProfile(rng),
        ttlMs: rng.range(8000, 30000),
      },
    });
  }
  return {
    at: atMs,
    author,
    segments: splitTemplate(rng.pick(nm.tweets), nm.name),
    art,
    spawns,
  };
}

export function makeRound(rng: Rng, meme: Meme, diff: Difficulty): RoundPlan {
  const author = AUTHORITIES[meme.author];
  const rightPair = rightPairFor(meme.author, meme.tag);
  const rightConfig: CoinConfig = { launchpad: "pump", dividends: true, pair: rightPair };

  const total = rng.int(diff.deploys[0], diff.deploys[1]);
  const flaws: Flaw[] = ["launchpad", "dividends", "pair"];
  if (meme.tickers.length > 1) flaws.push("ticker");

  // Aim for roughly 40% look-alikes, never fewer than one of each flaw type.
  const lookAlikes = Math.max(flaws.length, Math.round(total * 0.4));
  const nthByFlaw: Record<Flaw, number> = { ticker: 0, launchpad: 0, dividends: 0, pair: 0 };
  const specs: CoinSpec[] = [];
  for (let i = 0; i < lookAlikes && specs.length < total - 1; i++) {
    const flaw = i < flaws.length ? flaws[i] : rng.pick(flaws);
    specs.push(makeDecoy(rng, meme, rightConfig, flaw, nthByFlaw[flaw]++));
  }
  const used = new Set<string>();
  while (specs.length < total - 1) specs.push(makeFillerCoin(rng, "noise", used));

  const target: CoinSpec = {
    ticker: meme.tickers[0],
    name: meme.name,
    art: meme.art,
    config: rightConfig,
    role: "target",
    profile: "run",
    ttlMs: null,
  };

  const all = [...specs, target];
  const targetAt = rng.range(0.15, 0.7) * diff.floodMs;
  const spawns: TimedSpawn[] = all.map((spec) => ({
    at: spec === target ? targetAt : rng.range(0, diff.floodMs),
    spec,
  }));
  spawns.sort((a, b) => a.at - b.at);
  const targetIndex = spawns.findIndex((s) => s.spec === target);

  const nDistractors = rng.int(diff.distractors[0], diff.distractors[1]);
  const distractors: DistractorPlan[] = [];
  for (let i = 0; i < nDistractors; i++) {
    distractors.push(makeDistractor(rng, rng.range(300, diff.floodMs)));
  }

  return {
    meme,
    author,
    segments: highlightPhrases(splitTemplate(rng.pick(meme.tweets), meme.name), meme.highlight ?? []),
    rightPair,
    rightConfig,
    spawns,
    targetIndex,
    athMcUsd: meme.ath ? rng.range(meme.ath[0], meme.ath[1]) : undefined,
    snipers: rng.int(diff.snipers[0], diff.snipers[1]),
    sniperReactMs: diff.sniperReactMs,
    distractors,
  };
}

const FILLER_TWEETS = [
  "just deployed {name}. fair launch, no presale, no promises",
  "{name} is live. dev is based, chart will do the talking",
  "who's aping {name}? contract in bio",
  "{name} on pump. first 100 holders get remembered",
  "new meta: {name}. you saw it here first",
  "{name} will make sense in 3 days. 3 days too late",
];

/** A throwaway deployer tweet for coins that are not part of a round, or null (no socials). Uses its own generator. */
export function fillerSource(rng: Rng, name: string): TweetSource | null {
  if (rng.chance(0.3)) return null;
  const author = rng.pick(NOISE_AUTHORS);
  return { author, segments: splitTemplate(rng.pick(FILLER_TWEETS), name) };
}
