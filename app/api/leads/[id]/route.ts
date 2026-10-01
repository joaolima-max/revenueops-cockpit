import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { validarLead, bloqueioDeExclusao } from '@/lib/leads'

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
 * EXCLUSÃO DE LEAD — exclusão REAL, não ocultação.
 *
 * Por que isto estava quebrado: `Activity.leadId` e `Deal.leadId` tinham a
 * constraint NO ACTION no banco (o Prisma declara a relação como opcional,
 * mas a FK foi criada sem ação). Apagar um lead que já tivesse qualquer
 * atividade ou card estourava violação de chave estrangeira, a rota devolvia
 * 500 e, para quem clicava, o botão "não fazia nada" — e falhava justamente
 * nos leads já trabalhados, que são os que alguém quer remover.
 *
 * A v20 pôs `Activity` em CASCADE: é log SOBRE o lead, sem vida própria.
 * Comentários já cascateavam.
 *
 * CARDS DE PIPELINE continuam bloqueando, de propósito: o card carrega
 * movimentações, comentários e desfecho, e apagá-los por tabela seria destruir
 * histórico sem ninguém ter pedido. Agora a recusa é explícita — 409 com a
 * contagem e o motivo — em vez de um 500 silencioso.
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  // ADMIN no BACKEND, não só escondido no frontend.
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, name: true, company: true, _count: { select: { deals: true } } },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const bloqueio = bloqueioDeExclusao(lead._count.deals)
  if (bloqueio) {
    return NextResponse.json({ error: bloqueio.mensagem, cards: bloqueio.cards }, { status: 409 })
  }

  await prisma.lead.delete({ where: { id } })

  await logAudit(
    session.userId, 'DELETE', 'Lead', id,
    `Lead excluído: ${lead.company ?? '—'} · ${lead.name}`,
  )

  return NextResponse.json({ success: true })
}
