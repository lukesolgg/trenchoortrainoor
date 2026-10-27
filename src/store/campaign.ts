import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DifficultyId, RoundResult } from "@/engine/types";
import { ALL_FEATURES, awardRound, featuresFor, levelForXp, START_SOL, xpForLevel, type Award, type Features } from "@/campaign/progression";

interface CampaignState {
  xp: number;
  traderSol: number;
  /** Dev wallet balance; null until Dev is opened with its deposit. */
  devSol: number | null;
  /** KOL Rep points (tiers and followers come from these). */
  kolPoints: number;
  /** Your name and @handle as a caller. */
  kolName: string;
  kolHandle: string;
  devRep: number;
  rounds: number;
  streak: number;
  firsts: { tenX: boolean; vamp: boolean; saga: boolean };
  /** Round settings used in the campaign (kept apart from the standalone modes'). */
  difficulty: DifficultyId;
  length: "blitz" | "saga";
  style: "strict" | "training";
  /** Admin: treat every feature as unlocked. */
  unlockAll: boolean;
  setDifficulty: (d: DifficultyId) => void;
  setLength: (l: "blitz" | "saga") => void;
  setStyle: (s: "strict" | "training") => void;
  /** Settle a finished round: XP, bonuses, the new trader balance. */
  finishRound: (r: RoundResult, endSol: number) => Award;
  /** Leaving mid-round: the balance keeps what your open bags were worth; no XP. */
  abandonRound: (endSol: number) => void;
  setKolHandle: (name: string, handle: string) => void;
  admin: (patch: Partial<Pick<CampaignState, "xp" | "traderSol" | "devSol" | "kolPoints" | "devRep" | "unlockAll">>) => void;
  reset: () => void;
}

const fresh = {
  xp: 0,
  traderSol: START_SOL,
  devSol: null,
  kolPoints: 0,
  kolName: "You",
  kolHandle: "you",
  devRep: 0,
  rounds: 0,
  streak: 0,
  firsts: { tenX: false, vamp: false, saga: false },
  difficulty: "paper" as DifficultyId,
  length: "blitz" as const,
  style: "strict" as const,
  unlockAll: false,
};

export const useCampaign = create<CampaignState>()(
  persist(
    (set, get) => ({
      ...fresh,
      setDifficulty: (difficulty) => set({ difficulty }),
      setLength: (length) => set({ length }),
      setStyle: (style) => set({ style }),
      finishRound: (r, endSol) => {
        const s = get();
        const { next, award } = awardRound(s, r, endSol);
        set(next);
        return award;
      },
      setKolHandle: (kolName, kolHandle) => set({ kolName: kolName.slice(0, 24) || "You", kolHandle: kolHandle.replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "you" }),
      abandonRound: (endSol) => set({ traderSol: Math.max(0, endSol) }),
      admin: (patch) => set(patch),
      reset: () => set({ ...fresh }),
    }),
    {
      name: "ta.campaign.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        xp: s.xp,
        traderSol: s.traderSol,
        devSol: s.devSol,
        kolPoints: s.kolPoints,
        kolName: s.kolName,
        kolHandle: s.kolHandle,
        devRep: s.devRep,
        rounds: s.rounds,
        streak: s.streak,
        firsts: s.firsts,
        difficulty: s.difficulty,
        length: s.length,
        style: s.style,
        unlockAll: s.unlockAll,
      }),
    },
  ),
);

export const campaignLevel = (xp: number) => levelForXp(xp);
export const campaignFeatures = (s: { xp: number; unlockAll: boolean }): Features => (s.unlockAll ? ALL_FEATURES : featuresFor(levelForXp(s.xp)));
export { xpForLevel };
