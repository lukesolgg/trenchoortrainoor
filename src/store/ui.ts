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
  /** Token page buy buttons, in SOL. Hotkeys 1-4. */
  buyPresets: number[];
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
  buyPresets: [0.5, 1, 3, 5],
  runId: 0,
  pickMode: (mode) => set({ mode, screen: mode === "freeplay" ? "play" : "setup", runId: Date.now() }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setQuickPreset: (i, n) => set((st) => ({ quickPresets: st.quickPresets.map((v, k) => (k === i ? n : v)) })),
  setColPreset: (col, i) => set((st) => ({ colPreset: st.colPreset.map((v, k) => (k === col ? i : v)) })),
  setFeedOpen: (feedOpen) => set({ feedOpen }),
  setInstantTrade: (instantTrade) => set({ instantTrade }),
  setQuickEnabled: (quickEnabled) => set({ quickEnabled }),
  setBuyPresets: (buyPresets) => set({ buyPresets }),
  start: () => set({ screen: "play", runId: Date.now() }),
  toModes: () => set({ screen: "modes" }),
}));
