export const dynamic = 'force-dynamic'

import { metasDoPeriodo, periodoAtual, ultimosPeriodos } from '@/lib/kpi'
import { avaliarCompleto } from '@/lib/metas'
import { formatMesRef } from '@/lib/utils'
import MetaAnalytics from '@/components/metas/MetaAnalytics'
import EvolucaoMetas, { type SerieMeta } from '@/components/metas/EvolucaoMetas'
import MetasClient from './MetasClient'

/**
 * METAS — o painel dedicado.
 *
 * Concentra tudo o que é meta, porque até esta rodada estava repartido: o
 * CADASTRO aqui e o ACOMPANHAMENTO no Cockpit. Duas telas respondendo à mesma
 * pergunta obrigavam a conferir de memória se os dois números batiam — e o
 * Cockpit, que existe para dizer o que aconteceu, passava a julgar o número
 * antes de o executivo tê-lo lido.
 *
 * A ordem da página é a ordem da leitura:
 *
 *   1. ACOMPANHAMENTO — projetado × realizado, pacing e atingimento por KPI;
 *   2. COMPARAÇÃO HISTÓRICA — a trajetória do cumprimento, mês a mês;
 *   3. CADASTRO — criar e editar as metas do período.
 *
 * Primeiro como estamos, depois como chegamos aqui, e só então o que mudar.
 *
 * Toda a matemática é de `avaliarCompleto` (lib/metas) sobre `metasDoPeriodo`
 * (lib/kpi) — as mesmas funções que a API e a Visão geral do Comercial usam.
 * Nenhum número é recalculado aqui.
 */

/** Quantos meses a comparação histórica cobre. */
const JANELA = 6

export default async function MetasPage() {
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(JANELA)

  const [doMes, historico] = await Promise.all([
    metasDoPeriodo(periodo),
    Promise.all(periodos.map((p) => metasDoPeriodo(p))),
  ])

  const avaliacoes = doMes.map((m) => avaliarCompleto({
    tipo: m.tipo,
    periodo,
    meta: m.meta,
    realizado: m.realizado,
    direcao: m.direcao,
    unidade: m.unidade,
  }))

  /**
   * UMA SÉRIE POR INDICADOR que tenha meta em QUALQUER mês da janela.
   *
   * Indicador sem meta nenhuma no período não vira linha vazia: ele
   * simplesmente não é acompanhado, e uma faixa de seis meses em branco só
   * ocuparia espaço. Já um indicador metado em três dos seis meses aparece,
   * com os outros três vazios — a lacuna é informação.
   */
  const tipos = [...new Set(historico.flatMap((mes) => mes.map((m) => m.tipo)))].sort()

  const series: SerieMeta[] = tipos.map((tipo) => ({
    tipo,
    pontos: periodos.map((p, i) => {
      const m = historico[i].find((x) => x.tipo === tipo)
      // `atingimento` já vem com MENOR É MELHOR resolvido por `avaliarMeta`.
      return { periodo: p, cumprimento: m?.atingimento ?? null }
    }),
  }))

  return (
    <div className="space-y-10">
      <MetaAnalytics avaliacoes={avaliacoes} periodoLabel={formatMesRef(periodo)} />

      <EvolucaoMetas series={series} />

      <MetasClient />
    </div>
  )
}
