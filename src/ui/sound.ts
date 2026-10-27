"use client";

import { useUi } from "@/store/ui";

/** Tiny WebAudio cues: no files to load, nothing to download. Silent until the first user gesture unlocks audio. */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || useUi.getState().muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  /** The round's tweet just landed: two bright pings. */
  tweet() {
    tone(1046, 0, 0.09, "triangle", 0.25);
    tone(1568, 0.09, 0.14, "triangle", 0.25);
  },
  /** Right coin bought: quick rising arpeggio. */
  hit() {
    tone(659, 0, 0.08, "square", 0.08);
    tone(880, 0.07, 0.08, "square", 0.08);
    tone(1319, 0.14, 0.18, "square", 0.08);
  },
  /** Wrong coin or false start: a short low buzz. */
  miss() {
    tone(180, 0, 0.28, "sawtooth", 0.12, 90);
  },
  /** Countdown tick. */
  tick() {
    tone(740, 0, 0.05, "sine", 0.12);
  },
};
