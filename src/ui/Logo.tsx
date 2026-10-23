/** GnGm mark: a bolt in a rounded square, plus the wordmark. Original artwork. */
export function Logo({ size = 28, word = true }: { size?: number; word?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="grid place-items-center rounded-lg bg-gradient-to-br from-up to-[#1a8f55] text-black"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" style={{ width: size * 0.58, height: size * 0.58 }} fill="currentColor" aria-hidden>
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      </div>
      {word && (
        <span className="text-[19px] font-black leading-none tracking-tight text-ink">
          Gn<span className="text-up">Gm</span>
        </span>
      )}
    </div>
  );
}
