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
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { SOL_USD, SUPPLY } from "@/engine/curve";
import type { Engine } from "@/engine/engine";
import type { Candle } from "@/engine/types";
import { aggregate, fmtPrice, tailFrom } from "./chartData";
import { usd } from "./format";

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
}

const UP = "#35d07f";
const DOWN = "#f0455a";
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour12: false });

/** Engine candles hold market cap in SOL. Multiply by this to get the chosen metric/unit. */
const factorFor = (metric: Metric, unit: Unit) => (unit === "usd" ? SOL_USD : 1) / (metric === "price" ? SUPPLY : 1);

export function formatValue(v: number, metric: Metric, unit: Unit): string {
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
export function ChartPanel({ ref, engine, coinId, version, timeOffset, tf, metric, unit, scale, entryMcUsd, earlyAvgMcUsd, ticker }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lines = useRef<{ ath?: IPriceLine; early?: IPriceLine; entry?: IPriceLine }>({});
  const lastT = useRef<number | null>(null);
  const dataKey = useRef("");
  const markerCount = useRef(-1);
  const lastBar = useRef<Bar | null>(null);
  const [hover, setHover] = useState<Bar | null>(null);

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
        background: { type: ColorType.Solid, color: "#060b08" },
        textColor: "#7d9588",
        fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: "#0d1a13" }, horzLines: { color: "#0d1a13" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#15352a", scaleMargins: { top: 0.06, bottom: 0.04 } },
      timeScale: {
        borderColor: "#15352a",
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
    // Volume lives in its own pane so it never overlaps the candles.
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, lastValueVisible: false }, 1);
    const panes = chart.panes();
    panes[0]?.setStretchFactor(4);
    panes[1]?.setStretchFactor(1);
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(candle) as { open: number; high: number; low: number; close: number } | undefined;
      const v = p.seriesData.get(vol) as { value: number } | undefined;
      setHover(d ? { o: d.open, h: d.high, l: d.low, c: d.close, v: v?.value ?? 0 } : null);
    });
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    markersRef.current = createSeriesMarkers(candle, []);
    return () => {
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = markersRef.current = null;
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
      if (n > 150) chart.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 6 });
      else chart.timeScale().fitContent();
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
    const upsert = (k: "ath" | "early" | "entry", price: number | null, color: string, title: string, style: number) => {
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
    upsert("ath", ath * factor, "#8aa396", "ATH", 2);
    upsert("early", (earlyAvgMcUsd / SOL_USD) * factor, "#f5c542", "Top 10 avg buy", 1);
    upsert("entry", entryMcUsd ? (entryMcUsd / SOL_USD) * factor : null, "#4db8ff", "Entry", 2);

    const trades = engine.getTradesFor(coinId);
    if (trades.length !== markerCount.current) {
      markersRef.current?.setMarkers(
        trades.map((t) => ({
          time: (Math.floor(Math.floor(t.execAt / 1000) / tf) * tf + timeOffset) as UTCTimestamp,
          position: t.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          shape: t.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          color: t.side === "buy" ? "#4c6fff" : DOWN,
          text: `${t.side === "buy" ? "B" : "S"} ${t.sol.toFixed(2)}`,
        })),
      );
      markerCount.current = trades.length;
    }
  }, [engine, coinId, version, timeOffset, tf, metric, unit, factor, entryMcUsd, earlyAvgMcUsd]);

  // Switching timeframe changes where markers sit.
  useEffect(() => {
    markerCount.current = -1;
  }, [tf]);

  const shown = hover ?? lastBar.current;
  const fmt = (v: number) => formatValue(v, metric, unit);
  const chg = shown && shown.o > 0 ? ((shown.c - shown.o) / shown.o) * 100 : 0;
  const tone = chg >= 0 ? "text-up" : "text-down";

  return (
    <div ref={wrap} className="relative h-full w-full bg-[#060b08]">
      <div ref={host} className="h-full w-full" />
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
