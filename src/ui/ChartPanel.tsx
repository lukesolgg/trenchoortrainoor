"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  PriceScaleMode,
  type AutoscaleInfo,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesPrimitive,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { MIGRATION_MC_USD, SOL_USD, SUPPLY } from "@/engine/curve";
import type { Engine } from "@/engine/engine";
import type { Candle } from "@/engine/types";
import { aggregate, fmtPrice, tailFrom } from "./chartData";
import { usd } from "./format";

/**
 * Everything drawn on top of the candles at a price: your trades (B / S), the dev (D), KOLs (their initial) and
 * paid boosts (a lightning tag above the bar). Ring colour says buy (green) or sell (red).
 */
export interface Mark {
  time: Time;
  value: number;
  kind: "you" | "dev" | "kol" | "boost" | "tweet" | "dex" | "cto";
  side: "buy" | "sell" | null;
  letter: string;
  hue?: number;
  label?: string;
  /** For the hover card. */
  name?: string;
  handle?: string;
  sol?: number;
  mcUsd?: number;
  at?: number;
  usd?: number;
  hours?: number;
  pct?: number;
  all?: boolean;
  cost?: number;
  avatar?: string;
  text?: string;
  /** Your trades merged into one badge per candle: how many fills. */
  count?: number;
  /** Your trades drawn as your KOL bubble. */
  self?: { name: string; handle: string; followers: number };
}

/** Profile pictures drawn inside KOL markers, loaded once and shared by every chart. */
const avatarCache = new Map<string, HTMLImageElement>();
function avatar(src: string, onLoad: () => void): HTMLImageElement | null {
  let img = avatarCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    img.onload = onLoad;
    avatarCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
const kolSrc = (handle: string) => `/kols/${handle.toLowerCase()}.jpg`;
class ChartMarks implements ISeriesPrimitive<Time> {
  private marks: Mark[] = [];
  /** Where each mark was last drawn (CSS px), for hover. */
  drawn: { x: number; y: number; r: number; m: Mark }[] = [];
  private chart: IChartApi | null = null;
  private series: ISeriesApi<"Candlestick"> | null = null;
  private request: (() => void) | null = null;

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<"Candlestick">;
    this.request = p.requestUpdate;
  }
  detached() {
    this.chart = this.series = this.request = null;
  }
  setMarks(m: Mark[]) {
    this.marks = m;
    this.request?.();
  }
  /** The mark under a point in the pane, if any (last drawn wins). */
  hit(x: number, y: number): { x: number; y: number; m: Mark } | null {
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const d = this.drawn[i];
      if (Math.abs(x - d.x) <= d.r && Math.abs(y - d.y) <= d.r) return d;
    }
    return null;
  }
  updateAllViews() {}
  paneViews() {
    const self = this;
    return [
      {
        zOrder: () => "top" as const,
        renderer: () => ({
          draw(target: {
            useBitmapCoordinateSpace: (
              cb: (s: { context: CanvasRenderingContext2D; horizontalPixelRatio: number; verticalPixelRatio: number }) => void,
            ) => void;
          }) {
            const { chart, series, marks } = self;
            if (!chart || !series || marks.length === 0) return;
            target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
              const taken = new Map<number, number[]>();
              const perBoost = new Map<number, number>();
              // Vertical slot for a mark in its candle: at its price, or the nearest free spot above (buys) or
              // below (sells) so nothing in the same candle covers anything else.
              const slot = (x0: number, side: "buy" | "sell" | null, y0: number) => {
                const used = taken.get(x0) ?? [];
                const dir = side === "sell" ? 1 : -1;
                let y = y0;
                for (let k = 0; k < 12 && used.some((u) => Math.abs(u - y) < 19); k++) y += dir * 20;
                used.push(y);
                taken.set(x0, used);
                return y;
              };
              self.drawn = [];
              ctx.save();
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              for (const m of marks) {
                const x0 = chart.timeScale().timeToCoordinate(m.time);
                const y0 = series.priceToCoordinate(m.value);
                if (x0 === null || y0 === null) continue;
                if (m.kind === "boost" || m.kind === "dex" || m.kind === "cto") {
                  // Tags floating above the bar: rocket boosts, DEX paid, CTO.
                  ctx.font = `800 ${Math.round(10 * vr)}px Inter, ui-sans-serif, system-ui, sans-serif`;
                  const text = m.kind === "boost" ? (m.label ?? "") : m.kind === "dex" ? "DEX PAID" : "CTO";
                  const icon = m.kind === "boost" ? 9 * hr : 0;
                  const w = ctx.measureText(text).width + icon + 14 * hr;
                  const h = 16 * vr;
                  const stack = perBoost.get(x0) ?? 0;
                  perBoost.set(x0, stack + 1);
                  const x = x0 * hr;
                  const y = (y0 - 26 - stack * 20) * vr;
                  ctx.fillStyle = m.kind === "boost" ? "#f5c542" : m.kind === "dex" ? "#4db8ff" : "#35d07f";
                  ctx.beginPath();
                  ctx.roundRect(x - w / 2, y - h / 2, w, h, 4 * hr);
                  ctx.fill();
                  if (stack === 0) {
                    ctx.beginPath();
                    ctx.moveTo(x - 4 * hr, y + h / 2);
                    ctx.lineTo(x + 4 * hr, y + h / 2);
                    ctx.lineTo(x, y + h / 2 + 5 * vr);
                    ctx.fill();
                  }
                  const ink = "#0d1200";
                  let tx = x - w / 2 + 7 * hr;
                  if (m.kind === "boost") {
                    // Rocket: nose cone, body, fins and a flame, drawn at an angle.
                    ctx.save();
                    ctx.translate(tx + 3.5 * hr, y);
                    ctx.rotate(Math.PI / 4);
                    ctx.fillStyle = ink;
                    ctx.beginPath();
                    ctx.moveTo(0, -6 * vr);
                    ctx.quadraticCurveTo(3 * hr, -3 * vr, 2.4 * hr, 3 * vr);
                    ctx.lineTo(-2.4 * hr, 3 * vr);
                    ctx.quadraticCurveTo(-3 * hr, -3 * vr, 0, -6 * vr);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(-2.4 * hr, 1 * vr);
                    ctx.lineTo(-4.2 * hr, 4.5 * vr);
                    ctx.lineTo(-2.2 * hr, 3.4 * vr);
                    ctx.moveTo(2.4 * hr, 1 * vr);
                    ctx.lineTo(4.2 * hr, 4.5 * vr);
                    ctx.lineTo(2.2 * hr, 3.4 * vr);
                    ctx.fill();
                    ctx.fillStyle = "#e5482a";
                    ctx.beginPath();
                    ctx.moveTo(-1.4 * hr, 3.4 * vr);
                    ctx.lineTo(0, 6.5 * vr);
                    ctx.lineTo(1.4 * hr, 3.4 * vr);
                    ctx.fill();
                    ctx.fillStyle = "#f5c542";
                    ctx.beginPath();
                    ctx.arc(0, -1.5 * vr, 1.1 * hr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    tx += icon;
                  }
                  ctx.fillStyle = ink;
                  ctx.textAlign = "left";
                  ctx.fillText(text, tx + (m.kind === "boost" ? 2 * hr : 0), y + 0.5 * vr);
                  ctx.textAlign = "center";
                  self.drawn.push({ x: x0, y: y0 - 26 - stack * 20, r: Math.max(12, w / hr / 2), m });
                  continue;
                }
                if (m.kind === "dev") {
                  // The dev is a square tag, never confused with a KOL's round avatar.
                  const yc = slot(x0, m.side, y0);
                  const x = x0 * hr;
                  const y = yc * vr;
                  const buy = m.side === "buy";
                  const label = m.all ? "DEV SOLD ALL" : "DEV";
                  ctx.font = `900 ${Math.round(8.5 * vr)}px Inter, ui-sans-serif, system-ui, sans-serif`;
                  const w = ctx.measureText(label).width + 10 * hr;
                  const h = 15 * vr;
                  ctx.shadowColor = buy ? "rgba(53,208,127,.55)" : "rgba(240,69,90,.55)";
                  ctx.shadowBlur = 8 * hr;
                  ctx.fillStyle = m.all ? "#f0455a" : "#f5c542";
                  ctx.beginPath();
                  ctx.roundRect(x - w / 2, y - h / 2, w, h, 3 * hr);
                  ctx.fill();
                  ctx.shadowBlur = 0;
                  ctx.lineWidth = 2 * hr;
                  ctx.strokeStyle = buy ? "#35d07f" : "#f0455a";
                  ctx.stroke();
                  ctx.fillStyle = m.all ? "#fff" : "#111";
                  ctx.fillText(label, x, y + 0.5 * vr);
                  self.drawn.push({ x: x0, y: yc, r: Math.max(14, w / hr / 2), m });
                  continue;
                }
                // Always centred on the candle they traded in; several in one candle stack up (buys) or down (sells).
                const yc = slot(x0, m.side, y0);
                const x = x0 * hr;
                const y = yc * vr;
                const r = (m.kind === "you" && !m.self ? 7.5 : m.self ? 10.5 : 9.5) * hr;
                const buy = m.side === "buy";
                const ring = buy ? "#35d07f" : "#f0455a";
                const fill = m.self ? "#f5c542" : m.kind === "you" ? ring : `hsl(${m.hue ?? 200} 55% 42%)`;
                ctx.shadowColor = m.kind === "tweet" ? "rgba(29,155,240,.6)" : buy ? "rgba(53,208,127,.55)" : "rgba(240,69,90,.55)";
                ctx.shadowBlur = 8 * hr;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.shadowBlur = 0;
                const picSrc = m.kind === "kol" && m.handle ? kolSrc(m.handle) : m.kind === "tweet" ? (m.avatar ?? null) : null;
                const pic = picSrc ? avatar(picSrc, () => self.request?.()) : null;
                if (pic) {
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(x, y, r, 0, Math.PI * 2);
                  ctx.clip();
                  ctx.drawImage(pic, x - r, y - r, r * 2, r * 2);
                  ctx.restore();
                }
                ctx.lineWidth = (m.kind === "you" && !m.self ? 1.5 : 2) * hr;
                ctx.strokeStyle = m.self ? ring : m.kind === "you" ? "#0e0f12" : m.kind === "tweet" ? "#1d9bf0" : ring;
                ctx.stroke();
                ctx.font = `800 ${Math.round(m.letter.length > 1 ? 7.5 : 9) * vr}px Inter, ui-sans-serif, system-ui, sans-serif`;
                if (!pic) {
                  ctx.fillStyle = m.self || (m.kind === "you" && buy) ? "#111" : "#fff";
                  ctx.fillText(m.letter, x, y + 0.5 * vr);
                }
                if (m.count && m.count > 1) {
                  // Merged fills: a small count bubble on the badge.
                  const bx = x + r * 0.85;
                  const by = y - r * 0.85;
                  ctx.font = `800 ${Math.round(7 * vr)}px Inter, ui-sans-serif, system-ui, sans-serif`;
                  ctx.beginPath();
                  ctx.arc(bx, by, 5.5 * hr, 0, Math.PI * 2);
                  ctx.fillStyle = "#0e0f12";
                  ctx.fill();
                  ctx.fillStyle = "#fff";
                  ctx.fillText(String(m.count), bx, by + 0.5 * vr);
                }
                self.drawn.push({ x: x0, y: yc, r: r / hr + 2, m });
              }
              ctx.restore();
            });
          },
        }),
      },
    ];
  }
}

/** A fill popping over the chart. */
interface Pop {
  id: number;
  x: number;
  y: number;
  side: "buy" | "sell";
  sol: number;
  /** Sells: share of what you held, and SOL made over that slice's cost. */
  pct: number;
  profit: number;
  at: number;
  /** Market cap (SOL) it filled at. */
  mc: number;
  /** performance.now() when it (last) popped. */
  born: number;
}
let popSeq = 1;

/** Walk your fills in order to work out each sell's share of the bag and its profit over average cost. */
function tradePops(trades: readonly { side: "buy" | "sell"; sol: number; tokens: number; execAt: number }[]) {
  let held = 0;
  let cost = 0;
  return trades.map((t) => {
    const mc = t.tokens > 0 ? (t.sol / t.tokens) * SUPPLY : 0;
    if (t.side === "buy") {
      held += t.tokens;
      cost += t.sol;
      return { side: "buy" as const, sol: t.sol, pct: 0, profit: 0, at: t.execAt, mc };
    }
    const frac = held > 0 ? Math.min(1, t.tokens / held) : 1;
    const basis = cost * frac;
    held -= t.tokens;
    cost -= basis;
    const pct = frac > 0.995 ? 100 : Math.max(1, Math.round(frac * 100));
    return { side: "sell" as const, sol: t.sol, pct, profit: t.sol - basis, at: t.execAt, mc };
  });
}

export type Metric = "mc" | "price";
export type Unit = "usd" | "sol";
export type ScaleMode = "auto" | "log" | "pct";

export interface ChartHandle {
  firstCandle: () => void;
  fit: () => void;
  live: () => void;
  screenshot: () => void;
  fullscreen: () => void;
}

interface Props {
  ref?: Ref<ChartHandle>;
  engine: Engine;
  coinId: string;
  /** Snapshot version. Changes whenever the engine has new data. */
  version: number;
  /** Seconds added to engine time so the axis shows wall-clock time. */
  timeOffset: number;
  /** Candle width in seconds. */
  tf: number;
  metric: Metric;
  unit: Unit;
  scale: ScaleMode;
  entryMcUsd: number | null;
  earlyAvgMcUsd: number;
  ticker: string;
  /** Social layers on the chart. */
  show: { dev: boolean; kol: boolean; boost: boolean; news: boolean };
  /** You as a KOL (Rising tier and up): your trades draw as your own bubble. */
  youKol?: { name: string; handle: string; followers: number } | null;
}

const UP = "#35d07f";
const DOWN = "#f0455a";
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour12: false });

/** Engine candles hold market cap in SOL. Multiply by this to get the chosen metric/unit. */
const factorFor = (metric: Metric, unit: Unit) => (unit === "usd" ? SOL_USD : 1) / (metric === "price" ? SUPPLY : 1);

export function formatValue(v: number, metric: Metric, unit: Unit): string {
  // The area under the candles is the volume overlay: never label negative prices there.
  if (v < 0) return "";
  if (metric === "mc") return unit === "usd" ? usd(v) : `◎${v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)}`;
  return unit === "usd" ? `$${fmtPrice(v)}` : `◎${fmtPrice(v)}`;
}

interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Candles with a volume strip, your fills, and reference lines (ATH, early buyers' average, your entry).
 * Live data goes through series.update so panning and zoom survive ticks.
 * Mount with key={coinId}: a new coin is a new chart.
 */
export function ChartPanel({ ref, engine, coinId, version, timeOffset, tf, metric, unit, scale, entryMcUsd, earlyAvgMcUsd, ticker, show, youKol = null }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const dotsRef = useRef<ChartMarks | null>(null);
  const lines = useRef<{ ath?: IPriceLine; early?: IPriceLine; entry?: IPriceLine; mig?: IPriceLine }>({});
  const lastT = useRef<number | null>(null);
  const dataKey = useRef("");
  const markerCount = useRef(-1);
  const lastBar = useRef<Bar | null>(null);
  const [hover, setHover] = useState<Bar | null>(null);
  const [markHover, setMarkHover] = useState<{ x: number; y: number; m: Mark } | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  /** How many of your trades on this coin have already popped (null until the chart has seen the history). */
  const popped = useRef<number | null>(null);

  const factor = factorFor(metric, unit);

  useImperativeHandle(ref, () => ({
    firstCandle: () => chartRef.current?.timeScale().scrollToPosition(-1e6, false),
    fit: () => chartRef.current?.timeScale().fitContent(),
    live: () => chartRef.current?.timeScale().scrollToRealTime(),
    screenshot: () => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.takeScreenshot().toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${ticker}-chart.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    },
    fullscreen: () => {
      const el = wrap.current;
      if (!el) return;
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.();
    },
  }));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0e0f12" },
        textColor: "#8b9099",
        fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace",
        fontSize: 11,
      },
      // Vertical grid lines off: at 1 s bars they are a dense comb. Faint horizontals only.
      grid: { vertLines: { visible: false }, horzLines: { color: "#16181c" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1d1f24", scaleMargins: { top: 0.06, bottom: 0.2 } },
      timeScale: {
        borderColor: "#1d1f24",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 6,
        tickMarkFormatter: (t: Time) => clock(t as number),
      },
      localization: { timeFormatter: (t: Time) => clock(t as number) },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      // Values can never go below zero, so never let the axis show negatives.
      autoscaleInfoProvider: (orig: () => AutoscaleInfo | null) => {
        const r = orig();
        if (!r || !r.priceRange) return r;
        const span = r.priceRange.maxValue - r.priceRange.minValue;
        return {
          priceRange: {
            minValue: Math.max(0, r.priceRange.minValue - span * 0.1),
            maxValue: r.priceRange.maxValue + span * 0.05,
          },
        };
      },
    });
    // Volume is an overlay along the bottom of the price pane, on its own hidden scale.
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(candle) as { open: number; high: number; low: number; close: number } | undefined;
      const v = p.seriesData.get(vol) as { value: number } | undefined;
      setHover(d ? { o: d.open, h: d.high, l: d.low, c: d.close, v: v?.value ?? 0 } : null);
      const hit = p.point ? dotsRef.current?.hit(p.point.x, p.point.y) : null;
      setMarkHover(hit ? { x: hit.x, y: hit.y, m: hit.m } : null);
    });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    dotsRef.current = new ChartMarks();
    if (new URLSearchParams(location.search).has("debug")) (window as unknown as { __marks?: ChartMarks }).__marks = dotsRef.current;
    candle.attachPrimitive(dotsRef.current);
    return () => {
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = dotsRef.current = null;
      lines.current = {};
      lastT.current = null;
      dataKey.current = "";
      markerCount.current = -1;
    };
  }, []);

  // Axis formatting and scale mode follow the toolbar.
  useEffect(() => {
    const candle = candleRef.current;
    const chart = chartRef.current;
    if (!candle || !chart) return;
    candle.applyOptions({
      priceFormat: {
        type: "custom",
        formatter: (p: number) => formatValue(p, metric, unit),
        minMove: metric === "price" ? (unit === "usd" ? 1e-12 : 1e-14) : unit === "usd" ? 1 : 0.01,
      },
    });
    chart.priceScale("right").applyOptions({
      mode: scale === "log" ? PriceScaleMode.Logarithmic : scale === "pct" ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      autoScale: true,
    });
  }, [metric, unit, scale]);

  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    const chart = chartRef.current;
    if (!candle || !vol || !chart) return;
    const raw = engine.getCandles(coinId);
    if (raw.length === 0) return;

    const bar = (c: Candle) => ({
      time: (c.t + timeOffset) as UTCTimestamp,
      open: c.o * factor,
      high: c.h * factor,
      low: c.l * factor,
      close: c.c * factor,
    });
    // Volume is always shown in the same currency as the axis, in whole units.
    const volume = (c: Candle) => ({
      time: (c.t + timeOffset) as UTCTimestamp,
      value: c.v * (unit === "usd" ? SOL_USD : 1),
      color: c.c >= c.o ? "rgba(53,208,127,.35)" : "rgba(240,69,90,.35)",
    });

    const key = `${tf}|${metric}|${unit}`;
    const lastRaw = raw[raw.length - 1];
    let last: Candle;
    if (dataKey.current !== key || lastT.current === null || lastT.current > lastRaw.t) {
      const agg = aggregate(raw, tf);
      candle.setData(agg.map(bar));
      vol.setData(agg.map(volume));
      const n = agg.length;
      // Open at a comfortable zoom: never tighter than ~60 bars across, never wider than 150.
      const bars = Math.min(150, Math.max(60, Math.round(n * 1.15)));
      chart.timeScale().setVisibleLogicalRange({ from: n - bars, to: n + 8 });
      dataKey.current = key;
      last = agg[agg.length - 1];
    } else {
      const agg = aggregate(tailFrom(raw, lastT.current, tf), tf);
      for (const c of agg) {
        candle.update(bar(c));
        vol.update(volume(c));
      }
      last = agg[agg.length - 1];
    }
    lastT.current = lastRaw.t;
    lastBar.current = { o: last.o * factor, h: last.h * factor, l: last.l * factor, c: last.c * factor, v: last.v * (unit === "usd" ? SOL_USD : 1) };

    // Reference lines. ATH comes from the raw history so it does not depend on the timeframe.
    let ath = 0;
    for (const c of raw) if (c.h > ath) ath = c.h;
    const upsert = (k: "ath" | "early" | "entry" | "mig", price: number | null, color: string, title: string, style: number) => {
      const cur = lines.current[k];
      if (price === null || !(price > 0)) {
        if (cur) candle.removePriceLine(cur);
        delete lines.current[k];
      } else if (cur) {
        cur.applyOptions({ price });
      } else {
        lines.current[k] = candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
      }
    };
    upsert("ath", ath * factor, "#8b9099", "ATH", 2);
    upsert("early", (earlyAvgMcUsd / SOL_USD) * factor, "#f5c542", "Top 10 avg buy", 1);
    upsert("mig", (MIGRATION_MC_USD / SOL_USD) * factor, "#f5c542", `Migration ${usd(MIGRATION_MC_USD)}`, 1);
    upsert("entry", entryMcUsd ? (entryMcUsd / SOL_USD) * factor : null, "#4db8ff", "Entry", 2);

    const trades = engine.getTradesFor(coinId);
    const socials = engine.getSocial(coinId);
    // New fills pop over the chart where they printed: SOLD 25% · +1.34 SOL.
    if (popped.current === null) popped.current = trades.length;
    else if (trades.length > popped.current) {
      const fresh = tradePops(trades).slice(popped.current);
      popped.current = trades.length;
      const chart = chartRef.current;
      const series = candleRef.current;
      const w = wrap.current?.clientWidth ?? 600;
      const h = wrap.current?.clientHeight ?? 400;
      const made: Pop[] = fresh.map((p, k) => {
        const time = (Math.floor(Math.floor(p.at / 1000) / tf) * tf + timeOffset) as UTCTimestamp;
        const x = chart?.timeScale().timeToCoordinate(time) ?? null;
        const y = series?.priceToCoordinate(p.mc * factor) ?? null;
        return {
          ...p,
          id: popSeq++,
          x: Math.min(w - 70, Math.max(70, x ?? w * 0.75)),
          y: Math.min(h - 40, Math.max(56, (y ?? h * 0.4) - 34 - k * 16)),
          born: 0,
        };
      });
      // Spammed sells roll into one pop that keeps counting (SOLD 59% · +2.19 SOL) instead of piling up.
      setPops((cur) => {
        const out = [...cur];
        const now = performance.now();
        for (const m of made) {
          const last = out[out.length - 1];
          if (last && last.side === "sell" && m.side === "sell" && now - last.born < 900) {
            const keep = (1 - last.pct / 100) * (1 - m.pct / 100);
            out[out.length - 1] = { ...m, id: popSeq++, pct: Math.min(100, Math.round((1 - keep) * 100)), sol: last.sol + m.sol, profit: last.profit + m.profit, born: now, x: last.x, y: last.y };
          } else out.push({ ...m, born: now });
        }
        return out.slice(-4);
      });
      window.setTimeout(() => setPops((cur) => cur.filter((x) => performance.now() - x.born < 1650)), 1700);
    }
    const markKey = trades.length * 100000 + socials.length * 10 + (show.dev ? 1 : 0) + (show.kol ? 2 : 0) + (show.boost ? 4 : 0) + (show.news ? 8 : 0);
    if (markKey !== markerCount.current) {
      const bar = (atMs: number) => (Math.floor(Math.floor(atMs / 1000) / tf) * tf + timeOffset) as UTCTimestamp;
      // Your fills in the same candle and direction merge into one badge at their average price.
      const merged = new Map<string, { time: UTCTimestamp; side: "buy" | "sell"; sol: number; tokens: number; at: number; count: number }>();
      for (const t of trades) {
        if (t.tokens <= 0) continue;
        const time = bar(t.execAt);
        const key = `${time}:${t.side}`;
        const g = merged.get(key) ?? { time, side: t.side, sol: 0, tokens: 0, at: t.execAt, count: 0 };
        g.sol += t.sol;
        g.tokens += t.tokens;
        g.count++;
        merged.set(key, g);
      }
      const mine: Mark[] = [...merged.values()].map((g) => ({
        time: g.time,
        // The market cap you actually traded at, in the chart's metric and unit.
        value: (g.sol / g.tokens) * SUPPLY * factor,
        kind: "you",
        side: g.side,
        letter: g.side === "buy" ? "B" : "S",
        name: "You",
        sol: g.sol,
        mcUsd: (g.sol / g.tokens) * SUPPLY * SOL_USD,
        at: g.at,
        count: g.count,
        ...(youKol ? { self: youKol, letter: youKol.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "ME" } : {}),
      }));
      const theirs: Mark[] = socials
        .filter((e) => (e.kind === "dev" ? show.dev : e.kind === "kol" ? show.kol : e.kind === "boost" ? show.boost : show.news))
        .map((e) => ({
          time: bar(e.at),
          value: e.mc * factor,
          kind: e.kind,
          side: e.side,
          // KOL avatars carry two initials, e.g. "DD" for Degen Dave.
          letter: e.kind === "dev" ? "DEV" : (e.handle ?? e.name).replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase(),
          hue: e.hue,
          label: e.label,
          name: e.name,
          handle: e.handle,
          sol: e.sol,
          mcUsd: e.mc * SOL_USD,
          at: e.at,
          usd: e.usd,
          hours: e.hours,
          pct: e.pct,
          all: e.all,
          cost: e.cost,
          avatar: e.avatar,
          text: e.text,
        }));
      dotsRef.current?.setMarks([...theirs, ...mine]);
      markerCount.current = markKey;
    }
  }, [engine, coinId, version, timeOffset, tf, metric, unit, factor, entryMcUsd, earlyAvgMcUsd, show.dev, show.kol, show.boost, show.news, youKol]);

  // Switching timeframe, metric or unit changes where the badges sit.
  useEffect(() => {
    markerCount.current = -1;
  }, [tf, factor]);

  const shown = hover ?? lastBar.current;
  const fmt = (v: number) => formatValue(v, metric, unit);
  const chg = shown && shown.o > 0 ? ((shown.c - shown.o) / shown.o) * 100 : 0;
  const tone = chg >= 0 ? "text-up" : "text-down";

  return (
    <div ref={wrap} className="relative h-full w-full bg-[#0e0f12]">
      <div ref={host} className="h-full w-full" />
      {markHover && <MarkCard {...markHover} width={wrap.current?.clientWidth ?? 800} />}
      {pops.map((p) => (
        <div key={p.id} className="trade-pop tabular pointer-events-none absolute z-30 text-center leading-none" style={{ left: p.x, top: p.y }}>
          {p.side === "sell" ? (
            <>
              <div className={`text-[17px] font-black tracking-wide ${p.profit >= 0 ? "text-up" : "text-down"}`}>SOLD {p.pct}%</div>
              <div className="mt-1 text-[14px] font-extrabold text-ink">+{p.sol.toFixed(p.sol < 10 ? 2 : 1)} SOL</div>
              <div className={`mt-0.5 text-[11px] font-bold ${p.profit >= 0 ? "text-up" : "text-down"}`}>
                {p.profit >= 0 ? "+" : "−"}
                {Math.abs(p.profit).toFixed(2)} {p.profit >= 0 ? "profit" : "loss"}
              </div>
            </>
          ) : (
            <>
              <div className="text-[17px] font-black tracking-wide text-up">BOUGHT</div>
              <div className="mt-1 text-[14px] font-extrabold text-ink">{p.sol.toFixed(p.sol < 10 ? 2 : 1)} SOL</div>
            </>
          )}
        </div>
      ))}
      {shown && (
        <div className="tabular pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap items-center gap-x-3 text-[11px]">
          <span className="font-bold text-ink">{ticker}</span>
          {(["o", "h", "l", "c"] as const).map((k) => (
            <span key={k} className="text-faint">
              {k.toUpperCase()} <span className={tone}>{fmt(shown[k])}</span>
            </span>
          ))}
          <span className={tone}>
            {chg >= 0 ? "+" : ""}
            {chg.toFixed(2)}%
          </span>
          <span className="text-faint">
            Vol <span className="text-ink">{formatValue(shown.v, "mc", unit)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Hover card for a chart mark: who, what they did, how much, at what market cap. */
function MarkCard({ x, y, m, width }: { x: number; y: number; m: Mark; width: number }) {
  const left = x > width - 280 ? x - 272 : x + 16;
  const buy = m.side === "buy";
  const pic = m.kind === "kol" && m.handle ? kolSrc(m.handle) : m.kind === "tweet" ? m.avatar : undefined;
  const title =
    m.kind === "dev" ? (m.all ? "Dev sold everything" : "Dev wallet")
    : m.kind === "boost" ? `Boost ${m.label ?? ""}`
    : m.kind === "dex" ? "DEX Screener paid"
    : m.kind === "cto" ? "Community takeover"
    : m.self ? m.self.name
    : m.name;
  const amount = (m.sol ?? 0).toFixed(m.sol && m.sol < 10 ? 2 : 1);
  return (
    <div
      className="pointer-events-none absolute z-20 w-[256px] rounded-lg border border-line-hi bg-card/95 p-2.5 text-[12px] shadow-2xl backdrop-blur"
      style={{ left, top: Math.max(4, y - 30) }}
    >
      <div className="flex items-center gap-2">
        {pic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pic} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-black ${
              m.kind === "dev" ? (m.all ? "bg-down text-white" : "bg-amber text-black")
              : m.kind === "boost" ? "bg-amber text-black"
              : m.kind === "dex" ? "bg-blue text-black"
              : m.kind === "cto" ? "bg-up text-black"
              : buy ? "bg-up text-black" : "bg-down text-white"
            }`}
          >
            {m.kind === "dev" ? "DEV" : m.kind === "boost" ? "🚀" : m.kind === "dex" ? "DEX" : m.kind === "cto" ? "CTO" : m.letter}
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <div className="truncate font-bold text-ink">{title}</div>
          {m.handle && <div className="truncate text-[11px] text-dim">@{m.handle}</div>}
          {m.self && (
            <div className="truncate text-[11px] text-dim">
              @{m.self.handle} · <span className="text-amber">{m.self.followers.toLocaleString("en-US")} followers</span>
            </div>
          )}
          {(m.kind === "kol" || m.kind === "tweet") && <div className="text-[10px] text-faint">simulated</div>}
        </div>
      </div>
      {m.kind === "tweet" && m.text && <p className="mt-2 text-[12px] leading-snug text-ink/90">{m.text}</p>}
      {(m.kind === "kol" || m.kind === "dev" || m.kind === "you") && (
        <div className="tabular mt-2 flex items-baseline justify-between">
          <span className={`font-bold ${buy ? "text-up" : "text-down"}`}>
            {m.kind === "dev" && m.all ? "Sold all" : buy ? "Bought" : "Sold"} {amount} SOL
            {m.count && m.count > 1 ? <span className="font-semibold text-dim"> · {m.count} fills</span> : null}
          </span>
          <span className="text-dim">
            at <span className="font-bold text-ink">{usd(m.mcUsd ?? 0)}</span> MC
          </span>
        </div>
      )}
      {m.kind === "kol" && m.pct !== undefined && (
        <div className="tabular mt-1 text-[11px] text-dim">
          {m.pct.toFixed(2)}% of supply
          {m.cost !== undefined && m.cost > 0 && (
            <>
              {" · in "}
              {m.cost.toFixed(m.cost < 10 ? 2 : 1)} SOL{" "}
              <span className={`font-bold ${(m.sol ?? 0) >= m.cost ? "text-up" : "text-down"}`}>
                {(m.sol ?? 0) >= m.cost ? "+" : ""}
                {(((m.sol ?? 0) / m.cost - 1) * 100).toFixed(0)}%
              </span>
            </>
          )}
        </div>
      )}
      {m.kind === "dev" && m.pct !== undefined && (
        <div className="tabular mt-1 text-[11px] text-dim">{m.pct.toFixed(2)}% of supply{m.all ? " · dev wallet now empty" : ""}</div>
      )}
      {m.kind === "boost" && (
        <div className="tabular mt-2 text-dim">
          Paid <span className="font-bold text-ink">${m.usd?.toLocaleString("en-US")}</span> for {m.label} · {m.hours} h · at{" "}
          <span className="font-bold text-ink">{usd(m.mcUsd ?? 0)}</span> MC
        </div>
      )}
      {m.kind === "dex" && (
        <div className="tabular mt-2 text-dim">
          Profile paid (${m.usd}) at <span className="font-bold text-ink">{usd(m.mcUsd ?? 0)}</span> MC
        </div>
      )}
      {m.kind === "cto" && (
        <div className="tabular mt-2 text-dim">
          Dev is gone, the community runs it now · at <span className="font-bold text-ink">{usd(m.mcUsd ?? 0)}</span> MC
        </div>
      )}
      {m.kind === "tweet" && (
        <div className="tabular mt-1.5 text-[11px] text-dim">
          at <span className="font-bold text-ink">{usd(m.mcUsd ?? 0)}</span> MC
        </div>
      )}
    </div>
  );
}
