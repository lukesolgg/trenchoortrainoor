"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine, type EngineOptions } from "@/engine/engine";
import type { Snapshot } from "@/engine/types";

/** One engine per mount. Remount (change `key`) to start a fresh round set. */
export function useEngine(opts: Omit<EngineOptions, "seed"> & { seed?: number }): Engine {
  const [engine] = useState(
    () => new Engine({ ...opts, seed: opts.seed ?? Math.floor(Math.random() * 2 ** 32) }),
  );
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);
  return engine;
}

export function useSnapshot(engine: Engine): Snapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

/**
 * Freeze a list while the pointer is over it, and count what arrived meanwhile.
 * Matches how trading terminals behave: you can read and click without the
 * rows moving under the cursor.
 */
export function usePausable<T extends { id: string }>(live: T[], paused: boolean) {
  const liveRef = useRef(live);
  liveRef.current = live;
  const [frozen, setFrozen] = useState<T[] | null>(null);

  useEffect(() => {
    setFrozen(paused ? liveRef.current : null);
  }, [paused]);

  if (!frozen) return { items: live, newCount: 0 };
  const seen = new Set(frozen.map((x) => x.id));
  return { items: frozen, newCount: live.filter((x) => !seen.has(x.id)).length };
}
