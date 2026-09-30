import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  validarMudancaResultado, podeAlterarResultado, encerraCard,
  RESULTADO_LABEL, type ResultadoCard,
} from '@/lib/pipeline'
import {
  acessoAoCard, registrarMovimentacao, auditarPipeline, INCLUDE_CARD,
} from '@/lib/pipeline-db'

/**
 * PATCH — muda o RESULTADO do card.
 *
 * Ganho e Perdido não são etapas: são o desfecho. Por isso mudam por aqui, sem
 * o card sair da coluna em que está — um negócio perdido na Negociação
 * continua tendo sido perdido NA Negociação, e essa informação é a mais útil
 * que o funil produz.
 *
 * A mudança grava histórico na MESMA transação. Um card que virou "Perdido"
 * sem registro de quem e quando seria pior que nenhum histórico, porque
 * parece completo.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!podeAlterarResultado(ctx.acesso)) {
    return NextResponse.json({ error: 'Você não pode alterar o resultado deste card.' }, { status: 403 })
  }

  const body = await request.json()
  const anterior = ctx.deal.resultado as ResultadoCard
  const problema = validarMudancaResultado(anterior, body.resultado)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const novo = body.resultado as ResultadoCard
  const observacao = body.observacao ? String(body.observacao).slice(0, 500) : null
  const agora = new Date()
  const fecha = encerraCard(novo)

  if (!ctx.deal.funilId || !ctx.deal.etapaId) {
    return NextResponse.json({
      error: 'Este card ainda não está em nenhum funil. Mova-o para uma etapa antes de marcar o resultado.',
    }, { status: 409 })
  }

  const card = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.deal.update({
      where: { id },
      data: {
        resultado: novo,
        // Reabrir limpa as duas datas: o card voltou a estar em andamento, e
        // manter a data do fechamento anterior faria o ciclo médio contar um
        // negócio que não fechou.
        resultadoEm: fecha ? agora : null,
        closedAt: fecha ? agora : null,
      },
      include: INCLUDE_CARD,
    })

    await registrarMovimentacao(tx, {
      dealId: id,
      tipo: 'MUDANCA_RESULTADO',
      funilOrigemId: null,
      etapaOrigemId: null,
      // O card não se moveu: destino é onde ele já está.
      funilDestinoId: ctx.deal.funilId!,
      etapaDestinoId: ctx.deal.etapaId!,
      userId: session.userId,
      observacao,
      resultadoAnterior: anterior,
      resultadoNovo: novo,
    })

    return atualizado
  })

  await auditarPipeline(
    session.userId, 'ALTEROU_RESULTADO_CARD', 'Deal', id,
    `${ctx.deal.title}: ${RESULTADO_LABEL[anterior]} → ${RESULTADO_LABEL[novo]}`,
  )

  return NextResponse.json({ card })
}
