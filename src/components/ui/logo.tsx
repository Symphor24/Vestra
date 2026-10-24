/** Vestra symbol: a price line that dips and recovers, drawn as a V. The lime stroke is the movement Vestra reads. */
export function LogoMark({ className = "size-8", tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {tile && <rect width="32" height="32" rx="9" fill="#17243A" />}
      <path d="M7.5 9.5 L16 23" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M16 23 L24.5 9.5" stroke="#C8F169" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="24.5" cy="9.5" r="2.6" fill="#C8F169" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[19px] font-semibold tracking-[-0.03em]">vestra</span>
    </span>
  );
}
