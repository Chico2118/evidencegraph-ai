// Inline copy of public/favicon.svg so the header mark inherits theme colors
// and needs no extra request. Keep the two in sync if the artwork changes.

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="EvidenceGraph AI"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path
        d="M18 44 L32 20 L46 44 Z"
        fill="none"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="44" r="6" fill="hsl(var(--primary-foreground))" />
      <circle cx="46" cy="44" r="6" fill="hsl(var(--primary-foreground))" />
      <circle cx="32" cy="20" r="9" fill="hsl(var(--primary-foreground))" />
      <path
        d="M27.8 20.2 l3.2 3.2 l5.4-6.2"
        fill="none"
        className="stroke-primary"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
