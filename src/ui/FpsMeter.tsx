"use client";

import { useEffect, useState } from "react";

/** Live frames-per-second, updated twice a second. Handy while the board redraws every frame. */
export function FpsMeter() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const tone = fps === null ? "text-faint" : fps >= 55 ? "text-up" : fps >= 30 ? "text-amber" : "text-down";
  return (
    <span className={`tabular font-semibold ${tone}`} title="Frames per second in this tab">
      {fps === null ? "-- FPS" : `${fps} FPS`}
    </span>
  );
}
