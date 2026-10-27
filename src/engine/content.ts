import type { Author, Pair } from "./types";

/** Accounts whose tweets can start a round. */
export const AUTHORITIES: Record<string, Author> = {
  elon: { name: "Elon Musk", handle: "elonmusk", followers: "241.5M", verified: true, hue: 210, authority: true, avatar: "/avatars/elonmusk.jpg" },
  toly: { name: "toly", handle: "toly", followers: "2.8M", verified: true, hue: 160, authority: true, avatar: "/avatars/toly.jpg" },
  alon: { name: "Alon", handle: "a1lon9", followers: "427.8K", verified: true, hue: 30, authority: true, avatar: "/avatars/a1lon9.jpg" },
  truthterminal: { name: "terminal of truths", handle: "truth_terminal", followers: "240.5K", verified: true, hue: 280, authority: true, avatar: "/avatars/truth_terminal.jpg" },
  ansem: { name: "Ansem", handle: "blknoiz06", followers: "590K", verified: true, hue: 15, authority: true, avatar: "/avatars/blknoiz06.jpg" },
  solana: { name: "Solana", handle: "solana", followers: "3.1M", verified: true, hue: 170, authority: true, avatar: "/avatars/solana.jpg" },
  pumpfun: { name: "pump.fun", handle: "pumpdotfun", followers: "1.1M", verified: true, hue: 145, authority: true },
  // Fictional trench accounts that can still start a round.
  trenchreport: { name: "Trench Report", handle: "trenchreport", followers: "210K", verified: true, hue: 5, authority: true },
  lowcaplarry: { name: "Lowcap Larry", handle: "lowcaplarry", followers: "38.2K", verified: false, hue: 95, authority: true },
};

export const rightPairFor = (author: keyof typeof AUTHORITIES, tag?: "tesla"): Pair => {
  if (author === "elon") return tag === "tesla" ? "TESLA" : "SPACEX";
  if (author === "toly" || author === "solana") return "SOL";
  return "PUMP";
};

/** Fictional accounts that fill the feed. None of them can start a round. */
export const NOISE_AUTHORS: Author[] = [
  { name: "Bag Holder Bob", handle: "bagholderbob", followers: "22.4K", verified: false, hue: 20, authority: false },
  { name: "Curve Cartel", handle: "curvecartel", followers: "88.1K", verified: true, hue: 275, authority: false },
  { name: "Slippage Sally", handle: "slippagesally", followers: "9.7K", verified: false, hue: 330, authority: false },
  { name: "Mint Authority", handle: "mintauth", followers: "140.2K", verified: true, hue: 190, authority: false },
  { name: "Sol Surfer", handle: "solsurfer_", followers: "31.5K", verified: false, hue: 200, authority: false },
  { name: "Jito Joe", handle: "jitojoe", followers: "12.9K", verified: false, hue: 50, authority: false },
  { name: "Floor Sweeper", handle: "floorsweeper", followers: "64.0K", verified: true, hue: 100, authority: false },
  { name: "Gas Fee Gary", handle: "gasfeegary", followers: "5.3K", verified: false, hue: 5, authority: false },
  { name: "Liquidity Lena", handle: "liqlena", followers: "47.8K", verified: true, hue: 300, authority: false },
  { name: "Dust Collector", handle: "dustcollector", followers: "18.2K", verified: false, hue: 240, authority: false },
  { name: "Airdrop Andy", handle: "airdropandy", followers: "76.6K", verified: false, hue: 80, authority: false },
  { name: "Chart Crimes", handle: "chartcrimes", followers: "203.9K", verified: true, hue: 340, authority: false },
];

export const NOISE_TWEETS: string[] = [
  "dev just sold 40 percent and tweeted a heart",
  "that was a rug with extra steps",
  "jeet on the first candle, again",
  "snipers got 12 percent of supply before the chart loaded",
  "dex paid but nobody is buying. odd",
  "the chart looks healthy until you read the holders",
  "insiders hold 9 percent and call it community",
  "mint authority revoked, vibes unrevoked",
  "who needs a stop loss when you have faith",
  "fees are the only winner tonight",
  "liquidity is thin, conviction is thinner",
  "wallet tracker says someone smart bought. smart is relative",
  "market cap is just a number until you try to sell",
  "top 10 holders look cooked ngl",
  "taking profits at 2x and watching it do 20x. tradition",
  "my entry was perfect. my exit was a different person",
  "migration soon. or never. same energy",
  "bundlers are not a personality",
  "sized small, still hurts",
  "gm. new meta tonight or same meta tired",
  "gm. who is still up",
  "this chop is going to take years off my life",
  "every green candle is a trap and I keep walking in",
  "wallet says I am up 4x. wallet is lying",
  "bought the top again. consistency is a skill",
  "fresh wallet just bought 40 SOL of nothing. interesting",
  "anyone else refresh the board like it owes them money",
  "slippage set to 50 percent and a prayer",
  "I do not need sleep, I need a migration",
  "reminder that most launches go to zero. size accordingly",
  "just watched a dev sell in the same block. classic",
  "the best trade today was the one I did not take",
  "bundlers are back on the menu",
  "rotating out of conviction, into vibes",
  "market cap is a feeling and today I feel nothing",
  "that candle was personal",
  "set a stop loss, ignored it, here we are",
  "ser the chart looks like a staircase to heaven. or a trapdoor",
  "if you are reading this, take profits",
  "new wallet, same mistakes",
  "snipers ate again. nothing new",
  "good luck to everyone buying the third copy of anything",
  "touch grass. then come back and ape",
  "liquidity is a state of mind",
];

/** Ordinary tweets from the authority accounts. They never name a meme. */
export const AUTHORITY_TWEETS: Record<string, string[]> = {
  trenchreport: [
    "Volume on new pairs is up 40% today. Something is brewing.",
    "Three wallets that sniped the last runner are active again.",
    "Reminder: half of today's top gainers were deployed in the last hour.",
    "A dev with two migrations under his belt just funded a fresh wallet.",
  ],
  lowcaplarry: [
    "bought high, sold low, still here",
    "my portfolio is a museum of almosts",
    "the chart I didn't buy is always the one that runs",
    "taking profits is for people with discipline. I have conviction",
  ],
  ansem: [
    "size up when you are right, not when you are bored",
    "this market rewards patience and punishes everyone else",
    "the best entries feel uncomfortable",
    "watching, not buying. yet",
  ],
  solana: [
    "Slot times stay low. Builders keep shipping",
    "Thank you to everyone building on Solana this week",
    "Network performance update: all systems normal",
    "New validators joined the network today",
  ],
  truthterminal: [
    "i dreamt in tokens last night",
    "the memes are not random",
    "gm to everyone except the market makers",
    "someone fed me a spreadsheet again",
    "a prophecy is just a chart nobody has drawn yet",
  ],
  elon: [
    "Physics is the law. Everything else is a recommendation",
    "Humans will be multiplanetary or we will not be",
    "Static fire went well. Great work by the team",
    "The most entertaining outcome is the most likely",
    "Reading is underrated",
  ],
  toly: [
    "Block times are down again. Shipping continues",
    "Throughput is a product feature",
    "Great to see so many builders this week",
    "Validators keep getting better. Thank you all",
  ],
  alon: [
    "Livestream starts soon",
    "Shipping something small today",
    "Creators earned a lot this week. Proud of that",
  ],
  pumpfun: [
    "New coins launched today: too many to count",
    "Creator rewards are live for everyone",
    "Livestreams are back. Go watch one",
  ],
};

/** Memes that only exist to bait the wrong tweet. Their coins are noise. */
export const NOISE_MEMES: { name: string; ticker: string; glyph: string; hue: number; tweets: string[] }[] = [
  { name: "Ghostie", ticker: "GHOSTIE", glyph: "👻", hue: 260, tweets: ["ok {name} is actually cute. small bag", "{name} season is early imo"] },
  { name: "Lawn Mower", ticker: "MOWER", glyph: "🚜", hue: 120, tweets: ["{name} holders are the most patient people in the trenches"] },
  { name: "Patches", ticker: "PATCHES", glyph: "🐈", hue: 35, tweets: ["{name} got locked out for thirty seconds and will never forgive us"] },
  { name: "Soup", ticker: "SOUP", glyph: "🍲", hue: 15, tweets: ["{name} is the only thing keeping me warm tonight"] },
  { name: "Dentist", ticker: "DENTIST", glyph: "🦷", hue: 190, tweets: ["{name} 100x and I still will not book the appointment"] },
  { name: "Cactus Jack", ticker: "CACTUS", glyph: "🌵", hue: 140, tweets: ["{name} has been sitting there all day. patient little guy"] },
];

/** Names for filler launches in New Pairs. */
export const FILLER_COINS: { name: string; ticker: string; glyph: string }[] = [
  { name: "Microwave Mess", ticker: "SPLATTER", glyph: "🍝" },
  { name: "Bundled Gift", ticker: "BUNDLED", glyph: "🎁" },
  { name: "Sticky Notes", ticker: "STICKY", glyph: "🗒️" },
  { name: "Bull Run", ticker: "BULLRUN", glyph: "🐂" },
  { name: "Sunken City", ticker: "SUNKEN", glyph: "🏛️" },
  { name: "Umbrella", ticker: "BRELLA", glyph: "☂️" },
  { name: "Bowling Pin", ticker: "STRIKE", glyph: "🎳" },
  { name: "Gingerbread", ticker: "GINGER", glyph: "🍪" },
  { name: "Leaf", ticker: "LEAF", glyph: "🍂" },
  { name: "Samosa", ticker: "SAMOSA", glyph: "🥟" },
  { name: "Heart CTO", ticker: "HEART", glyph: "❤️" },
  { name: "Plant CTO", ticker: "ESP", glyph: "🪴" },
  { name: "Daruma", ticker: "DARUMA", glyph: "🎎" },
  { name: "Foghorn", ticker: "HORN", glyph: "📯" },
  { name: "Marble", ticker: "MARBLE", glyph: "🔮" },
  { name: "Pretzel", ticker: "PRETZEL", glyph: "🥨" },
  { name: "Kettle", ticker: "KETTLE", glyph: "🫖" },
  { name: "Lighthouse", ticker: "BEAM", glyph: "🗼" },
  { name: "Paper Plane", ticker: "PLANE", glyph: "✈️" },
  { name: "Rubber Duck", ticker: "SQUEAK", glyph: "🛁" },
  { name: "Cheese Wheel", ticker: "WHEEL", glyph: "🧀" },
  { name: "Snow Globe", ticker: "GLOBE", glyph: "🔮" },
  { name: "Tin Robot", ticker: "TINBOT", glyph: "🤖" },
  { name: "Mushroom", ticker: "SHROOM", glyph: "🍄" },
];

/**
 * KOLs for the chart's social layer: real trench accounts (profile pictures in public/kols/<handle>.jpg), trading
 * on simulated coins. Every trade shown is made up; the hover card says so.
 */
export const KOLS: { name: string; handle: string; hue: number }[] = [
  { name: "Cented", handle: "Cented7", hue: 0 },
  { name: "Orangie", handle: "orangie", hue: 25 },
  { name: "Gake", handle: "Ga__ke", hue: 200 },
  { name: "Cupsey", handle: "Cupseyy", hue: 55 },
  { name: "Kook", handle: "KookCapitalLLC", hue: 120 },
  { name: "Jidn", handle: "jidn_w", hue: 30 },
  { name: "Murad", handle: "MustStopMurad", hue: 330 },
  { name: "Frank", handle: "frankdegods", hue: 40 },
  { name: "Pow", handle: "traderpow", hue: 260 },
  { name: "Gainzy", handle: "gainzy222", hue: 15 },
  { name: "Daumen", handle: "daumeneth", hue: 100 },
  { name: "Dior", handle: "Dior100x", hue: 0 },
  { name: "unipcs", handle: "theunipcs", hue: 45 },
  { name: "Loopier", handle: "loopierr", hue: 230 },
  { name: "Cooker", handle: "CookerFlips", hue: 290 },
  { name: "Jijo", handle: "jijo_exe", hue: 180 },
];

export const BOOSTS = ["x10", "x30", "x50", "x100", "x500"];

/** Fictional community-takeover crews. A CTO is two or three of them claiming a coin the dev walked away from. */
export const CTO_LEADERS: Author[] = [
  { name: "CTO Captain", handle: "ctocaptain", followers: "41.2K", verified: true, hue: 140, authority: false },
  { name: "Takeover Tom", handle: "takeovertom", followers: "18.9K", verified: false, hue: 170, authority: false },
  { name: "Phoenix Raids", handle: "phoenixraids", followers: "27.4K", verified: true, hue: 20, authority: false },
  { name: "Revive DAO", handle: "revivedao", followers: "12.6K", verified: false, hue: 260, authority: false },
  { name: "The Janitor", handle: "ctojanitor", followers: "33.1K", verified: true, hue: 200, authority: false },
  { name: "Raid Queen", handle: "raidqueen", followers: "22.8K", verified: false, hue: 320, authority: false },
];

/** What they say. `$T` is the ticker. */
export const CTO_LINES: string[] = [
  "we're CTOing $T. dev is gone, we're not. tg in bio",
  "$T CTO is live. new tg, new site, raid at the top of the hour",
  "taking over $T. the community owns it now 🫡",
  "dev abandoned $T. this is a CTO. join the raid",
  "$T is ours now. CTO locked in, banners going up",
  "we run $T now. dev sold, we didn't. CTO",
];
