import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { funisVisiveis } from '@/lib/pipeline-db'
import { ultimosPeriodos } from '@/lib/periodo'
import {
  tempoMedioPorEtapa, conversaoPorEtapa, conversaoPorResponsavel,
  conversaoEntreFunis, cicloMedioDias, gargalos, evolucaoMensal,
  distribuicaoPorResultado, type CardBruto,
} from '@/lib/crm'
import {
  leadsPorSegmento, leadsPorEtapa, segmentoPorEtapa, emAtividadeAssistida,
  geradosNoPeriodo, comparar, taxaConversao, periodoDe, periodoAnterior,
  type LeadBruto,
} from '@/lib/comercial'
import { metasDoPeriodo, clientesComAtividadeAberta } from '@/lib/kpi'
import { ehMetaDePipeline } from '@/lib/metas'
import { SEGMENTO_CRM_LABELS, SEGMENTO_LABELS } from '@/lib/utils'

/**
 * Analítica do Pipeline. NÃO existe entidade de CRM: tudo aqui é derivado de
 * `PipelineMovimentacao` e `Deal`, que a v11 já grava. Duplicar deals, leads
 * ou movimentações para alimentar um dashboard criaria uma segunda verdade
 * sobre o mesmo fato.
 *
 * GANHO E PERDA vêm de `Deal.resultado`, não da etapa: desde a v17 o desfecho
 * é um eixo próprio, e um card perdido na Negociação conta como volume da
 * Negociação e como perda ao mesmo tempo.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_crm', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Só os funis que a alçada do usuário deixa ver — a analítica não pode ser
  // uma porta lateral para dados de um funil fechado.
  const visiveis = await funisVisiveis(session)
  if (visiveis.length === 0) {
    return NextResponse.json({ funis: [], funil: null, vazio: true })
  }

  const pedido = request.nextUrl.searchParams.get('funilId')
  const funil = visiveis.find((f) => f.id === pedido) ?? visiveis[0]

  /**
   * A BASE DE LEADS, com o card mais recente de cada um.
   *
   * Um lead pode ter vários cards (reentrou no pipeline, foi transferido entre
   * funis). O que importa para a leitura comercial é o ESTADO ATUAL, então
   * entra o card mais recente — contar todos faria um lead reentrado pesar
   * mais que os outros na distribuição.
   */
  const [etapas, cards, movimentos, funisNomes, saidas, leads, clientesAssistidos] =
    await Promise.all([
    prisma.pipelineEtapa.findMany({ where: { funilId: funil.id }, orderBy: { ordem: 'asc' } }),
    prisma.deal.findMany({
      // Card excluído sai dos KPIs e das distribuições: ele não está mais no
      // Pipeline, e contá-lo faria a leitura comercial descrever um quadro
      // que ninguém vê.
      where: { funilId: funil.id, deletedAt: null },
      select: {
        id: true, ownerId: true, funilId: true, etapaId: true,
        resultado: true, createdAt: true, resultadoEm: true, closedAt: true,
        owner: { select: { id: true, name: true } },
      },
    }),
    prisma.pipelineMovimentacao.findMany({
      // A movimentação do card EXCLUÍDO fica fora dos indicadores. Ela
      // continua gravada — é o histórico da exclusão —, mas tempo médio por
      // etapa e conversão descrevem o funil ATUAL, e um card que saiu do
      // quadro não faz parte dele.
      where: { funilDestinoId: funil.id, deal: { deletedAt: null } },
      select: {
        dealId: true, tipo: true, funilOrigemId: true, etapaOrigemId: true,
        funilDestinoId: true, etapaDestinoId: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pipelineFunil.findMany({ select: { id: true, nome: true } }),
    // Transferências que SAÍRAM deste funil — o `where` acima traz as que
    // entraram, então a saída precisa da própria consulta.
    prisma.pipelineMovimentacao.findMany({
      where: {
        funilOrigemId: funil.id, tipo: 'TRANSFERENCIA_FUNIL',
        deal: { deletedAt: null },
      },
      select: {
        dealId: true, tipo: true, funilOrigemId: true, etapaOrigemId: true,
        funilDestinoId: true, etapaDestinoId: true, createdAt: true,
      },
    }),
    prisma.lead.findMany({
      select: {
        id: true, segmento: true, createdAt: true,
        deals: {
          // Sem o filtro, um lead cujo único card foi excluído continuaria
          // aparecendo na distribuição por etapa — numa etapa que ele já não
          // ocupa.
          where: { funilId: funil.id, deletedAt: null },
          select: {
            etapaId: true, resultado: true, ownerId: true, clienteId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    clientesComAtividadeAberta(),
  ])

  const ordem = etapas.filter((e) => e.ativo).map((e) => e.id)

  const cardsBrutos: CardBruto[] = cards.map((c) => ({
    id: c.id,
    ownerId: c.ownerId,
    ownerNome: c.owner.name,
    funilId: c.funilId,
    etapaId: c.etapaId,
    resultado: c.resultado,
    criadoEm: c.createdAt,
    // `resultadoEm` é a data do desfecho; `closedAt` cobre os cards anteriores
    // à v17, cujo fechamento só existia ali.
    fechadoEm: c.resultadoEm ?? c.closedAt,
  }))

  const volumePorEtapa = new Map<string, number>()
  for (const c of cards) if (c.etapaId) volumePorEtapa.set(c.etapaId, (volumePorEtapa.get(c.etapaId) ?? 0) + 1)

  const tempos = tempoMedioPorEtapa(movimentos)
  const conversoes = conversaoPorEtapa(movimentos, ordem)
  const nomeFunil = new Map(funisNomes.map((f) => [f.id, f.nome]))
  const periodos = ultimosPeriodos(12)

  const decididos = cardsBrutos.filter((c) => c.resultado !== 'EM_ANDAMENTO').length
  const ganhos = cardsBrutos.filter((c) => c.resultado === 'GANHO').length

  /* ── Leitura de LEADS: distribuição, atividade e comparativos ───────── */

  const rotulo = (sg: string) => SEGMENTO_CRM_LABELS[sg] ?? SEGMENTO_LABELS[sg] ?? sg

  const leadsBrutos: LeadBruto[] = leads.map((l) => {
    const card = l.deals[0] ?? null
    return {
      id: l.id,
      segmento: l.segmento,
      criadoEm: l.createdAt,
      etapaId: card?.etapaId ?? null,
      resultado: card?.resultado ?? null,
      responsavelId: card?.ownerId ?? null,
      // Atividade assistida pela VIA DO CLIENTE: tarefa ou follow-up em
      // aberto, com responsável, para o cliente vinculado ao card.
      temAtividadeAberta: !!card?.clienteId && clientesAssistidos.has(card.clienteId),
    }
  })

  const etapasAtivas = etapas.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome }))

  const periodoCorrente = periodoDe(new Date())
  const periodoPassado = periodoAnterior(periodoCorrente)

  /**
   * COMPARATIVO MÊS A MÊS, sobre os mesmos registros já carregados.
   *
   * Ganhos e perdas do mês saem de `resultadoEm` (com `closedAt` de retaguarda
   * para cards anteriores à v17): é a data do DESFECHO, não a da criação — um
   * card criado em agosto e ganho em outubro é ganho de outubro.
   */
  const desfechoEm = (c: CardBruto) => (c.fechadoEm ? periodoDe(c.fechadoEm) : null)
  const contaDesfecho = (periodo: string, r: 'GANHO' | 'PERDIDO') =>
    cardsBrutos.filter((c) => c.resultado === r && desfechoEm(c) === periodo).length

  const ganhosMes = contaDesfecho(periodoCorrente, 'GANHO')
  const perdidosMes = contaDesfecho(periodoCorrente, 'PERDIDO')
  const ganhosMesAnterior = contaDesfecho(periodoPassado, 'GANHO')
  const perdidosMesAnterior = contaDesfecho(periodoPassado, 'PERDIDO')

  const assistida = emAtividadeAssistida(leadsBrutos)
  // Base do mês anterior: os leads que JÁ EXISTIAM no fim daquele mês. A
  // atividade de hoje não é retroativa, mas a base comparável é.
  const assistidaAnterior = emAtividadeAssistida(
    leadsBrutos.filter((l) => periodoDe(l.criadoEm) <= periodoPassado),
  )

  /* ── METAS DE PIPELINE no período corrente ──────────────────────────── */
  const metas = (await metasDoPeriodo(periodoCorrente)).filter((m) => ehMetaDePipeline(m.tipo))

  return NextResponse.json({
    funis: visiveis.map((f) => ({ id: f.id, nome: f.nome })),
    funil: { id: funil.id, nome: funil.nome },
    periodo: periodoCorrente,
    periodoAnterior: periodoPassado,

    /* LEITURA COMERCIAL. Nenhum valor monetário: o valor de um lead não está
       validado, então não há KPI, série, tooltip nem ranking em reais. */
    leads: {
      base: leadsBrutos.length,
      noPipeline: leadsBrutos.filter((l) => l.resultado === 'EM_ANDAMENTO').length,
      geradosNoPeriodo: comparar(
        geradosNoPeriodo(leadsBrutos, periodoCorrente),
        geradosNoPeriodo(leadsBrutos, periodoPassado),
      ),
      ganhos: comparar(ganhosMes, ganhosMesAnterior),
      perdidos: comparar(perdidosMes, perdidosMesAnterior),
      conversao: {
        atual: taxaConversao(ganhosMes, perdidosMes),
        anterior: taxaConversao(ganhosMesAnterior, perdidosMesAnterior),
      },
      atividadeAssistida: {
        total: assistida.total,
        percentual: assistida.percentual,
        comparativo: comparar(assistida.total, assistidaAnterior.total),
      },
      porSegmento: leadsPorSegmento(leadsBrutos, rotulo),
      porEtapa: leadsPorEtapa(leadsBrutos, etapasAtivas),
      segmentoPorEtapa: segmentoPorEtapa(leadsBrutos, etapasAtivas, rotulo),
      etapasDaMatriz: etapasAtivas.map((e) => e.nome),
    },

    metasPipeline: metas,

    resumo: {
      totalCards: cards.length,
      abertos: cardsBrutos.filter((c) => c.resultado === 'EM_ANDAMENTO').length,
      ganhos,
      perdas: cardsBrutos.filter((c) => c.resultado === 'PERDIDO').length,
      // Taxa sobre os DECIDIDOS: incluir os em aberto puniria pipeline cheio.
      taxaConversao: decididos > 0 ? (ganhos / decididos) * 100 : null,
      cicloMedioDias: cicloMedioDias(cardsBrutos),
    },
    // Só as etapas ATIVAS aparecem na analítica do funil: as colunas Ganho e
    // Perdido foram inativadas na v17 e mostrá-las sugeriria que ainda são
    // etapas do processo.
    etapas: etapas.filter((e) => e.ativo).map((e) => ({
      id: e.id, nome: e.nome, ativo: e.ativo,
      volume: volumePorEtapa.get(e.id) ?? 0,
      tempoMedioDias: tempos.get(e.id)?.dias ?? null,
      conversao: conversoes.get(e.id) ?? { entraram: 0, avancaram: 0, taxa: null },
    })),
    distribuicao: distribuicaoPorResultado(cardsBrutos),
    evolucao: evolucaoMensal(cardsBrutos, periodos),
    responsaveis: conversaoPorResponsavel(cardsBrutos),
    entreFunis: conversaoEntreFunis(saidas).map((t) => ({
      ...t,
      origemNome: nomeFunil.get(t.origemId) ?? '—',
      destinoNome: nomeFunil.get(t.destinoId) ?? '—',
    })),
    gargalos: gargalos(tempos, volumePorEtapa).map((g) => ({
      ...g, etapaNome: etapas.find((e) => e.id === g.etapaId)?.nome ?? '—',
    })),
  })
}
