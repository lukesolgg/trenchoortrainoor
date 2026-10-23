import type { DifficultyId } from "./types";

export interface Difficulty {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** How many coins flood New Pairs after the tweet, and over how long. */
  deploys: [number, number];
  floodMs: number;
  /** How many bots snipe the right coin, and how fast after it appears. */
  snipers: [number, number];
  sniperReactMs: [number, number];
  /** DEV mode: when rival deployers land their coin, ms after the tweet. */
  rivalDeployMs: [number, number];
  rivalDeployers: [number, number];
  /** How many noise memes (distractor tweets) show up per round. */
  distractors: [number, number];
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  paper: {
    id: "paper",
    label: "Paper Hands",
    blurb: "Slow bots and a thin flood. Learn the config rules first.",
    deploys: [6, 10],
    floodMs: 9000,
    snipers: [3, 6],
    sniperReactMs: [600, 1500],
    rivalDeployMs: [4000, 8000],
    rivalDeployers: [2, 4],
    distractors: [0, 1],
  },
  trencher: {
    id: "trencher",
    label: "Trencher",
    blurb: "Busy boards and bots that punish hesitation.",
    deploys: [10, 18],
    floodMs: 6000,
    snipers: [6, 12],
    sniperReactMs: [300, 800],
    rivalDeployMs: [2000, 4500],
    rivalDeployers: [4, 8],
    distractors: [1, 2],
  },
  sniper: {
    id: "sniper",
    label: "Sniper",
    blurb: "Real bot speed. 18-30 deploys in about 4 s, snipers at 0.14-0.42 s.",
    deploys: [18, 30],
    floodMs: 4000,
    snipers: [12, 20],
    sniperReactMs: [140, 420],
    rivalDeployMs: [1000, 2500],
    rivalDeployers: [8, 14],
    distractors: [1, 3],
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["paper", "trencher", "sniper"];
