import { cn } from '@/lib/utils'

/**
 * Ausência de dado é um estado de primeira classe, não um zero.
 * Espelha .mcard__v.is-empty do site: cor --subtle, nunca um número falso.
 */
export default function EmptyState({
  title, description, action, compact = false, className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-14', className)}>
      <span className="bp-rule mb-5" aria-hidden />
      <p className={cn('text-fg font-medium', compact ? 't-sm' : 't-body')}>{title}</p>
      {description && <p className="t-sm text-subtle mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Valor ausente inline — substitui "0" e "—" soltos. */
export function NoData({ label = 'sem dados' }: { label?: string }) {
  return <span className="t-sm font-normal text-subtle">{label}</span>
}
