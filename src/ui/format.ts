export function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e4) return `$${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export function sol(n: number, dp = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-GB", { hour12: false });
}

/** Compact token amounts: 12.4M, 830K, 912. */
export function tokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/** Percent change, compact for huge moves: +48.7K%. */
export function pct(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(2);
  return `${n >= 0 ? "+" : "-"}${s}%`;
}

export function signed(n: number, dp = 2): string {
  return `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(dp)}`;
}
