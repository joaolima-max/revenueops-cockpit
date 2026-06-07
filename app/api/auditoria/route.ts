import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = request.nextUrl
  const entidade = searchParams.get('entidade') || ''

  const logs = await prisma.auditoria.findMany({
    where: { ...(entidade ? { entidade } : {}) },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ logs })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { acao, entidade, entidadeId, detalhes } = body

  const log = await prisma.auditoria.create({
    data: { acao, entidade, entidadeId: entidadeId || null, detalhes: detalhes || null, userId: session.userId },
  })

  return NextResponse.json({ log })
}
