import type { ArtSpec } from "@/engine/types";

interface Props {
  art: ArtSpec;
  className?: string;
  /** Font size of the glyph in px. Defaults to a fraction of the box. */
  glyphSize?: number;
}

/**
 * Placeholder art: a gradient tile with a glyph. Swaps to a real image as
 * soon as the meme pack provides `src`.
 */
export function Art({ art, className = "", glyphSize }: Props) {
  if (art.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={art.src} alt="" className={`object-cover ${className}`} draggable={false} />;
  }
  const { hue } = art;
  return (
    <div
      aria-hidden
      className={`grid place-items-center select-none ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 25%, hsl(${hue} 75% 58%), hsl(${(hue + 40) % 360} 70% 26%) 70%, hsl(${(hue + 60) % 360} 60% 14%))`,
        fontSize: glyphSize,
      }}
    >
      <span style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }}>{art.glyph}</span>
    </div>
  );
}
