import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { validarMovimento } from '@/lib/pipeline'
import { acessoAoCard, registrarMovimentacao, stageLegado, auditarPipeline, INCLUDE_CARD } from '@/lib/pipeline-db'

/** Move o card para outra etapa do MESMO funil. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.mover) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { etapaId } = await request.json()
  if (!etapaId) return NextResponse.json({ error: 'Informe a etapa de destino.' }, { status: 400 })

  const destino = await prisma.pipelineEtapa.findUnique({ where: { id: String(etapaId) } })
  if (!destino) return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 })

  const problema = validarMovimento(ctx.deal.funilId, destino)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  if (ctx.deal.etapaId === destino.id) return NextResponse.json({ ok: true, semMudanca: true })

  const etapaOrigemId = ctx.deal.etapaId
  const stage = stageLegado(destino.id)
  const encerra = destino.tipo === 'GANHO' || destino.tipo === 'PERDIDO'

  const card = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.deal.update({
      where: { id },
      data: {
        etapaId: destino.id,
        funilId: destino.funilId,
        // `stage` continua alimentando app/api/relatorios. Só é tocado quando
        // a etapa de destino tem um valor legado correspondente (funil Vendas).
        ...(stage ? { stage: stage as never } : {}),
        closedAt: encerra ? new Date() : null,
      },
      include: INCLUDE_CARD,
    })

    await registrarMovimentacao(tx, {
      dealId: id,
      tipo: 'MOVIMENTO_ETAPA',
      funilOrigemId: ctx.deal.funilId,
      etapaOrigemId,
      funilDestinoId: destino.funilId,
      etapaDestinoId: destino.id,
      userId: session.userId,
    })

    return atualizado
  })

  await auditarPipeline(
    session.userId, 'MOVEU_CARD', 'Deal', id,
    `${ctx.deal.title} → etapa ${destino.nome}`,
  )

  return NextResponse.json({ card })
}
