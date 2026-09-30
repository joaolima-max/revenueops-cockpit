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

  const [etapas, cards, movimentos, funisNomes, saidas] = await Promise.all([
    prisma.pipelineEtapa.findMany({ where: { funilId: funil.id }, orderBy: { ordem: 'asc' } }),
    prisma.deal.findMany({
      where: { funilId: funil.id },
      select: {
        id: true, ownerId: true, funilId: true, etapaId: true,
        resultado: true, createdAt: true, resultadoEm: true, closedAt: true,
        owner: { select: { id: true, name: true } },
      },
    }),
    prisma.pipelineMovimentacao.findMany({
      where: { funilDestinoId: funil.id },
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
      where: { funilOrigemId: funil.id, tipo: 'TRANSFERENCIA_FUNIL' },
      select: {
        dealId: true, tipo: true, funilOrigemId: true, etapaOrigemId: true,
        funilDestinoId: true, etapaDestinoId: true, createdAt: true,
      },
    }),
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

  return NextResponse.json({
    funis: visiveis.map((f) => ({ id: f.id, nome: f.nome })),
    funil: { id: funil.id, nome: funil.nome },
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
