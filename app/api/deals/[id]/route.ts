import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  })

  if (!deal || deal.deletedAt) {
    return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 })
  }
  return NextResponse.json(deal)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const data = await request.json()

  // Nem `value` nem `resultado` entram por aqui: o card nao tem valor, e o
  // desfecho tem rota propria (PATCH /api/pipeline/cards/[id]/resultado), que e
  // a unica que grava historico da mudanca.
  const deal = await prisma.deal.update({
    where: { id },
    data: {
      title: data.title,
      stage: data.stage,
      notes: data.notes,
      leadId: data.leadId || null,
      expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
    },
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  })

  return NextResponse.json(deal)
}

/**
 * DELETE legado — agora SOFT DELETE, como a rota do Pipeline.
 *
 * Fazia `prisma.deal.delete`, um apagamento FÍSICO. Isso levava embora as
 * movimentações e os comentários do card (CASCADE) — o histórico que a
 * exclusão deveria preservar — e deixava a trilha de auditoria apontando para
 * um id inexistente.
 *
 * O caminho canônico é `DELETE /api/pipeline/cards/[id]`, que confere a alçada
 * no funil e grava a movimentação `EXCLUSAO_CARD`. Esta rota continua por
 * compatibilidade, com a MESMA semântica de exclusão: o card sai do quadro, o
 * LEAD permanece em Leads.
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params

  const card = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, title: true, deletedAt: true, leadId: true },
  })
  if (!card) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 })
  if (card.deletedAt) return NextResponse.json({ success: true, jaExcluido: true })

  await prisma.deal.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.userId },
  })

  await logAudit(
    session.userId, 'EXCLUIU_CARD_PIPELINE', 'Deal', id,
    `${card.title} · via rota legada /api/deals`
    + (card.leadId ? ` · lead [${card.leadId}] PRESERVADO em Leads` : ' · sem lead vinculado'),
  )

  return NextResponse.json({ success: true, leadPreservado: card.leadId })
}
