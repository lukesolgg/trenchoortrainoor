"use client";

/** A labelled slider over a log scale (money, market caps) or a linear one, with the value shown on the right. */
export function Slider({
  label,
  value,
  min,
  max,
  log,
  step,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  log?: boolean;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const lmin = Math.log(Math.max(min, 1e-9));
  const lmax = Math.log(max);
  const toPos = (v: number) => (log ? (Math.log(Math.max(v, 1e-9)) - lmin) / (lmax - lmin) : (v - min) / (max - min));
  const fromPos = (p: number) => {
    const v = log ? Math.exp(lmin + p * (lmax - lmin)) : min + p * (max - min);
    return Math.max(min, Math.min(max, roundNice(v, step)));
  };
  return (
    <label className="block">
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-semibold text-faint">{label}</span>
        <span className="tabular font-extrabold text-ink">{format(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(Math.max(0, Math.min(1, toPos(value))) * 1000)}
        onChange={(e) => onChange(fromPos(Number(e.target.value) / 1000))}
        className="w-full accent-violet"
        aria-label={label}
      />
      {hint && <div className="-mt-0.5 text-[10.5px] leading-snug text-faint">{hint}</div>}
    </label>
  );
}

/** Round to `step`, or to two significant figures. */
export function roundNice(v: number, step?: number): number {
  if (step) return Math.round(v / step) * step;
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}
