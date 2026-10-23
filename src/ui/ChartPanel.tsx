"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
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
import { SOL_USD } from "@/engine/curve";
import type { Engine } from "@/engine/engine";
import type { Candle } from "@/engine/types";
import { usd } from "./format";

interface Props {
  engine: Engine;
  coinId: string;
  /** Snapshot version. Changes whenever the engine has new data. */
  version: number;
  /** Seconds added to engine time so the axis shows wall-clock time. */
  timeOffset: number;
  entryMcUsd: number | null;
}

const UP = "#2ee6a6";
const DOWN = "#ff4d6d";
const clock = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour12: false });

/**
 * Market-cap candles (USD) with a volume strip and your fills as markers.
 * Live data goes through series.update so panning and zoom survive ticks.
 * Mount with key={coinId}: a new coin is a new chart.
 */
export function ChartPanel({ engine, coinId, version, timeOffset, entryMcUsd }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const lineRef = useRef<IPriceLine | null>(null);
  const lastT = useRef<number | null>(null);
  const markerCount = useRef(-1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e13" },
        textColor: "#7d8896",
        fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: "#111821" }, horzLines: { color: "#111821" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1a222c", scaleMargins: { top: 0.06, bottom: 0.04 } },
      timeScale: {
        borderColor: "#1a222c",
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
      priceFormat: { type: "custom", formatter: (p: number) => usd(p), minMove: 1 },
      // Market cap cannot go below zero, so never let the axis show negatives.
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
    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    markersRef.current = createSeriesMarkers(candle, []);
    return () => {
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = markersRef.current = lineRef.current = null;
      lastT.current = null;
      markerCount.current = -1;
    };
  }, []);

  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    const chart = chartRef.current;
    if (!candle || !vol || !chart) return;
    const candles = engine.getCandles(coinId);
    if (candles.length === 0) return;

    const bar = (c: Candle) => ({
      time: (c.t + timeOffset) as UTCTimestamp,
      open: c.o * SOL_USD,
      high: c.h * SOL_USD,
      low: c.l * SOL_USD,
      close: c.c * SOL_USD,
    });
    const volume = (c: Candle) => ({
      time: (c.t + timeOffset) as UTCTimestamp,
      value: c.v * SOL_USD,
      color: c.c >= c.o ? "rgba(46,230,166,.35)" : "rgba(255,77,109,.35)",
    });

    const last = candles[candles.length - 1];
    if (lastT.current === null || lastT.current > last.t) {
      candle.setData(candles.map(bar));
      vol.setData(candles.map(volume));
      const n = candles.length;
      if (n > 150) chart.timeScale().setVisibleLogicalRange({ from: n - 120, to: n + 6 });
      else chart.timeScale().fitContent();
    } else {
      let i = candles.length - 1;
      while (i > 0 && candles[i - 1].t >= lastT.current) i--;
      for (; i < candles.length; i++) {
        candle.update(bar(candles[i]));
        vol.update(volume(candles[i]));
      }
    }
    lastT.current = last.t;

    const trades = engine.getTradesFor(coinId);
    if (trades.length !== markerCount.current) {
      markersRef.current?.setMarkers(
        trades.map((t) => ({
          time: (Math.floor(t.execAt / 1000) + timeOffset) as UTCTimestamp,
          position: t.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          shape: t.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          color: t.side === "buy" ? "#6f8bff" : DOWN,
          text: `${t.side === "buy" ? "B" : "S"} ${t.sol.toFixed(2)}`,
        })),
      );
      markerCount.current = trades.length;
    }
  }, [engine, coinId, version, timeOffset]);

  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    if (lineRef.current) {
      candle.removePriceLine(lineRef.current);
      lineRef.current = null;
    }
    if (entryMcUsd) {
      lineRef.current = candle.createPriceLine({
        price: entryMcUsd,
        color: "#f5b942",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "entry",
      });
    }
  }, [entryMcUsd]);

  return <div ref={host} className="h-full w-full" />;
}
