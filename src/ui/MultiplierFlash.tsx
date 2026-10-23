"use client";

import { useEffect, useRef, useState } from "react";
import type { Position } from "@/engine/types";

const MILESTONES = [2, 5, 10, 20, 50, 100];

const CONFETTI = ["#2ee6a6", "#f5c542", "#ff4fa3", "#4db8ff", "#8b5cf6", "#ffffff"];

/** A ring of particles thrown out from the number. Fixed layout per flash so it never re-randomises mid-animation. */
function Confetti({ seed }: { seed: number }) {
  const bits = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + ((seed * (i + 7)) % 100) / 160;
    const d = 140 + ((seed * (i + 3) * 37) % 160);
    return {
      dx: Math.cos(a) * d,
      dy: Math.sin(a) * d * 0.7,
      color: CONFETTI[i % CONFETTI.length],
      w: i % 3 === 0 ? 10 : 6,
      rot: (i * 47) % 360,
      delay: (i % 5) * 18,
    };
  });
  return (
    <div className="absolute left-1/2 top-1/2">
      {bits.map((b, i) => (
        <span
          key={i}
          className="anim-confetti absolute block h-[4px] rounded-sm"
          style={
            {
              width: b.w,
              background: b.color,
              "--dx": `${b.dx}px`,
              "--dy": `${b.dy}px`,
              "--rot": `${b.rot}deg`,
              animationDelay: `${b.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

const COLOR: Record<number, string> = {
  2: "text-up",
  5: "text-up",
  10: "text-amber",
  20: "text-pink",
  50: "text-violet",
  100: "text-violet",
};

/** Multiple of your average entry, using the position's mark-to-market value. */
const multipleOf = (p: Position) => (p.tokens > 0 && p.boughtTokens > 0 ? p.valueSol / (p.tokens * (p.boughtSol / p.boughtTokens)) : 0);

/** Quick flash when an open position first crosses 2x, 5x, 10x, 20x... of its entry. */
export function MultiplierFlash({ positions, tickerOf }: { positions: Position[]; tickerOf: (coinId: string) => string }) {
  const reached = useRef(new Map<string, number>());
  const [flash, setFlash] = useState<{ key: number; x: number; ticker: string } | null>(null);

  useEffect(() => {
    let best: { x: number; coinId: string } | null = null;
    const live = new Set<string>();
    for (const p of positions) {
      if (p.tokens <= 0) continue;
      live.add(p.coinId);
      const m = multipleOf(p);
      const prev = reached.current.get(p.coinId) ?? 1;
      const hit = MILESTONES.filter((x) => x > prev && m >= x).pop();
      if (hit) {
        reached.current.set(p.coinId, hit);
        if (!best || hit > best.x) best = { x: hit, coinId: p.coinId };
      }
    }
    for (const id of reached.current.keys()) if (!live.has(id)) reached.current.delete(id);
    if (best) setFlash({ key: Date.now(), x: best.x, ticker: tickerOf(best.coinId) });
  }, [positions, tickerOf]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1300);
    return () => clearTimeout(t);
  }, [flash]);

  if (!flash) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center">
      <div key={flash.key} className="relative -mt-24 text-center">
        <Confetti seed={flash.key % 997} />
        <div className="anim-mult">
        <div className={`text-[96px] font-black leading-none tracking-tighter drop-shadow-[0_0_36px_currentColor] ${COLOR[flash.x] ?? "text-up"}`}>
          {flash.x}x
        </div>
        <div className="mt-1 text-[12px] font-bold uppercase tracking-[0.2em] text-ink/80 drop-shadow-[0_1px_8px_rgba(0,0,0,.8)]">{flash.ticker}</div>
        </div>
      </div>
    </div>
  );
}
