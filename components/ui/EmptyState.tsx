import { cn } from '@/lib/utils'

/**
 * ESTADOS COMO PARTE DO DESIGN, não como mensagem provisória.
 * Ausência de dado é um estado de primeira classe — nunca um zero.
 */
export default function EmptyState({
  title, description, action, compact = false, tone = 'neutral', className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  compact?: boolean
  tone?: 'neutral' | 'error'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6',
      compact ? 'py-8' : 'py-14', className)}>
      <span aria-hidden className={cn('bp-rule mb-5', tone === 'error' && '!bg-neg')} />
      <p className={cn('font-medium', compact ? 't-sm' : 't-body',
        tone === 'error' ? 'text-neg' : 'text-fg')}>{title}</p>
      {description && <p className="t-sm text-subtle mt-1.5 max-w-md leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Valor ausente inline — substitui "0" e "—" soltos. */
export function NoData({ label = 'sem dados' }: { label?: string }) {
  return <span className="t-sm font-normal text-subtle">{label}</span>
}

/** Aviso inline: erro, sucesso ou atenção dentro de um formulário/painel. */
export function Alert({
  tone = 'error', children, className,
}: { tone?: 'error' | 'success' | 'warn' | 'info'; children: React.ReactNode; className?: string }) {
  const estilo = {
    error: 'bg-neg/10 border-neg/25 text-neg',
    success: 'bg-pos/10 border-pos/25 text-pos',
    warn: 'bg-warn/10 border-warn/25 text-warn',
    info: 'bg-accent/10 border-accent/25 text-accent-soft',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 t-sm', estilo, className)}>
      <span aria-hidden className="w-[5px] h-[5px] rotate-45 rounded-[1px] bg-current flex-none mt-1.5" />
      <span className="flex-1">{children}</span>
    </div>
  )
}
