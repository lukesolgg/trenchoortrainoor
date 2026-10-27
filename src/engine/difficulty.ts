import type { DifficultyId } from "./types";

export interface Difficulty {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** How many coins (the runner included) land in New Pairs after the tweet, and over how long. */
  deploys: [number, number];
  floodMs: number;
  /** How many bots snipe the right coin, and how fast after it appears. */
  snipers: [number, number];
  sniperReactMs: [number, number];
  /** DEV mode: when rival deployers land their coin, ms after the tweet. */
  rivalDeployMs: [number, number];
  rivalDeployers: [number, number];
  /** How many noise memes (distractor tweets) show up per round. */
  /** When look-alikes land, ms after the right coin. Easier levels give you a beat to see the real one first. */
  decoyDelayMs: [number, number];
  /** Extra image tweets with their own coins. Zero: the round tweet is the only big tweet. */
  distractors: [number, number];
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  paper: {
    id: "paper",
    label: "Paper Hands",
    blurb: "Slow bots and a thin flood. Learn the config rules first.",
    deploys: [2, 4],
    floodMs: 5000,
    snipers: [3, 6],
    sniperReactMs: [600, 1500],
    rivalDeployMs: [4000, 8000],
    rivalDeployers: [2, 4],
    decoyDelayMs: [300, 800],
    distractors: [0, 0],
  },
  trencher: {
    id: "trencher",
    label: "Trencher",
    blurb: "Busy boards and bots that punish hesitation.",
    deploys: [4, 7],
    floodMs: 4000,
    snipers: [6, 12],
    sniperReactMs: [300, 800],
    rivalDeployMs: [2000, 4500],
    rivalDeployers: [4, 8],
    decoyDelayMs: [300, 800],
    distractors: [0, 0],
  },
  sniper: {
    id: "sniper",
    label: "Sniper",
    blurb: "Real bot speed. 6-12 deploys in about 3 s, snipers at 0.14-0.42 s.",
    deploys: [6, 12],
    floodMs: 3000,
    snipers: [12, 20],
    sniperReactMs: [140, 420],
    rivalDeployMs: [1000, 2500],
    rivalDeployers: [8, 14],
    decoyDelayMs: [-150, 250],
    distractors: [0, 0],
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["paper", "trencher", "sniper"];
