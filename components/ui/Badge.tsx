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
  tone = 'neutral', children, className, title, truncar,
}: {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
  /**
   * Texto completo no hover. Obrigatório na prática quando `truncar` está
   * ligado: um rótulo cortado sem tooltip esconde informação.
   */
  title?: string
  /**
   * Teto de largura com reticências.
   *
   * O badge já era `whitespace-nowrap`, mas sem teto: um segmento como
   * "Instituições de Pagamento" esticava o card do Pipeline e empurrava os
   * outros elementos. Agora corta e o hover mostra o nome inteiro.
   *
   * `true` usa o teto padrão; uma classe (`max-w-[7rem]`) ajusta caso a caso.
   */
  truncar?: boolean | string
}) {
  const teto = truncar === true ? 'max-w-[9rem]' : truncar || undefined

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 t-label whitespace-nowrap',
        // `overflow-hidden` + `text-ellipsis` só cortam com largura limitada —
        // e `min-w-0` é o que permite o flex item encolher até o teto.
        teto && 'min-w-0 overflow-hidden text-ellipsis',
        teto,
        TONE[tone], className
      )}
    >
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
