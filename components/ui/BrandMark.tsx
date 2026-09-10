/**
 * MARCA OFICIAL BASS PAGO
 *
 * Geometria portada literalmente do site institucional — `const BRANDMARK`
 * em basspago-site/src/core.js. Mesmo viewBox, mesmo raio, mesmos nós.
 * Nada aqui foi redesenhado; o arquivo equivalente vive em
 * public/brandmark.svg (fundo claro) e public/brandmark-dark.svg (escuro).
 *
 * Por que inline e não <img src="/brandmark.svg">: o traço herda currentColor,
 * então a marca acompanha a cor do texto onde é aplicada — é assim que o site
 * resolve (ele injeta o mesmo SVG inline). Um <img> não herda currentColor e
 * exigiria trocar de arquivo a cada contexto.
 */
export default function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Bass Pago"
      focusable="false"
    >
      <rect x="2.9" y="2.9" width="18.2" height="18.2" rx="5.2"
        fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 15.6 16 8.4"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="15.6" r="2.15" fill="currentColor" />
      {/* O nó de accent troca de tom entre claro e escuro, como no site. */}
      <circle cx="16" cy="8.4" r="2.15" fill="var(--bp-brand-node)" />
    </svg>
  )
}

/** Assinatura completa: marca + wordmark. Proporções do `.brand` do site. */
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
