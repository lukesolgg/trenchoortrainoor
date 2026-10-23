"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TweetSource } from "@/engine/types";
import { XIcon } from "./icons";

const AVATAR_BG = (hue: number) =>
  `radial-gradient(circle at 30% 25%, hsl(${hue} 70% 60%), hsl(${(hue + 50) % 360} 65% 28%))`;

/**
 * The X icon on a card. Hover shows the tweet the coin was deployed off.
 * The popover is portalled and fixed-positioned so the column's overflow never clips it.
 */
export function SourceBadge({ source }: { source: TweetSource | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  if (!source) {
    return (
      <span className="text-faint/50" title="No socials">
        <XIcon className="h-3 w-3" />
      </span>
    );
  }

  const open = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = 300;
    setPos({ x: Math.min(Math.max(8, r.left - 8), window.innerWidth - w - 8), y: Math.min(r.bottom + 8, window.innerHeight - 190) });
  };
  const { author } = source;

  return (
    <span
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={() => setPos(null)}
      onClick={(e) => e.stopPropagation()}
      className="cursor-help text-dim transition-colors hover:text-ink"
    >
      <XIcon className="h-3 w-3" />
      {pos &&
        createPortal(
          <div
            style={{ left: pos.x, top: pos.y }}
            className="pointer-events-none fixed z-50 w-[300px] rounded-xl border border-tk-line bg-tk-card p-3 shadow-2xl"
          >
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Deployed off this tweet</div>
            <div className="flex items-center gap-2.5">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white/90"
                style={{ background: AVATAR_BG(author.hue) }}
              >
                {author.name[0].toUpperCase()}
              </div>
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-1 text-[13px] font-semibold text-ink">
                  {author.name}
                  {author.verified && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3 text-buy" fill="currentColor" aria-label="verified">
                      <path d="M12 1.8l2.5 1.9 3.1-.2 1 2.9 2.6 1.8-.9 3 .9 3-2.6 1.8-1 2.9-3.1-.2L12 22.2l-2.5-1.9-3.1.2-1-2.9-2.6-1.8.9-3-.9-3 2.6-1.8 1-2.9 3.1.2L12 1.8zm-1.2 13.4l5-5-1.2-1.2-3.8 3.8-1.8-1.8-1.2 1.2 3 3z" />
                    </svg>
                  )}
                </div>
                <div className="text-[11px] text-dim">@{author.handle} · {author.followers}</div>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-snug text-ink/95">
              {source.segments.map((s, i) =>
                s.hl ? (
                  <mark key={i} className="rounded bg-pink/90 px-1 py-px font-medium text-white">
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}
