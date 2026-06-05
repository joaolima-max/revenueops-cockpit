import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { getCurrentMonth } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const periodo = searchParams.get('periodo') || getCurrentMonth()

  const metas = await prisma.meta.findMany({
    where: { periodo },
    orderBy: { tipo: 'asc' },
  })

  return NextResponse.json({ metas, periodo })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { tipo, valor, periodo, realizado } = await request.json()
  if (!tipo || !valor || !periodo) return NextResponse.json({ error: 'Tipo, valor e período são obrigatórios' }, { status: 400 })

  const meta = await prisma.meta.upsert({
    where: { tipo_periodo: { tipo, periodo } },
    create: { tipo, valor, periodo, realizado: realizado ?? null },
    update: { valor, realizado: realizado ?? undefined },
  })

  return NextResponse.json({ meta })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id, valor, realizado } = await request.json()
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const meta = await prisma.meta.update({
    where: { id },
    data: { valor: valor ?? undefined, realizado: realizado ?? undefined },
  })

  return NextResponse.json({ meta })
}
