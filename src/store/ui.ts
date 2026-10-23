import { create } from "zustand";
import type { DifficultyId } from "@/engine/types";

export type Screen = "modes" | "setup" | "play";
export type ModeId = "firsttx" | "dev" | "freeplay";

interface UiState {
  screen: Screen;
  mode: ModeId;
  difficulty: DifficultyId;
  /** The three quick-buy sizes (P1-P3), in SOL. */
  quickPresets: number[];
  /** Selected preset index for each Pulse column: New, Almost bonded, Migrated. */
  colPreset: number[];
  quickEnabled: boolean;
  /** Tweet feed column expanded. */
  feedOpen: boolean;
  /** Token page: preset buttons fire immediately instead of arming an amount. */
  instantTrade: boolean;
  /** Token page buy buttons, in SOL: three sets of eight. Hotkeys 1-8 fire the active set. */
  buySets: number[][];
  presetSet: number;
  /** Bumped on every round start so the Game remounts with a fresh engine. */
  runId: number;
  pickMode: (m: ModeId) => void;
  setDifficulty: (d: DifficultyId) => void;
  setQuickPreset: (i: number, n: number) => void;
  setColPreset: (col: number, i: number) => void;
  setFeedOpen: (b: boolean) => void;
  setInstantTrade: (b: boolean) => void;
  setQuickEnabled: (b: boolean) => void;
  setBuyPresets: (p: number[]) => void;
  setPresetSet: (i: number) => void;
  start: () => void;
  toModes: () => void;
}

/** UI and settings only. Game state lives in the engine. */
export const useUi = create<UiState>((set) => ({
  screen: "modes",
  mode: "firsttx",
  difficulty: "sniper",
  quickPresets: [0.5, 1, 3],
  colPreset: [2, 1, 1],
  feedOpen: true,
  instantTrade: true,
  quickEnabled: true,
  buySets: [
    [1, 3, 5, 10, 2, 4, 0.5, 0.1],
    [0.1, 0.2, 0.3, 0.5, 0.15, 0.25, 0.75, 1],
    [5, 10, 15, 20, 7.5, 12, 25, 50],
  ],
  presetSet: 0,
  runId: 0,
  pickMode: (mode) => set({ mode, screen: mode === "freeplay" ? "play" : "setup", runId: Date.now() }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setQuickPreset: (i, n) => set((st) => ({ quickPresets: st.quickPresets.map((v, k) => (k === i ? n : v)) })),
  setColPreset: (col, i) => set((st) => ({ colPreset: st.colPreset.map((v, k) => (k === col ? i : v)) })),
  setFeedOpen: (feedOpen) => set({ feedOpen }),
  setInstantTrade: (instantTrade) => set({ instantTrade }),
  setQuickEnabled: (quickEnabled) => set({ quickEnabled }),
  setBuyPresets: (p) => set((st) => ({ buySets: st.buySets.map((x, i) => (i === st.presetSet ? p : x)) })),
  setPresetSet: (presetSet) => set({ presetSet }),
  start: () => set({ screen: "play", runId: Date.now() }),
  toModes: () => set({ screen: "modes" }),
}));
