/**
 * pump.fun-style constant-product bonding curve.
 * Bots and the player all trade through this, so price impact and queue
 * position come out of the maths instead of being faked.
 */
export const INIT_VSOL = 30;
export const INIT_VTOK = 1_073_000_000;
export const REAL_TOK_TOTAL = 793_100_000;
export const SUPPLY = 1_000_000_000;
export const FEE = 0.01;
export const SOL_USD = 104;

export interface Curve {
  vSol: number;
  vTok: number;
  realSol: number;
  realTok: number;
}

export function newCurve(): Curve {
  return { vSol: INIT_VSOL, vTok: INIT_VTOK, realSol: 0, realTok: 0 };
}

export function mcSol(c: Curve): number {
  return (c.vSol / c.vTok) * SUPPLY;
}

export function progress(c: Curve): number {
  return Math.min(1, c.realTok / REAL_TOK_TOTAL);
}

export function isComplete(c: Curve): boolean {
  return c.realTok >= REAL_TOK_TOTAL - 1;
}

export interface BuyResult {
  curve: Curve;
  tokens: number;
  /** SOL actually spent. Less than requested if the curve completes. */
  spent: number;
}

export function buy(c: Curve, sol: number): BuyResult {
  if (sol <= 0 || isComplete(c)) return { curve: c, tokens: 0, spent: 0 };
  const k = c.vSol * c.vTok;
  let net = sol * (1 - FEE);
  let newVSol = c.vSol + net;
  let newVTok = k / newVSol;
  let tokens = c.vTok - newVTok;
  let spent = sol;

  const remaining = REAL_TOK_TOTAL - c.realTok;
  if (tokens > remaining) {
    tokens = remaining;
    newVTok = c.vTok - tokens;
    newVSol = k / newVTok;
    net = newVSol - c.vSol;
    spent = net / (1 - FEE);
  }
  return {
    curve: {
      vSol: newVSol,
      vTok: newVTok,
      realSol: c.realSol + net,
      realTok: c.realTok + tokens,
    },
    tokens,
    spent,
  };
}

export interface SellResult {
  curve: Curve;
  sol: number;
}

export function sell(c: Curve, tokens: number): SellResult {
  if (tokens <= 0) return { curve: c, sol: 0 };
  const k = c.vSol * c.vTok;
  const newVTok = c.vTok + tokens;
  const newVSol = k / newVTok;
  const gross = c.vSol - newVSol;
  const sol = gross * (1 - FEE);
  return {
    curve: {
      vSol: newVSol,
      vTok: newVTok,
      realSol: Math.max(0, c.realSol - gross),
      realTok: Math.max(0, c.realTok - tokens),
    },
    sol,
  };
}

export const toUsd = (sol: number) => sol * SOL_USD;

/** Market cap (SOL) at the moment the curve completes and the coin migrates. */
export const MIGRATION_MC_SOL = (() => {
  const vTok = INIT_VTOK - REAL_TOK_TOTAL;
  const vSol = (INIT_VSOL * INIT_VTOK) / vTok;
  return (vSol / vTok) * SUPPLY;
})();
export const MIGRATION_MC_USD = MIGRATION_MC_SOL * SOL_USD;
/** After a coin migrates, buys are paused for this long. */
export const MIGRATION_LOCK_MS = 3000;
