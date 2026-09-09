import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'accent' | 'pos' | 'warn' | 'alert' | 'neg'

/**
 * Cor comunica STATUS, nunca categoria. Segmento, modelo operacional e
 * estágio de funil usam o tom neutro — só atingimento e severidade coloriem.
 */
const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--bp-hover)] text-muted border-line',
  accent: 'bg-accent/10 text-accent-soft border-accent/25',
  pos: 'bg-pos/10 text-pos border-pos/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  alert: 'bg-alert/10 text-alert border-alert/25',
  neg: 'bg-neg/10 text-neg border-neg/25',
}

export default function Badge({
  tone = 'neutral', children, className,
}: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 t-label whitespace-nowrap',
      TONE[tone], className
    )}>
      {children}
    </span>
  )
}

/** Ponto de status — losango de 5px, o mesmo motivo do .chero__foot b::before. */
export function Dot({ tone = 'neutral' }: { tone?: BadgeTone }) {
  const c = {
    neutral: 'bg-subtle', accent: 'bg-accent',
    pos: 'bg-pos', warn: 'bg-warn', alert: 'bg-alert', neg: 'bg-neg',
  }[tone]
  return <span aria-hidden className={cn('w-[5px] h-[5px] rotate-45 rounded-[1px] flex-none', c)} />
}
