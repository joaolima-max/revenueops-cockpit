import { cn } from '@/lib/utils'
import type { Figura, Variacao } from '@/lib/format-financeiro'
import { NoData } from './EmptyState'

/**
 * HIERARQUIA DE UM NÚMERO
 *   1. valor principal — display tabular, alto contraste
 *   2. unidade         — meio-tom, meio tamanho, separada do valor
 *   3. variação        — segundo nível, com cor semântica
 *   4. contexto        — terceiro nível, o período ou a origem
 *
 * O valor cheio vai no `title`: "R$ 159,6 mi" na tela, "R$ 159.592.207,57" no
 * hover. Nada é escondido, só hierarquizado.
 */
export default function Figure({
  figura, size = 'md', tone = 'default', className,
}: {
  figura: Figura | null
  size?: 'hero' | 'md' | 'sm'
  tone?: 'default' | 'accent'
  className?: string
}) {
  if (!figura) return <NoData />

  const escala = size === 'hero' ? 't-hero' : size === 'sm' ? 't-figure-sm' : 't-figure'

  return (
    <span
      title={figura.completo}
      className={cn(
        escala, 'inline-flex items-baseline gap-[0.28em] bp-truncate',
        tone === 'accent' ? 'text-accent-soft' : 'text-fg',
        className
      )}
    >
      {figura.prefixo && (
        <span className="text-[0.46em] font-medium text-subtle tracking-normal">{figura.prefixo}</span>
      )}
      <span>{figura.valor}</span>
      {figura.unidade && (
        <span className="text-[0.46em] font-medium text-muted tracking-normal">{figura.unidade}</span>
      )}
    </span>
  )
}

/** Variação percentual — segundo nível da hierarquia. */
export function Delta({ v, sufixo, className }: { v: Variacao | null; sufixo?: string; className?: string }) {
  if (!v) return null
  const cor = v.direcao === 'up' ? 'text-pos' : v.direcao === 'down' ? 'text-neg' : 'text-subtle'
  const seta = v.direcao === 'up' ? '↑' : v.direcao === 'down' ? '↓' : '→'
  return (
    <span className={cn('inline-flex items-center gap-1 t-sm font-medium tabular-nums', cor, className)}>
      <span aria-hidden className="text-[0.9em] leading-none">{seta}</span>
      {v.rotulo}
      {sufixo && <span className="text-subtle font-normal">{sufixo}</span>}
    </span>
  )
}

/** Contexto — terceiro nível. Período, origem, denominador. */
export function Contexto({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('t-sm text-subtle', className)}>{children}</span>
}
