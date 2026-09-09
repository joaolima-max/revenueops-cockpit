'use client'

import { cn } from '@/lib/utils'
import { variacao } from '@/lib/format-financeiro'
import type { ReactNode } from 'react'
import type { TooltipContentProps } from 'recharts'

/**
 * TOOLTIP ÚNICO DOS GRÁFICOS
 *
 * Além do valor do ponto, mostra a variação contra o ponto ANTERIOR da mesma
 * série — informação derivada dos dados já carregados, não inventada. É o que
 * transforma "quanto foi" em "como estamos indo".
 */
export interface LinhaTooltip {
  nome: string
  valor: number | null
  cor: string
  /** Valor do mesmo indicador no ponto anterior, para calcular a variação. */
  anterior?: number | null
}

export function TooltipCard({
  titulo, linhas, formatar, nota,
}: {
  titulo: string
  linhas: LinhaTooltip[]
  formatar: (n: number) => string
  nota?: string
}) {
  return (
    <div className="rounded-xl border border-line-2 bg-surface px-3.5 py-3 shadow-[var(--bp-shadow-overlay)] min-w-[11rem]">
      <p className="t-label text-subtle mb-2.5">{titulo}</p>
      <div className="space-y-2">
        {linhas.map((l) => {
          const v = l.valor !== null && l.anterior != null ? variacao(l.valor, l.anterior) : null
          return (
            <div key={l.nome} className="flex items-baseline justify-between gap-4">
              <span className="inline-flex items-center gap-2 t-sm text-muted whitespace-nowrap">
                <span aria-hidden className="w-2 h-[3px] rounded-full flex-none" style={{ background: l.cor }} />
                {l.nome}
              </span>
              <span className="text-right">
                <span className="block t-sm font-medium text-fg t-num">
                  {l.valor === null ? 'sem dados' : formatar(l.valor)}
                </span>
                {v && (
                  <span className={cn(
                    'block text-[0.6875rem] tabular-nums leading-tight mt-0.5',
                    v.direcao === 'up' ? 'text-pos' : v.direcao === 'down' ? 'text-neg' : 'text-subtle'
                  )}>
                    {v.rotulo} vs. anterior
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {nota && <p className="t-mono text-subtle mt-2.5 pt-2.5 border-t border-line">{nota}</p>}
    </div>
  )
}

/**
 * Adapta o payload do Recharts para o TooltipCard, buscando o ponto anterior
 * no array original para calcular a variação.
 */
export function makeTooltip<T extends Record<string, unknown>>(
  dados: T[],
  chaveRotulo: keyof T,
  series: Array<{ key: keyof T; nome: string; cor: string }>,
  formatar: (n: number) => string,
) {
  function Conteudo({ active, label }: TooltipContentProps): ReactNode {
    if (!active || label == null) return null
    const i = dados.findIndex((d) => d[chaveRotulo] === label)
    if (i < 0) return null
    const ponto = dados[i]
    const anterior = i > 0 ? dados[i - 1] : null

    return (
      <TooltipCard
        titulo={String(label)}
        formatar={formatar}
        linhas={series.map((s) => ({
          nome: s.nome,
          cor: s.cor,
          valor: typeof ponto[s.key] === 'number' ? (ponto[s.key] as number) : null,
          anterior: anterior && typeof anterior[s.key] === 'number' ? (anterior[s.key] as number) : null,
        }))}
      />
    )
  }
  return Conteudo
}
