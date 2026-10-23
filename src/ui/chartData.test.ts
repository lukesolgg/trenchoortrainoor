import { describe, expect, it } from "vitest";
import type { Candle } from "@/engine/types";
import { aggregate, fmtPrice, tailFrom } from "./chartData";

const mk = (t: number, o: number, c: number, v = 1): Candle => ({ t, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v });

describe("aggregate", () => {
  const src = [mk(0, 10, 11), mk(1, 11, 9), mk(2, 9, 12), mk(5, 12, 13), mk(6, 13, 8)];
  it("returns 1s candles untouched", () => {
    expect(aggregate(src, 1)).toBe(src);
  });
  it("merges into buckets with correct OHLC and volume", () => {
    const out = aggregate(src, 5);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ t: 0, o: 10, c: 12, v: 3 });
    expect(out[0].h).toBe(12.5);
    expect(out[0].l).toBe(8.5);
    expect(out[1]).toMatchObject({ t: 5, o: 12, c: 8, v: 2 });
  });
  it("does not mutate its input", () => {
    aggregate(src, 5);
    expect(src[0].h).toBe(11.5);
    expect(src[0].v).toBe(1);
  });
  it("tailFrom starts at the bucket containing fromT", () => {
    expect(tailFrom(src, 6, 5).map((c) => c.t)).toEqual([5, 6]);
    expect(tailFrom(src, 1, 5).map((c) => c.t)).toEqual([0, 1, 2, 5, 6]);
  });
});

describe("fmtPrice", () => {
  it("collapses leading zeros into a subscript", () => {
    expect(fmtPrice(0.0000034)).toBe("0.0₅34");
    expect(fmtPrice(0.00000001234)).toBe("0.0₇1234");
  });
  it("uses plain decimals for larger prices", () => {
    expect(fmtPrice(2.5)).toBe("2.50");
    expect(fmtPrice(0.0123)).toBe("0.0123");
    expect(fmtPrice(0.0034)).toBe("0.0034");
  });
  it("handles zero and junk", () => {
    expect(fmtPrice(0)).toBe("0");
    expect(fmtPrice(NaN)).toBe("0");
  });
});
