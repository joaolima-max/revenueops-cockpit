/**
 * RECEITA PREVISTA AUTOMÁTICA — a composição, com a origem de cada parcela.
 *
 * A fórmula, a razão de cada componente e a prova de que eles não se
 * sobrepõem estão em `lib/previsao-calculo.ts`, junto dos tipos. Este módulo
 * é só a BUSCA: ele lê as fontes reais e devolve a composição montada.
 *
 * ── NADA AQUI É ESTIMADO ────────────────────────────────────────────────
 *
 * Cada componente sai de um registro que alguém gravou:
 *
 *   MRR PROJETADO        `CondicaoComercial` (sustentação, mensalidade de
 *                        API) + `Cliente.mensalidadeApi`, via `calcularMrr`
 *                        — a MESMA função que o Cockpit e a Visão geral do
 *                        Financeiro usam. Não há um segundo cálculo de MRR.
 *
 *   AS QUATRO METAS      `Meta`, pelo período e pelo tipo.
 *
 *   RECEITAS LANÇADAS    `ReceitaPrevista`, o cadastro manual.
 *
 * Período sem fonte devolve componente AUSENTE, não zero. Ver
 * `ComponenteReceitaPrevista.ausente` para por que a diferença importa.
 *
 * ── E O MRR RESPEITA A VIGÊNCIA ─────────────────────────────────────────
 *
 * `calcularMrr(periodo)` só conta a sustentação de quem já está em vigor no
 * fim daquele mês (`sustentacaoVigente`). Um contrato que começa em dezembro
 * não entra na receita prevista de outubro — e é por isso que a projeção
 * CRESCE mês a mês sem ninguém digitar nada.
 */

import { prisma } from '@/lib/prisma'
import { calcularMrr } from '@/lib/financeiro'
import {
  COMPONENTES_RECEITA_PREVISTA, COMPONENTE_RECEITA_LABEL, META_DO_COMPONENTE,
  centavos, totalDaComposicao,
  type ComponenteReceita, type ComponenteReceitaPrevista,
  type ReceitaPrevistaComposta, type LinhaOrigemReceita,
} from '@/lib/previsao-calculo'

/** Onde cada componente é mantido — o destino da navegação de auditoria. */
const ROTA_DO_COMPONENTE: Record<ComponenteReceita, string | null> = {
  // O MRR vem do cadastro de condições comerciais. É lá que se corrige uma
  // sustentação errada, não na Previsão.
  MRR_PROJETADO: '/dashboard/financeiro/condicoes-baas',
  META_TARIFARIA: '/dashboard/metas',
  META_LANCAMENTOS_WL_BAAS: '/dashboard/metas',
  META_SERVICOS: '/dashboard/metas',
  META_SETUP: '/dashboard/metas',
  RECEITAS_LANCADAS: '/dashboard/financeiro/previsao/receitas',
}

/**
 * A COMPOSIÇÃO da receita prevista de um período.
 *
 * Uma consulta por fonte, as três em paralelo. O custo é o de três consultas
 * por período — e é por isso que `receitaPrevistaCompostaDeVarios` existe:
 * uma janela de 12 meses pagaria 36 idas ao banco chamando esta função num
 * laço.
 */
export async function receitaPrevistaComposta(
  periodo: string,
): Promise<ReceitaPrevistaComposta> {
  const [uma] = await receitaPrevistaCompostaDeVarios([periodo])
  return uma
}

/**
 * A composição de VÁRIOS períodos, com o mínimo de consultas.
 *
 * As metas e as receitas lançadas são buscadas de uma vez para a janela
 * inteira (`periodo: { in: periodos }`). O MRR é inevitavelmente por período
 * — ele depende da vigência de cada contrato no fim de cada mês —, e as
 * chamadas vão em paralelo.
 */
export async function receitaPrevistaCompostaDeVarios(
  periodos: string[],
): Promise<ReceitaPrevistaComposta[]> {
  if (periodos.length === 0) return []

  const tiposDeMeta = Object.values(META_DO_COMPONENTE).filter(
    (t): t is string => t !== null,
  )

  const [metas, lancadas, mrrs] = await Promise.all([
    prisma.meta.findMany({
      where: { periodo: { in: periodos }, tipo: { in: tiposDeMeta as never[] } },
      select: { tipo: true, periodo: true, valor: true, unidade: true },
    }),
    prisma.receitaPrevista.findMany({
      where: {
        periodo: { in: periodos },
        // CANCELADO fica fora: previsão cancelada não é expectativa. É a
        // mesma regra de `receitaPrevistaVsRealizada`.
        status: { not: 'CANCELADO' },
      },
      select: { periodo: true, descricao: true, valorPrevisto: true },
      orderBy: { valorPrevisto: 'desc' },
    }),
    Promise.all(periodos.map((p) => calcularMrr(p))),
  ])

  return periodos.map((periodo, i) => {
    const mrr = mrrs[i]
    const doPeriodo = metas.filter((m) => m.periodo === periodo)
    const lancadasDoPeriodo = lancadas.filter((r) => r.periodo === periodo)

    // METAS EM PERCENTUAL NÃO SOMAM. Ver o cabeçalho da seção em
    // lib/previsao-calculo: um percentual não tem o que somar em reais.
    const ignoradasPorUnidade = doPeriodo
      .filter((m) => m.unidade !== 'VALOR')
      .map((m) => m.tipo as string)

    const metaDe = new Map(
      doPeriodo.filter((m) => m.unidade === 'VALOR').map((m) => [m.tipo as string, m.valor]),
    )

    const componentes: ComponenteReceitaPrevista[] = COMPONENTES_RECEITA_PREVISTA.map(
      (chave): ComponenteReceitaPrevista => {
        const base = {
          chave,
          label: COMPONENTE_RECEITA_LABEL[chave],
          rota: ROTA_DO_COMPONENTE[chave],
        }

        if (chave === 'MRR_PROJETADO') {
          const linhas: LinhaOrigemReceita[] = [
            { label: 'Sustentação BaaS', valor: centavos(mrr.sustentacaoBaas) },
            { label: 'Sustentação White Label', valor: centavos(mrr.sustentacaoWhiteLabel) },
            {
              label: 'Mensalidade de API — parceiros',
              valor: centavos(mrr.apiMensalParceiros),
            },
            {
              label: 'Mensalidade de API — carteira',
              valor: centavos(mrr.apiMensalCarteira),
              rota: '/dashboard/carteira',
            },
          ]
          return {
            ...base,
            valor: centavos(mrr.total),
            origem:
              'Sustentação das condições comerciais vigentes no mês mais a '
              + 'mensalidade de API dos parceiros e da carteira inteira. '
              + 'Apurado por `calcularMrr`, a mesma função do Cockpit.',
            linhas,
            // O MRR tem fonte sempre que existe condição comercial cadastrada.
            // Zero aqui significa carteira sem contrato vigente no mês — que é
            // um fato, não uma ausência de registro.
            ausente: linhas.every((l) => l.valor === 0),
          }
        }

        if (chave === 'RECEITAS_LANCADAS') {
          const valor = centavos(
            lancadasDoPeriodo.reduce((a, r) => a + r.valorPrevisto, 0),
          )
          return {
            ...base,
            valor,
            origem:
              'Soma das receitas previstas lançadas manualmente para o '
              + 'período, exceto as canceladas.',
            linhas: lancadasDoPeriodo.map((r) => ({
              label: r.descricao,
              valor: centavos(r.valorPrevisto),
            })),
            ausente: lancadasDoPeriodo.length === 0,
          }
        }

        const tipo = META_DO_COMPONENTE[chave]!
        const valor = metaDe.get(tipo)
        return {
          ...base,
          valor: centavos(valor ?? 0),
          origem: valor === undefined
            ? `Nenhuma meta de ${COMPONENTE_RECEITA_LABEL[chave].toLowerCase()} `
              + 'cadastrada para o período.'
            : `Meta ${tipo} do período ${periodo}, cadastrada em Receita › Metas.`,
          linhas: [],
          ausente: valor === undefined,
        }
      },
    )

    return {
      periodo,
      total: totalDaComposicao(componentes),
      componentes,
      ausentes: componentes.filter((c) => c.ausente).length,
      ignoradasPorUnidade,
    }
  })
}
