import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { funisVisiveis } from '@/lib/pipeline-db'
import {
  tempoMedioPorEtapa, conversaoPorEtapa, conversaoPorResponsavel,
  conversaoEntreFunis, cicloMedioDias, gargalos,
} from '@/lib/crm'

/**
 * Analítica do Pipeline. NÃO existe entidade de CRM: tudo aqui é derivado de
 * `PipelineMovimentacao` e `Deal`, que a v11 já grava. Duplicar deals, leads
 * ou movimentações para alimentar um dashboard criaria uma segunda verdade
 * sobre o mesmo fato.
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

  const [etapas, cards, movimentos, funisNomes] = await Promise.all([
    prisma.pipelineEtapa.findMany({ where: { funilId: funil.id }, orderBy: { ordem: 'asc' } }),
    prisma.deal.findMany({
      where: { funilId: funil.id },
      include: { owner: { select: { id: true, name: true } } },
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
  ])

  const ordem = etapas.map((e) => e.id)
  const etapasGanho = new Set(etapas.filter((e) => e.tipo === 'GANHO').map((e) => e.id))
  const etapasPerda = new Set(etapas.filter((e) => e.tipo === 'PERDIDO').map((e) => e.id))

  const cardsBrutos = cards.map((c) => ({
    id: c.id, ownerId: c.ownerId, ownerNome: c.owner.name,
    funilId: c.funilId, etapaId: c.etapaId, valor: c.value,
    criadoEm: c.createdAt, fechadoEm: c.closedAt,
  }))

  const volumePorEtapa = new Map<string, number>()
  for (const c of cards) if (c.etapaId) volumePorEtapa.set(c.etapaId, (volumePorEtapa.get(c.etapaId) ?? 0) + 1)

  const tempos = tempoMedioPorEtapa(movimentos)
  const conversoes = conversaoPorEtapa(movimentos, ordem)

  // Transferências que SAÍRAM deste funil — o `where` acima traz as que
  // entraram, então a saída precisa da própria consulta.
  const saidas = await prisma.pipelineMovimentacao.findMany({
    where: { funilOrigemId: funil.id, tipo: 'TRANSFERENCIA_FUNIL' },
    select: {
      dealId: true, tipo: true, funilOrigemId: true, etapaOrigemId: true,
      funilDestinoId: true, etapaDestinoId: true, createdAt: true,
    },
  })

  const nomeFunil = new Map(funisNomes.map((f) => [f.id, f.nome]))

  return NextResponse.json({
    funis: visiveis.map((f) => ({ id: f.id, nome: f.nome })),
    funil: { id: funil.id, nome: funil.nome },
    resumo: {
      totalCards: cards.length,
      abertos: cardsBrutos.filter((c) => !c.etapaId || (!etapasGanho.has(c.etapaId) && !etapasPerda.has(c.etapaId))).length,
      ganhos: cardsBrutos.filter((c) => c.etapaId && etapasGanho.has(c.etapaId)).length,
      perdas: cardsBrutos.filter((c) => c.etapaId && etapasPerda.has(c.etapaId)).length,
      valorAberto: cardsBrutos
        .filter((c) => !c.etapaId || (!etapasGanho.has(c.etapaId) && !etapasPerda.has(c.etapaId)))
        .reduce((s, c) => s + c.valor, 0),
      cicloMedioDias: cicloMedioDias(cardsBrutos),
    },
    etapas: etapas.map((e) => ({
      id: e.id, nome: e.nome, tipo: e.tipo, ativo: e.ativo,
      volume: volumePorEtapa.get(e.id) ?? 0,
      tempoMedioDias: tempos.get(e.id)?.dias ?? null,
      conversao: conversoes.get(e.id) ?? { entraram: 0, avancaram: 0, taxa: null },
    })),
    responsaveis: conversaoPorResponsavel(cardsBrutos, etapasGanho, etapasPerda),
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
