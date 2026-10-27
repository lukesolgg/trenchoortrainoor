import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DifficultyId } from "@/engine/types";

export type Screen = "modes" | "setup" | "campaign" | "play";
export type NavTab = "trenches" | "trending" | "portfolio" | "rewards";
export type ModeId = "firsttx" | "dev" | "freeplay" | "campaign";
export type Port = "low" | "medium" | "whale";

/** Starting balance for each port size, in SOL. */
export const PORTS: Record<Port, { label: string; sol: number; quick: number; sets: number[][] }> = {
  low: {
    label: "Low port",
    sol: 2.5,
    quick: 0.2,
    sets: [
      [0.05, 0.1, 0.25, 0.5, 0.15, 0.2, 0.3, 1],
      [0.01, 0.02, 0.05, 0.1, 0.03, 0.04, 0.075, 0.15],
      [0.5, 1, 1.5, 2, 0.75, 1.25, 1.75, 2.5],
    ],
  },
  medium: {
    label: "Medium port",
    sol: 25,
    quick: 1,
    sets: [
      [1, 3, 5, 10, 2, 4, 0.5, 0.1],
      [0.1, 0.2, 0.3, 0.5, 0.15, 0.25, 0.75, 1],
      [5, 10, 15, 20, 7.5, 12, 25, 50],
    ],
  },
  whale: {
    label: "Whale port",
    sol: 250,
    quick: 10,
    sets: [
      [10, 30, 50, 100, 20, 40, 5, 1],
      [1, 2, 3, 5, 1.5, 2.5, 7.5, 10],
      [50, 100, 150, 200, 75, 125, 25, 250],
    ],
  },
};

interface UiState {
  screen: Screen;
  tab: NavTab;
  mode: ModeId;
  difficulty: DifficultyId;
  /** The three quick-buy sizes (P1-P3), in SOL. */
  quickPresets: number[];
  /** Memescope quick-buy size in SOL: one amount for every column. */
  quickAmount: number;
  /** Selected preset index for each Pulse column: New, Almost bonded, Migrated. */
  colPreset: number[];
  quickEnabled: boolean;
  /** Strict: a wrong buy ends the round and runs count for PBs. Training: wrong buys cost points, the round goes on. */
  style: "strict" | "training";
  muted: boolean;
  /** Starting balance size. */
  port: Port;
  /** Chart social layers. */
  social: { dev: boolean; kol: boolean; boost: boolean; news: boolean };
  /** Round length: Blitz (done in about a minute) or Saga (a 5-10 minute story). */
  length: "blitz" | "saga";
  /** Tweet feed column expanded. */
  feedOpen: boolean;
  /** Token page: preset buttons fire immediately instead of arming an amount. */
  instantTrade: boolean;
  /** Token page buy buttons, in SOL: three sets of eight. Hotkeys 1-8 fire the active set. */
  buySets: number[][];
  presetSet: number;
  /** Bumped on every round start so the Game remounts with a fresh engine. */
  runId: number;
  setTab: (t: NavTab) => void;
  pickMode: (m: ModeId) => void;
  setDifficulty: (d: DifficultyId) => void;
  setQuickPreset: (i: number, n: number) => void;
  setColPreset: (col: number, i: number) => void;
  setQuickAmount: (n: number) => void;
  setStyle: (s: "strict" | "training") => void;
  setMuted: (b: boolean) => void;
  setPort: (p: Port) => void;
  toggleSocial: (k: "dev" | "kol" | "boost" | "news") => void;
  setLength: (l: "blitz" | "saga") => void;
  setFeedOpen: (b: boolean) => void;
  setInstantTrade: (b: boolean) => void;
  setQuickEnabled: (b: boolean) => void;
  setBuyPresets: (p: number[]) => void;
  setPresetSet: (i: number) => void;
  start: () => void;
  toModes: () => void;
  toMenu: () => void;
}

/** UI and settings only. Game state lives in the engine. Choices (difficulty, length, style, port, presets) persist. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
  screen: "modes",
  tab: "trenches",
  mode: "firsttx",
  difficulty: "sniper",
  quickPresets: [0.5, 1, 3],
  colPreset: [2, 1, 1],
  quickAmount: 1,
  feedOpen: true,
  instantTrade: true,
  quickEnabled: true,
  style: "strict",
  muted: false,
  port: "medium",
  social: { dev: true, kol: true, boost: true, news: true },
  length: "blitz",
  buySets: [
    [1, 3, 5, 10, 2, 4, 0.5, 0.1],
    [0.1, 0.2, 0.3, 0.5, 0.15, 0.25, 0.75, 1],
    [5, 10, 15, 20, 7.5, 12, 25, 50],
  ],
  presetSet: 0,
  runId: 0,
  setTab: (tab) => set({ tab }),
  pickMode: (mode) => set({ mode, screen: mode === "freeplay" ? "play" : mode === "campaign" ? "campaign" : "setup", runId: Date.now() }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setQuickPreset: (i, n) => set((st) => ({ quickPresets: st.quickPresets.map((v, k) => (k === i ? n : v)) })),
  setColPreset: (col, i) => set((st) => ({ colPreset: st.colPreset.map((v, k) => (k === col ? i : v)) })),
  setQuickAmount: (quickAmount) => set({ quickAmount }),
  setStyle: (style) => set({ style }),
  setMuted: (muted) => set({ muted }),
  setPort: (port) => set({ port, quickAmount: PORTS[port].quick, buySets: PORTS[port].sets.map((x) => [...x]), presetSet: 0 }),
  setLength: (length) => set({ length }),
  toggleSocial: (k) => set((st) => ({ social: { ...st.social, [k]: !st.social[k] } })),
  setFeedOpen: (feedOpen) => set({ feedOpen }),
  setInstantTrade: (instantTrade) => set({ instantTrade }),
  setQuickEnabled: (quickEnabled) => set({ quickEnabled }),
  setBuyPresets: (p) => set((st) => ({ buySets: st.buySets.map((x, i) => (i === st.presetSet ? p : x)) })),
  setPresetSet: (presetSet) => set({ presetSet }),
  start: () => set({ screen: "play", tab: "trenches", runId: Date.now() }),
  // Leaving a round goes back to where it started: the campaign hub, or the main menu.
  toModes: () => set((st) => ({ screen: st.mode === "campaign" && st.screen === "play" ? "campaign" : "modes" })),
  toMenu: () => set({ screen: "modes" }),
    }),
    {
      name: "gngm.settings.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        difficulty: s.difficulty,
        length: s.length,
        style: s.style,
        port: s.port,
        quickAmount: s.quickAmount,
        buySets: s.buySets,
        muted: s.muted,
        social: s.social,
        instantTrade: s.instantTrade,
        quickEnabled: s.quickEnabled,
      }),
    },
  ),
);
