import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { validarInativacaoEtapa } from '@/lib/pipeline'
import { acessoAoFunil, auditarPipeline } from '@/lib/pipeline-db'

const TIPOS = ['NORMAL', 'GANHO', 'PERDIDO'] as const

async function carregar(session: { userId: string; role: string; permissoes?: string[] }, id: string) {
  const etapa = await prisma.pipelineEtapa.findUnique({
    where: { id }, include: { _count: { select: { deals: true } } },
  })
  if (!etapa) return { erro: NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 }) }

  const acesso = await acessoAoFunil(session, etapa.funilId)
  if (!acesso?.administrar) return { erro: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) }
  return { etapa }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const { etapa, erro } = await carregar(session, id)
  if (erro) return erro

  const { nome, descricao, cor, tipo } = await request.json()
  const n = nome !== undefined ? String(nome).trim() : undefined
  if (n !== undefined && !n) return NextResponse.json({ error: 'Informe o nome da etapa.' }, { status: 400 })

  if (n && n !== etapa!.nome) {
    const dup = await prisma.pipelineEtapa.findUnique({
      where: { funilId_nome: { funilId: etapa!.funilId, nome: n } },
    })
    if (dup) return NextResponse.json({ error: `Este funil já tem uma etapa "${n}".` }, { status: 409 })
  }

  const atualizada = await prisma.pipelineEtapa.update({
    where: { id },
    data: {
      ...(n ? { nome: n } : {}),
      ...(descricao !== undefined ? { descricao: descricao ? String(descricao).slice(0, 500) : null } : {}),
      ...(cor !== undefined ? { cor: cor ? String(cor).slice(0, 32) : null } : {}),
      ...(tipo !== undefined && TIPOS.includes(tipo) ? { tipo } : {}),
    },
  })

  await auditarPipeline(session.userId, 'EDITOU_ETAPA', 'PipelineEtapa', id, `Etapa: ${atualizada.nome}`)
  return NextResponse.json({ etapa: atualizada })
}

/**
 * Ativa/inativa. Inativar etapa com cards exige uma etapa de destino para eles,
 * senão os cards sumiriam do quadro sem aviso.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const { etapa, erro } = await carregar(session, id)
  if (erro) return erro

  const { ativo, etapaDestinoId } = await request.json()
  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'Informe ativo: true ou false.' }, { status: 400 })
  }

  if (!ativo) {
    const destino = etapaDestinoId ? String(etapaDestinoId) : null
    const problema = validarInativacaoEtapa(etapa!._count.deals, destino)
    if (problema) return NextResponse.json({ error: problema, cards: etapa!._count.deals }, { status: 409 })

    if (destino) {
      const alvo = await prisma.pipelineEtapa.findUnique({ where: { id: destino } })
      if (!alvo || alvo.funilId !== etapa!.funilId) {
        return NextResponse.json({ error: 'A etapa de destino precisa ser do mesmo funil.' }, { status: 400 })
      }
      if (alvo.id === id) {
        return NextResponse.json({ error: 'A etapa de destino não pode ser a própria etapa.' }, { status: 400 })
      }

      await prisma.$transaction(async (tx) => {
        const cards = await tx.deal.findMany({ where: { etapaId: id }, select: { id: true } })
        await tx.deal.updateMany({ where: { etapaId: id }, data: { etapaId: destino } })
        await tx.pipelineEtapa.update({ where: { id }, data: { ativo: false } })
        if (cards.length > 0) {
          await tx.pipelineMovimentacao.createMany({
            data: cards.map((c) => ({
              dealId: c.id,
              tipo: 'MOVIMENTO_ETAPA' as const,
              funilOrigemId: etapa!.funilId,
              etapaOrigemId: id,
              funilDestinoId: etapa!.funilId,
              etapaDestinoId: destino,
              userId: session.userId,
              observacao: `Realocado ao inativar a etapa ${etapa!.nome}.`,
            })),
          })
        }
      })

      await auditarPipeline(
        session.userId, 'INATIVOU_ETAPA', 'PipelineEtapa', id,
        `Etapa ${etapa!.nome} inativada; ${etapa!._count.deals} card(s) movidos para ${alvo.nome}`,
      )
      return NextResponse.json({ ok: true, movidos: etapa!._count.deals })
    }
  }

  const atualizada = await prisma.pipelineEtapa.update({ where: { id }, data: { ativo } })
  await auditarPipeline(
    session.userId, ativo ? 'REATIVOU_ETAPA' : 'INATIVOU_ETAPA', 'PipelineEtapa', id,
    `Etapa: ${atualizada.nome}`,
  )
  return NextResponse.json({ etapa: atualizada })
}
