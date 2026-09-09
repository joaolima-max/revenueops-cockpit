import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { validarTransferencia } from '@/lib/pipeline'
import {
  acessoAoCard, acessoAoFunil, registrarMovimentacao, stageLegado, auditarPipeline, INCLUDE_CARD,
} from '@/lib/pipeline-db'

/**
 * Transfere o card para OUTRO funil.
 *
 * O Deal não é recriado — é o mesmo registro que muda de funil. É isso que
 * mantém lead, cliente, dono e atividades associados, e o que permite uma
 * linha do tempo contínua atravessando Vendas → Onboarding → Operações.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.transferir) {
    return NextResponse.json({ error: 'Você não pode transferir cards deste funil.' }, { status: 403 })
  }

  const { funilId, etapaId, clienteId, observacao } = await request.json()
  if (!funilId || !etapaId) {
    return NextResponse.json({ error: 'Informe o funil e a etapa de destino.' }, { status: 400 })
  }

  const [destino, etapa] = await Promise.all([
    prisma.pipelineFunil.findUnique({ where: { id: String(funilId) } }),
    prisma.pipelineEtapa.findUnique({ where: { id: String(etapaId) } }),
  ])
  if (!destino) return NextResponse.json({ error: 'Funil de destino não encontrado' }, { status: 404 })
  if (!etapa) return NextResponse.json({ error: 'Etapa de destino não encontrada' }, { status: 404 })

  // Transferir é também criar no destino: sem `criar` lá, o card entraria num
  // funil que o usuário não pode alimentar.
  const acessoDestino = await acessoAoFunil(session, destino.id)
  if (!acessoDestino?.criar) {
    return NextResponse.json({ error: `Você não pode criar cards no funil ${destino.nome}.` }, { status: 403 })
  }

  const clienteInformadoId = clienteId ? String(clienteId) : null
  const problema = validarTransferencia({
    funilOrigemId: ctx.deal.funilId,
    destino,
    etapa,
    clienteAtualId: ctx.deal.clienteId,
    clienteInformadoId,
  })
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  if (clienteInformadoId) {
    const existe = await prisma.cliente.count({ where: { id: clienteInformadoId } })
    if (!existe) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  const funilOrigemId = ctx.deal.funilId
  const etapaOrigemId = ctx.deal.etapaId
  const stage = stageLegado(etapa.id)
  const encerra = etapa.tipo === 'GANHO' || etapa.tipo === 'PERDIDO'
  const nota = observacao ? String(observacao).slice(0, 500) : null

  const card = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.deal.update({
      where: { id },
      data: {
        funilId: destino.id,
        etapaId: etapa.id,
        ...(clienteInformadoId ? { clienteId: clienteInformadoId } : {}),
        ...(stage ? { stage: stage as never } : {}),
        closedAt: encerra ? new Date() : null,
      },
      include: INCLUDE_CARD,
    })

    await registrarMovimentacao(tx, {
      dealId: id,
      tipo: 'TRANSFERENCIA_FUNIL',
      funilOrigemId,
      etapaOrigemId,
      funilDestinoId: destino.id,
      etapaDestinoId: etapa.id,
      userId: session.userId,
      observacao: nota,
    })

    return atualizado
  })

  const origem = funilOrigemId
    ? (await prisma.pipelineFunil.findUnique({ where: { id: funilOrigemId }, select: { nome: true } }))?.nome
    : null

  await auditarPipeline(
    session.userId, 'TRANSFERIU_CARD', 'Deal', id,
    `${ctx.deal.title}: ${origem ?? 'sem funil'} → ${destino.nome} / ${etapa.nome}`,
  )

  return NextResponse.json({ card })
}
