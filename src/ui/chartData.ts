import type { Candle } from "@/engine/types";

/** Group 1 s candles into `bucket`-second candles. Input must be time-ordered. */
export function aggregate(candles: readonly Candle[], bucket: number): Candle[] {
  if (bucket <= 1) return candles as Candle[];
  const out: Candle[] = [];
  for (const c of candles) {
    const t = Math.floor(c.t / bucket) * bucket;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
      last.v += c.v;
    } else {
      out.push({ t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
    }
  }
  return out;
}

/** The 1 s candles that can still change a bucket starting at or after `fromT`. */
export function tailFrom(candles: readonly Candle[], fromT: number, bucket: number): readonly Candle[] {
  const start = Math.floor(fromT / bucket) * bucket;
  let i = candles.length;
  while (i > 0 && candles[i - 1].t >= start) i--;
  return candles.slice(i);
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)]);

/** Token price with the GMGN-style collapsed zeros: 0.0000034 -> 0.0₅34. */
export function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  const zeros = Math.ceil(-Math.log10(p)) - 1;
  const digits = Math.round(p * 10 ** (zeros + 4)).toString().replace(/0+$/, "") || "0";
  if (zeros < 3) return `0.${"0".repeat(zeros)}${digits.padEnd(2, "0")}`;
  return `0.0${subscript(zeros)}${digits}`;
}
