import { PanelHeader } from '@/components/ui/Panel'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import { NoData } from '@/components/ui/EmptyState'
import { figuraMoeda, figuraQuantidade, figuraPercentual } from '@/lib/format-financeiro'
import { META_TIPO_LABELS } from '@/lib/utils'
import { RITMO_LABEL, type AvaliacaoCompleta, type Ritmo } from '@/lib/metas'

const TOM_RITMO: Record<Ritmo, BadgeTone> = {
  ACIMA: 'pos',
  NO_RITMO: 'accent',
  ABAIXO: 'neg',
  INDETERMINADO: 'neutral',
}

/** Formata pela UNIDADE da meta — nunca pelo tipo. Valores sempre por extenso. */
function fmt(unidade: AvaliacaoCompleta['unidade'], valor: number): string {
  if (unidade === 'PERCENTUAL') return figuraPercentual(valor, 2).completo
  if (unidade === 'QUANTIDADE') return figuraQuantidade(valor).completo
  return figuraMoeda(valor).completo
}

/**
 * Barra de PROJETADO × REALIZADO.
 *
 * Duas informações numa régua só:
 *   * a barra preenchida é o realizado contra a meta;
 *   * o tique é onde o realizado DEVERIA estar hoje, dado o tempo decorrido.
 *
 * É o tique que transforma "35% da meta" em uma leitura: 35% no dia 10 está
 * adiantado; 35% no dia 28 está atrasado. Sem ele, a barra de um mês em curso
 * sempre parece ruim.
 */
function Regua({ a }: { a: AvaliacaoCompleta }) {
  const pct = a.cumprimento === null ? 0 : Math.max(0, Math.min(a.cumprimento, 100))
  const marca = a.pacing.encerrado ? null : Math.min(a.pacing.decorrido * 100, 100)

  const cor = a.situacao === 'SEM_REALIZADO' ? 'bg-surface-2'
    : a.positivo ? 'bg-pos'
    : a.pacing.ritmo === 'NO_RITMO' ? 'bg-warn'
    : 'bg-neg'

  return (
    <div className="relative h-1.5 bg-surface-2 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-[width] duration-[380ms] ease-bp ${cor}`}
        style={{ width: `${pct}%` }} />
      {marca !== null && marca > 0 && marca < 100 && (
        <span
          aria-hidden
          title="Onde o realizado deveria estar hoje"
          className="absolute top-0 bottom-0 w-px bg-fg/70"
          style={{ left: `${marca}%` }}
        />
      )}
    </div>
  )
}

/**
 * ACOMPANHAMENTO DE METAS.
 *
 * Responde quatro perguntas numa composição só, em vez de quatro cards
 * gigantes repetindo o mesmo número de formas diferentes:
 *
 *   1. Projetado × Realizado — a régua, com o tique do esperado até hoje
 *   2. Progresso da meta     — o percentual de cumprimento
 *   3. Pacing / ritmo        — a projeção de fechamento, como selo
 *   4. Atingimento por KPI   — uma célula por indicador, lado a lado
 *
 * Toda a matemática vem de `avaliarCompleto` em lib/metas.ts. Este componente
 * não calcula nada: só escolhe como mostrar. É o que garante que a tela de
 * Metas e o Cockpit nunca discordem sobre o mesmo indicador.
 *
 * MENOR É MELHOR já vem resolvido de lá — `positivo`, `cumprimento` e `ritmo`
 * saem invertidos quando a direção pede, e aqui não há nenhuma exceção por
 * tipo de indicador.
 */
export default function MetaAnalytics({
  avaliacoes, periodoLabel,
}: {
  avaliacoes: AvaliacaoCompleta[]
  periodoLabel: string
}) {
  if (avaliacoes.length === 0) return null

  const comRealizado = avaliacoes.filter((a) => a.realizado !== null)
  const atingidas = comRealizado.filter((a) => a.positivo).length
  const emRisco = comRealizado.filter((a) => !a.positivo && a.pacing.ritmo === 'ABAIXO').length

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Acompanhamento de metas"
        sub={
          `${periodoLabel} · ${atingidas} de ${comRealizado.length || avaliacoes.length} no alvo`
          + (emRisco > 0 ? ` · ${emRisco} abaixo do ritmo` : '')
          + ' · realizado apurado do lançamento diário'
        }
      />

      <HairlineGrid cols={comRealizado.length > 3 || avaliacoes.length > 3 ? 3 : 2}>
        {avaliacoes.map((a) => {
          const rotulo = META_TIPO_LABELS[a.tipo] ?? a.tipo
          const semDado = a.realizado === null

          return (
            <HairlineCell key={a.tipo} className="gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="t-label text-subtle bp-truncate" title={rotulo}>{rotulo}</p>
                {a.direcao === 'MENOR_MELHOR' && (
                  <span className="t-label text-subtle/70 flex-none" title="Menor é melhor">↓ melhor</span>
                )}
              </div>

              {/* 1. Realizado — o número que importa. */}
              {semDado ? <NoData /> : (
                <p className={`t-figure-sm tabular-nums ${a.positivo ? 'text-pos' : 'text-fg'}`}>
                  {fmt(a.unidade, a.realizado!)}
                </p>
              )}

              {/* 2. Meta e gap. */}
              <p className="t-sm text-subtle">
                meta {fmt(a.unidade, a.meta)}
                {a.gap !== null && a.gap > 0 && (
                  <span className="text-neg"> · faltam {fmt(a.unidade, a.gap)}</span>
                )}
                {a.gap === 0 && !semDado && <span className="text-pos"> · no alvo</span>}
              </p>

              <div className="mt-auto pt-2 space-y-2">
                {/* 3. Projetado × realizado. */}
                <Regua a={a} />

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={
                    semDado ? 't-mono text-subtle'
                      : a.positivo ? 't-mono text-pos'
                      : (a.cumprimento ?? 0) >= 70 ? 't-mono text-warn' : 't-mono text-neg'
                  }>
                    {a.cumprimento === null ? '—' : `${a.cumprimento.toFixed(0)}% de cumprimento`}
                  </span>

                  {/* 4. Pacing — só faz sentido com o mês em curso. */}
                  {!a.pacing.encerrado && a.pacing.ritmo !== 'INDETERMINADO' && (
                    <Badge tone={TOM_RITMO[a.pacing.ritmo]}>{RITMO_LABEL[a.pacing.ritmo]}</Badge>
                  )}
                </div>

                {/* Projeção de fechamento: a leitura que o pacing habilita. */}
                {!a.pacing.encerrado && a.pacing.projecao !== null && (
                  <p className="t-label text-subtle">
                    projeção de fechamento {fmt(a.unidade, a.pacing.projecao)}
                    {' · '}
                    {(a.pacing.decorrido * 100).toFixed(0)}% do mês decorrido
                  </p>
                )}
              </div>
            </HairlineCell>
          )
        })}
      </HairlineGrid>
    </section>
  )
}
