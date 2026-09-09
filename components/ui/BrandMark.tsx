/**
 * Marca institucional da Bass Pago — a mesma do favicon do site:
 * quadrado arredondado, diagonal e dois nós, o superior em accent.
 *
 * Substitui o "swoosh" com gradiente #2563EB→#00E5A0 que estava na sidebar,
 * no login e no loading: era outro logo, e #00E5A0 não existe na paleta.
 */
export default function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect x="2.9" y="2.9" width="18.2" height="18.2" rx="5.2"
        fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 15.6 16 8.4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="15.6" r="2.15" fill="currentColor" />
      <circle cx="16" cy="8.4" r="2.15" fill="#2F6BFF" />
    </svg>
  )
}

/** Assinatura completa: marca + wordmark. */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-fg">
      <BrandMark size={compact ? 22 : 24} className="flex-none" />
      {!compact && (
        <span className="min-w-0">
          <span className="block font-display text-[0.9375rem] font-semibold tracking-[-0.02em] leading-none">Bass Pago</span>
          <span className="block t-label text-subtle mt-1">RevOps</span>
        </span>
      )}
    </span>
  )
}
