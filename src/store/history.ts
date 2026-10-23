import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ArtSpec } from "@/engine/types";

export interface HistoryTrade {
  key: string;
  ticker: string;
  name: string;
  art: ArtSpec;
  invested: number;
  returned: number;
  /** Wall-clock ms. */
  closedAt: number;
}

const CAP = 500;

interface HistoryState {
  trades: HistoryTrade[];
  add: (t: HistoryTrade[]) => void;
  clear: () => void;
}

/** Closed trades, kept in this browser so the Portfolio survives reloads. */
export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      trades: [],
      add: (t) => set((s) => ({ trades: [...s.trades, ...t].slice(-CAP) })),
      clear: () => set({ trades: [] }),
    }),
    {
      name: "gngm.history.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
