import { cn } from '@/lib/utils'
import type { Figura, Variacao } from '@/lib/format-financeiro'
import Figure, { Delta } from './Figure'

/**
 * Célula de indicador. Hierarquia em quatro níveis:
 *   1. valor    — display tabular, alto contraste, unidade destacada à parte
 *   2. variação — segundo nível, cor semântica
 *   3. contexto — terceiro nível (período, denominador, origem)
 *   4. sparkline— quarto nível, só forma, sem eixo
 *
 * O valor é sempre de alto contraste. O accent marca apenas o KPI primário —
 * oito cores de valor diferentes lêem como aleatório, não como hierarquia.
 */
export default function StatTile({
  label, figura, delta, note, primary = false, spark, size = 'md', className,
}: {
  label: string
  /** null = ausência de dado. Nunca substituir por zero. */
  figura: Figura | null
  delta?: Variacao | null
  note?: string
  primary?: boolean
  spark?: number[]
  size?: 'md' | 'sm'
  className?: string
}) {
  const max = spark && spark.length ? Math.max(...spark, 1) : 1

  return (
    <div className={cn(
      'group bg-surface p-5 flex flex-col gap-2.5',
      'transition-colors duration-[380ms] ease-bp hover:bg-surface-2',
      className
    )}>
      <p className="t-label text-subtle">{label}</p>

      <Figure figura={figura} size={size === 'sm' ? 'sm' : 'md'} tone={primary ? 'accent' : 'default'} />

      {(delta || note) && (
        <div className="flex items-baseline gap-2 flex-wrap min-h-[1.125rem]">
          {delta && <Delta v={delta} />}
          {note && <span className="t-sm text-subtle">{note}</span>}
        </div>
      )}

      {spark && spark.length > 1 && (
        <div className="flex items-end gap-[3px] h-7 mt-auto pt-1" aria-hidden>
          {spark.map((v, i) => (
            <i
              key={i}
              className={cn(
                'flex-1 rounded-[1px] transition-colors duration-[380ms] ease-bp',
                i === spark.length - 1
                  ? 'bg-accent/60 group-hover:bg-accent'
                  : 'bg-line-2 group-hover:bg-accent/30'
              )}
              style={{ height: `${Math.max((v / max) * 100, 6)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Barra de atingimento de meta — trilho em fio, preenchimento semântico. */
export function MetaBar({ pct }: { pct: number | null }) {
  const tone = pct === null ? 'bg-line-2' : pct >= 100 ? 'bg-pos' : pct >= 70 ? 'bg-warn' : 'bg-neg'
  return (
    <div className="h-1 w-full bg-line rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-[width] duration-[800ms] ease-bp', tone)}
        style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%` }}
      />
    </div>
  )
}
