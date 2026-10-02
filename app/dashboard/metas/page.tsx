export const dynamic = 'force-dynamic'

import { metasDoPeriodo, periodoAtual } from '@/lib/kpi'
import { avaliarCompleto } from '@/lib/metas'
import { formatMesRef } from '@/lib/utils'
import MetaAnalytics from '@/components/metas/MetaAnalytics'
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
 *   2. CADASTRO — criar e editar as metas do período.
 *
 * ── A COMPARAÇÃO HISTÓRICA SAIU ─────────────────────────────────────────
 *
 * Havia aqui um terceiro bloco, com o cumprimento de cada meta mês a mês.
 * Foi removido por decisão de produto, e NADA entrou no lugar — o espaço
 * fica para o acompanhamento e o cadastro, que são o que a tela existe para
 * fazer. A janela de 6 meses e as 6 consultas que a alimentavam saíram
 * junto: a página voltou a pagar uma consulta por carregamento.
 *
 * Toda a matemática é de `avaliarCompleto` (lib/metas) sobre `metasDoPeriodo`
 * (lib/kpi) — as mesmas funções que a API e a Visão geral do Comercial usam.
 * Nenhum número é recalculado aqui.
 */

export default async function MetasPage() {
  const periodo = periodoAtual()
  const doMes = await metasDoPeriodo(periodo)

  const avaliacoes = doMes.map((m) => avaliarCompleto({
    tipo: m.tipo,
    periodo,
    meta: m.meta,
    realizado: m.realizado,
    direcao: m.direcao,
    unidade: m.unidade,
  }))

  return (
    <div className="space-y-10">
      <MetaAnalytics avaliacoes={avaliacoes} periodoLabel={formatMesRef(periodo)} />

      <MetasClient />
    </div>
  )
}
