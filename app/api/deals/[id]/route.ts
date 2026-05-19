import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

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

  if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 })
  return NextResponse.json(deal)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const data = await request.json()

  const deal = await prisma.deal.update({
    where: { id },
    data: {
      title: data.title,
      value: data.value ? parseFloat(data.value) : undefined,
      stage: data.stage,
      probability: data.probability,
      notes: data.notes,
      leadId: data.leadId || null,
      expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
      closedAt: data.stage === 'GANHO' || data.stage === 'PERDIDO' ? new Date() : null,
    },
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  })

  return NextResponse.json(deal)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  await prisma.deal.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
