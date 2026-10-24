const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const XIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
  </svg>
);
export const HoldersIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5" />
    <path d="M16 5.2a3 3 0 010 5.6M18 15.4c1.8.6 2.7 2 3 4.6" />
  </svg>
);
export const DevIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M7 14a4 4 0 112.5-7.1A4 4 0 0116 8a3.5 3.5 0 011 6.9V19H7v-5z" />
    <path d="M7 16.5h10" />
  </svg>
);
export const ProIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
  </svg>
);
export const CopyIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg {...base} className={className}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 012-2h9" />
  </svg>
);
export const BoltIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);

/** The Solana mark (official three-bar logo, brand gradient). Sized by font size by default so it sits inline with numbers. */
export const SolIcon = ({ className = "inline-block h-[0.85em] w-[0.85em] align-[-0.06em]" }: { className?: string }) => (
  <svg viewBox="0 0 397.7 311.7" className={className} aria-label="SOL" role="img">
    <defs>
      <linearGradient id="sol-a" x1="360.88" y1="351.46" x2="141.21" y2="-69.29" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#00ffa3" />
        <stop offset="1" stopColor="#dc1fff" />
      </linearGradient>
    </defs>
    <path fill="url(#sol-a)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" />
    <path fill="url(#sol-a)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
    <path fill="url(#sol-a)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" />
  </svg>
);

const small = "h-3.5 w-3.5";
/** Slippage: two diverging arrows. */
export const SlipIcon = ({ className = small }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M4 17l6-6 4 4 6-7" />
    <path d="M15 8h5v5" />
  </svg>
);
/** Priority fee: fuel pump. */
export const GasIcon = ({ className = small }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M4 20V5a1 1 0 011-1h8a1 1 0 011 1v15M3 20h12M6 8h6" />
    <path d="M14 10h2a2 2 0 012 2v4a1.5 1.5 0 003 0V9l-3-3" />
  </svg>
);
/** Tip: coin. */
export const TipIcon = ({ className = small }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="8" />
    <path d="M14.5 9.5c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4 0 1.1-1 1.9-2.5 1.9-1.1 0-2-.4-2.5-1.2M12 7v1.3M12 15.7V17" />
  </svg>
);
/** MEV protection off: shield with a slash. */
export const ShieldOffIcon = ({ className = small }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M4 4l16 16" />
  </svg>
);
