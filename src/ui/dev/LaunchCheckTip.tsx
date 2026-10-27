"use client";

import type { ReactNode } from "react";
import type { LaunchView } from "@/engine/types";
import { Art } from "../Art";

const ROWS: { k: keyof LaunchView["check"]; label: string }[] = [
  { k: "name", label: "Name" },
  { k: "ticker", label: "Ticker" },
  { k: "image", label: "Picture" },
  { k: "launchpad", label: "Launchpad" },
  { k: "pair", label: "Pair" },
];

function show(l: LaunchView, k: keyof LaunchView["check"], which: "right" | "you"): ReactNode {
  const c = which === "right" ? l.right.config : l.config;
  switch (k) {
    case "name":
      return which === "right" ? l.right.name : l.name;
    case "ticker":
      return `$${which === "right" ? l.right.ticker : l.ticker}`;
    case "image":
      return <Art art={which === "right" ? l.right.art : l.art} className="h-5 w-5 rounded" glyphSize={10} />;
    case "launchpad":
      return c.launchpad === "pump" ? "Pump" : "Bonk";
    case "dividends":
      return c.dividends ? "On" : "Off";
    case "pair":
      return `/${c.pair}`;
  }
}

/** Where a launch went wrong: the tweet's answer against yours, mistakes first. */
export function LaunchCheckBody({ l }: { l: LaunchView }) {
  const wrong = ROWS.filter((r) => !l.check[r.k]);
  const rows = [...wrong, ...ROWS.filter((r) => l.check[r.k])];
  const nameWrong = !l.check.name || !l.check.ticker;
  return (
    <div className="w-[300px]">
      <div className={`text-[12px] font-black ${wrong.length ? "text-down" : "text-up"}`}>
        {wrong.length === 0 ? "Everything matched the tweet" : `${wrong.length} thing${wrong.length > 1 ? "s" : ""} wrong`}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-dim">
        {wrong.length === 0
          ? l.first
            ? "First right coin out: the rest is the narrative and how you run it."
            : "Right coin, but a rival's was out first and took most of the flow."
          : nameWrong
            ? "The name or ticker didn't match, so the narrative's buyers never came: it can't bond on its own."
            : "Right coin, but buyers check the details and a lot of them passed."}
      </p>
      <table className="mt-2 w-full text-[11.5px]">
        <thead className="text-[9.5px] font-bold uppercase tracking-wider text-faint">
          <tr>
            <th className="pb-1 text-left font-bold" />
            <th className="pb-1 text-left font-bold">Tweet</th>
            <th className="pb-1 text-left font-bold">Yours</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ok = l.check[r.k];
            return (
              <tr key={r.k} className={`border-t border-line/60 ${ok ? "opacity-60" : ""}`}>
                <td className="py-1 pr-2 text-faint">{r.label}</td>
                <td className="py-1 pr-2 font-semibold">{show(l, r.k, "right")}</td>
                <td className={`py-1 pr-2 font-semibold ${ok ? "" : "text-down"}`}>{show(l, r.k, "you")}</td>
                <td className={`py-1 text-right font-black ${ok ? "text-up" : "text-down"}`}>{ok ? "✓" : "✗"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Wrap anything: hovering it opens the check card below (or above, with `up`). */
export function LaunchCheckTip({ l, children, up, align = "left" }: { l: LaunchView; children: ReactNode; up?: boolean; align?: "left" | "right" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        className={`pointer-events-none absolute z-50 hidden rounded-xl border border-line-hi bg-card/95 p-3 shadow-2xl backdrop-blur group-hover/tip:block ${
          up ? "bottom-full mb-1.5" : "top-full mt-1.5"
        } ${align === "left" ? "left-0" : "right-0"}`}
      >
        <LaunchCheckBody l={l} />
      </span>
    </span>
  );
}
