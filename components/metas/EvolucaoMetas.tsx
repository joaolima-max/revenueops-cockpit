import { PanelHeader } from '@/components/ui/Panel'
import Panel from '@/components/ui/Panel'
import { NoData } from '@/components/ui/EmptyState'
import { META_TIPO_LABELS, formatMesRef } from '@/lib/utils'

/**
 * COMPARAÇÃO HISTÓRICA — o cumprimento de cada meta, mês a mês.
 *
 * A pergunta que a tela de Metas não respondia: "estamos melhorando?". O
 * painel de acompanhamento mostra o mês corrente em detalhe; este mostra a
 * trajetória.
 *
 * ── O QUE SE COMPARA ────────────────────────────────────────────────────
 *
 * O CUMPRIMENTO (% da meta), não o valor realizado. Dois motivos:
 *
 *   1. as metas mudam de mês a mês — comparar R$ 400 mil contra R$ 500 mil não
 *      diz se o mês foi bom, diz que o alvo subiu;
 *   2. indicadores de unidades diferentes (reais, contagem, percentual) só são
 *      comparáveis na mesma régua, e "% da meta" é essa régua.
 *
 * MENOR É MELHOR já vem resolvido de `avaliarMeta`: um MED de 1,5% contra
 * alvo de 2% aparece como cumprimento acima de 100%, igual a um TPV que
 * superou o alvo. Nenhuma exceção por tipo de indicador aqui.
 *
 * Mês SEM META cadastrada fica VAZIO, e mês com meta mas sem realizado fica
 * vazio também — são coisas diferentes de "cumprimento zero", e pintar zero
 * inventaria um fracasso que não houve.
 */

export interface PontoMeta {
  periodo: string
  /** Null = sem meta cadastrada, ou sem realizado apurado. */
  cumprimento: number | null
}

export interface SerieMeta {
  tipo: string
  pontos: PontoMeta[]
}

/** Cor pela faixa de cumprimento — a mesma convenção das réguas. */
function tom(pct: number | null): string {
  if (pct === null) return 'bg-surface-2'
  if (pct >= 100) return 'bg-pos'
  if (pct >= 70) return 'bg-warn'
  return 'bg-neg'
}

export default function EvolucaoMetas({ series }: { series: SerieMeta[] }) {
  if (series.length === 0) {
    return (
      <section className="space-y-4">
        <PanelHeader
          title="Comparação histórica"
          sub="Cumprimento de cada meta nos últimos meses."
        />
        <Panel>
          <NoData label="Nenhuma meta cadastrada nos períodos anteriores — não há histórico para comparar." />
        </Panel>
      </section>
    )
  }

  const periodos = series[0].pontos.map((p) => p.periodo)

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Comparação histórica"
        sub="Cumprimento da meta mês a mês. Mês em branco não teve meta cadastrada ou realizado apurado."
      />
      <Panel>
        <div className="overflow-x-auto">
          <div className="min-w-[36rem] space-y-4">
            {series.map((s) => (
              <div key={s.tipo}>
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <span className="t-sm text-fg">{META_TIPO_LABELS[s.tipo] ?? s.tipo}</span>
                  {/* O ÚLTIMO mês com dado — a leitura "onde estamos agora". */}
                  {(() => {
                    const ultimo = [...s.pontos].reverse().find((p) => p.cumprimento !== null)
                    return (
                      <span className="t-label text-subtle tabular-nums">
                        {ultimo ? `${ultimo.cumprimento!.toFixed(0)}% no último mês apurado` : 'sem apuração'}
                      </span>
                    )
                  })()}
                </div>
                <div className="flex items-end gap-1.5 h-16">
                  {s.pontos.map((p) => (
                    <div key={p.periodo} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full h-full flex items-end">
                        <div
                          className={`w-full rounded-t transition-[height] duration-[380ms] ease-bp ${tom(p.cumprimento)}`}
                          // Teto visual em 100%: uma meta cumprida em 300%
                          // achataria todas as outras barras da série.
                          style={{
                            height: p.cumprimento === null
                              ? '3%'
                              : `${Math.max(Math.min(p.cumprimento, 100), 4)}%`,
                          }}
                          title={`${formatMesRef(p.periodo)}: ${
                            p.cumprimento === null
                              ? 'sem meta ou sem realizado'
                              : `${p.cumprimento.toFixed(0)}% da meta`
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1">
                  {periodos.map((p) => (
                    <span key={p} className="flex-1 t-label text-subtle text-center truncate">
                      {formatMesRef(p).slice(0, 3)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </section>
  )
}
