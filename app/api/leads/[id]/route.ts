import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { validarLead } from '@/lib/leads'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      deals: { include: { owner: { select: { id: true, name: true } } } },
      activities: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
    },
  })

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  return NextResponse.json(lead)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const data = await request.json()

  // Mesma regra da criação: empresa e executivo não podem ser apagados numa
  // edição. Validar só no POST deixaria a porta aberta pelo PUT.
  const erros = validarLead(data)
  if (erros.length > 0) {
    return NextResponse.json({ error: erros[0].mensagem, erros }, { status: 400 })
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      position: data.position,
      source: data.source,
      status: data.status,
      notes: data.notes,
      cnpj: data.cnpj ?? undefined,
      canal: data.canal ?? undefined,
      segmento: data.segmento ?? undefined,
    },
    include: { owner: { select: { id: true, name: true } } },
  })

  return NextResponse.json(lead)
}

/**
 * EXCLUSÃO DE LEAD — MOVER PARA A LIXEIRA.
 *
 * A regra mudou nesta rodada: excluir um lead não o apaga mais da base.
 * `deletedAt` e `deletedById` são gravados, o lead sai de toda consulta
 * normal — lista, busca e seletor do Pipeline — e o histórico fica INTEIRO:
 * cards, movimentações e comentários continuam existindo e apontando para
 * ele.
 *
 * Por que isso é melhor que a exclusão física: o lead participava de cards de
 * pipeline, e a exclusão física obrigava a escolher entre destruir esse
 * histórico (cascade) ou recusar a exclusão (restrict). A lixeira não tem de
 * escolher — o registro sai de circulação e o passado continua legível.
 *
 * CARD NÃO BLOQUEIA MAIS. A recusa por card existia porque apagar levava o
 * histórico; mover para a lixeira não leva nada.
 *
 * Quem consulta a lixeira são os DIRETORES, por hierarquia — não por perfil.
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  // ADMIN no BACKEND, não só escondido no frontend.
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true, name: true, company: true, deletedAt: true,
      _count: { select: { deals: true } },
    },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Já na lixeira: nada a fazer, e dizer isso é melhor que fingir sucesso.
  if (lead.deletedAt) {
    return NextResponse.json(
      { error: 'Este lead já está na lixeira.' }, { status: 409 },
    )
  }

  await prisma.lead.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: session.userId },
  })

  await logAudit(
    session.userId, 'MOVEU_LEAD_PARA_LIXEIRA', 'Lead', id,
    `${lead.company ?? '—'} · ${lead.name}`
    + (lead._count.deals > 0
      ? ` · ${lead._count.deals} card(s) de pipeline preservados`
      : ''),
  )

  return NextResponse.json({
    success: true,
    naLixeira: true,
    cardsPreservados: lead._count.deals,
  })
}
