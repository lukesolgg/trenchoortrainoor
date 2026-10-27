"use client";

import { memo, useState } from "react";
import type { TweetView } from "@/engine/types";
import { Art } from "./Art";
import { XIcon } from "./icons";
import { clockTime } from "./format";
import { usePausable } from "./hooks";

const AVATAR_BG = (hue: number) =>
  `radial-gradient(circle at 30% 25%, hsl(${hue} 70% 60%), hsl(${(hue + 50) % 360} 65% 28%))`;

/**
 * Authority accounts use a real profile picture if one is dropped in public/avatars/<handle>.jpg; anything missing
 * falls back to the gradient initial.
 */
function Avatar({ name, src, hue }: { name: string; src: string | null; hue: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[13px] font-bold text-white/90"
      style={{ background: AVATAR_BG(hue) }}
    >
      {name[0].toUpperCase()}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

const TweetCard = memo(function TweetCard({ t, wallStart }: { t: TweetView; wallStart: number }) {
  const { author } = t;
  return (
    <article
      className={`anim-tweet rounded-xl border bg-tk-card p-3 ${
        t.memeTweet ? "border-violet/60 shadow-[0_0_0_1px_rgba(139,92,246,.15)]" : "border-tk-line"
      }`}
    >
      <header className="flex items-center gap-2.5">
        <Avatar name={author.name} hue={author.hue} src={author.avatar ?? (author.authority ? `/avatars/${author.handle.toLowerCase()}.jpg` : null)} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-[13px] font-semibold ${author.authority ? "text-violet" : "text-ink"}`}>
              {author.name}
            </span>
            {author.verified && (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-buy" fill="currentColor" aria-label="verified">
                <path d="M12 1.8l2.5 1.9 3.1-.2 1 2.9 2.6 1.8-.9 3 .9 3-2.6 1.8-1 2.9-3.1-.2L12 22.2l-2.5-1.9-3.1.2-1-2.9-2.6-1.8.9-3-.9-3 2.6-1.8 1-2.9 3.1.2L12 1.8zm-1.2 13.4l5-5-1.2-1.2-3.8 3.8-1.8-1.8-1.2 1.2 3 3z" />
              </svg>
            )}
            <span className="tabular text-[11px] text-faint">{clockTime(wallStart + t.at)}</span>
          </div>
          <div className="text-[11px] text-dim">
            @{author.handle} · {author.followers}
          </div>
        </div>
      </header>
      <p className="mt-2.5 whitespace-pre-line text-[14px] leading-snug text-ink/95">
        {t.segments.map((s, i) =>
          s.hl ? (
            <mark key={i} className="rounded bg-pink/90 px-1 py-px font-medium text-white">
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      {t.art && (
        <Art art={t.art} className="mt-2.5 aspect-[16/10] w-full rounded-lg border border-tk-line" glyphSize={64} />
      )}
    </article>
  );
});

interface Props {
  tweets: TweetView[];
  wallStart: number;
  pauseOnHover: boolean;
  open: boolean;
  onToggle: () => void;
}

export function TweetFeed({ tweets, wallStart, pauseOnHover, open, onToggle }: Props) {
  const [hovered, setHovered] = useState(false);
  const paused = hovered && pauseOnHover;
  const { items, newCount } = usePausable(tweets, paused);

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden border-r border-tk-line bg-tk"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-tk-line px-3">
        {open && (
          <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-tight">
            <XIcon className="h-3 w-3" /> Tracker
          </h2>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="rounded px-1.5 text-[14px] text-dim hover:text-ink"
          title={open ? "Collapse feed" : "Expand feed"}
          aria-label={open ? "Collapse feed" : "Expand feed"}
        >
          {open ? "‹" : "›"}
        </button>
      </header>
      {open && (
        <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
          {items.map((t) => (
            <TweetCard key={t.id} t={t} wallStart={wallStart} />
          ))}
        </div>
      )}
      {paused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-2 text-[11px] font-semibold">
          <span className="rounded-full border border-line-hi bg-card-hi px-2.5 py-1 text-dim">Paused</span>
          {newCount > 0 && (
            <span className="rounded-full bg-amber px-2.5 py-1 text-black">{newCount} new ↑</span>
          )}
        </div>
      )}
    </aside>
  );
}
