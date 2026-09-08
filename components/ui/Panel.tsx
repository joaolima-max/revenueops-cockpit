import { cn } from '@/lib/utils'

/**
 * Superfície base do Cockpit. Um bloco visual = UM contorno.
 * Sem sombra em repouso: a separação vem do fio, não da elevação.
 */
export default function Panel({
  className, children, hover = false, padded = true, ...rest
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean; padded?: boolean }) {
  return (
    <div
      {...rest}
      className={cn(
        'bg-surface border border-line rounded-2xl',
        padded && 'p-5 sm:p-6',
        hover && 'transition-[border-color,box-shadow] duration-[380ms] ease-bp hover:border-line-2 hover:shadow-[var(--bp-shadow-hover)]',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Cabeçalho interno de painel: título + subtítulo + ações à direita. */
export function PanelHeader({
  title, sub, actions, className,
}: { title: string; sub?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 flex-wrap', className)}>
      <div className="min-w-0">
        <h2 className="t-h2 text-fg">{title}</h2>
        {sub && <p className="t-sm text-muted mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
