import { cn } from '@/lib/utils'
import { NoData } from './EmptyState'

/**
 * Célula de indicador. Espelha .mcard do site institucional:
 * kicker uppercase → valor tabular → nota → sparkline opcional.
 *
 * O valor é SEMPRE branco. O accent marca apenas o indicador primário —
 * oito cores diferentes de valor lêem como aleatório, não como hierarquia.
 */
export default function StatTile({
  label, value, format, note, primary = false, spark, className,
}: {
  label: string
  value: number | null
  format: (n: number) => string
  note?: string
  primary?: boolean
  spark?: number[]
  className?: string
}) {
  const empty = value === null
  const max = spark && spark.length ? Math.max(...spark, 1) : 1

  return (
    <div className={cn('group bg-surface p-5 flex flex-col gap-3 transition-colors duration-[380ms] ease-bp hover:bg-surface-2', className)}>
      <p className="t-label text-subtle">{label}</p>

      <p className={cn('t-figure', empty ? 'text-subtle' : primary ? 'text-accent-soft' : 'text-fg')}>
        {empty ? <NoData /> : format(value)}
      </p>

      {note && <p className="t-sm text-subtle leading-snug">{note}</p>}

      {spark && spark.length > 1 && (
        <div className="flex items-end gap-[3px] h-7 mt-auto pt-1" aria-hidden>
          {spark.map((v, i) => (
            <i
              key={i}
              className={cn(
                'flex-1 rounded-[1px] transition-colors duration-[380ms] ease-bp',
                i === spark.length - 1
                  ? 'bg-accent/60 group-hover:bg-accent'
                  : 'bg-white/[0.09] group-hover:bg-accent/30'
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
  const tone = pct === null ? 'bg-white/15' : pct >= 100 ? 'bg-pos' : pct >= 70 ? 'bg-warn' : 'bg-neg'
  return (
    <div className="h-0.5 w-full bg-line rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-[width] duration-[800ms] ease-bp', tone)}
        style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%` }}
      />
    </div>
  )
}
