import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

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
      value: data.value ? parseFloat(data.value) : null,
      notes: data.notes,
      cnpj: data.cnpj ?? undefined,
      canal: data.canal ?? undefined,
      segmento: data.segmento ?? undefined,
    },
    include: { owner: { select: { id: true, name: true } } },
  })

  return NextResponse.json(lead)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  await prisma.lead.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
