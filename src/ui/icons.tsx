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
