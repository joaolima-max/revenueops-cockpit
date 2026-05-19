import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const stage = searchParams.get('stage')
  const search = searchParams.get('search')

  const where: Record<string, unknown> = {}
  if (stage) where.stage = stage
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (session.role === 'COMERCIAL') {
    where.ownerId = session.userId
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(deals)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const data = await request.json()
  const deal = await prisma.deal.create({
    data: {
      title: data.title,
      value: parseFloat(data.value),
      stage: data.stage || 'PROSPECCAO',
      probability: data.probability || 0,
      notes: data.notes,
      leadId: data.leadId || null,
      expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
      ownerId: session.userId,
    },
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  })

  return NextResponse.json(deal, { status: 201 })
}
