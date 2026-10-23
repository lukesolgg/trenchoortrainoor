import { create } from "zustand";
import type { DifficultyId } from "@/engine/types";

export type Screen = "modes" | "setup" | "play";
export type ModeId = "firsttx" | "dev" | "freeplay";

interface UiState {
  screen: Screen;
  mode: ModeId;
  difficulty: DifficultyId;
  quickSol: number;
  quickEnabled: boolean;
  /** Bumped on every round start so the Game remounts with a fresh engine. */
  runId: number;
  pickMode: (m: ModeId) => void;
  setDifficulty: (d: DifficultyId) => void;
  setQuickSol: (n: number) => void;
  setQuickEnabled: (b: boolean) => void;
  start: () => void;
  toModes: () => void;
}

/** UI and settings only. Game state lives in the engine. */
export const useUi = create<UiState>((set) => ({
  screen: "modes",
  mode: "firsttx",
  difficulty: "sniper",
  quickSol: 3,
  quickEnabled: true,
  runId: 0,
  pickMode: (mode) => set({ mode, screen: mode === "freeplay" ? "play" : "setup", runId: Date.now() }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setQuickSol: (quickSol) => set({ quickSol }),
  setQuickEnabled: (quickEnabled) => set({ quickEnabled }),
  start: () => set({ screen: "play", runId: Date.now() }),
  toModes: () => set({ screen: "modes" }),
}));
