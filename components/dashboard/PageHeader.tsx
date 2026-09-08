import { cn } from '@/lib/utils'

/**
 * Cabeçalho único de página. Antes cada uma das 20 telas inventava o seu,
 * com h1 em text-lg — menor que o valor de um KPI card.
 */
export default function PageHeader({
  title, sub, actions, className,
}: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn('flex items-end justify-between gap-4 flex-wrap pb-6 border-b border-line', className)}>
      <div className="min-w-0">
        <h1 className="t-h1 text-fg">{title}</h1>
        {sub && <p className="t-sm text-muted mt-1.5">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{actions}</div>}
    </header>
  )
}
