/** Decorative pitch markings, the one recurring visual motif. Always aria-hidden. */
export function Pitch({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="10" y="10" width="380" height="240" rx="2" />
        <line x1="200" y1="10" x2="200" y2="250" />
        <circle cx="200" cy="130" r="38" />
        <circle cx="200" cy="130" r="2" fill="currentColor" />
        <rect x="10" y="70" width="58" height="120" />
        <rect x="10" y="102" width="20" height="56" />
        <rect x="332" y="70" width="58" height="120" />
        <rect x="370" y="102" width="20" height="56" />
        <path d="M68 108 A30 30 0 0 1 68 152" />
        <path d="M332 108 A30 30 0 0 0 332 152" />
      </g>
    </svg>
  );
}

/** Navy field with pitch lines and a soft lime haze: Vestra's immersive backdrop (reference A). */
export function Field({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`relative isolate overflow-hidden bg-hero text-hero-text ${className}`}>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_80%_0%,rgb(200_241_105/0.18),transparent_55%),radial-gradient(90%_70%_at_0%_100%,rgb(59_130_246/0.22),transparent_60%)]" />
      <Pitch className="absolute inset-0 -z-10 size-full text-white/[0.07]" />
      {children}
    </div>
  );
}
