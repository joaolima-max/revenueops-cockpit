import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { getLast12Months } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const mesRef = searchParams.get('mes') || ''
  const clienteId = searchParams.get('clienteId') || ''

  const meses = getLast12Months()

  const forecasts = await prisma.forecast.findMany({
    where: {
      ...(mesRef ? { mesRef } : { mesRef: { in: meses } }),
      ...(clienteId ? { clienteId } : {}),
    },
    include: { cliente: { select: { nome: true, modeloOperacional: true } } },
    orderBy: [{ mesRef: 'desc' }, { clienteId: 'asc' }],
  })

  const clientes = await prisma.cliente.findMany({
    where: { status: { in: ['ATIVO', 'INATIVO'] } },
    select: { id: true, nome: true, modeloOperacional: true },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json({ forecasts, clientes })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { clienteId, mesRef, tpvPrevisto, qtdPrevista, taxaMedia, tpvRealizado, receitaRealizada } = await request.json()
  if (!clienteId || !mesRef) return NextResponse.json({ error: 'Cliente e mês são obrigatórios' }, { status: 400 })

  const receitaPrevista = (tpvPrevisto || 0) * ((taxaMedia || 0) / 100)

  const forecast = await prisma.forecast.upsert({
    where: { clienteId_mesRef: { clienteId, mesRef } },
    create: {
      clienteId, mesRef,
      tpvPrevisto: tpvPrevisto || 0,
      qtdPrevista: qtdPrevista || 0,
      taxaMedia: taxaMedia || 0,
      receitaPrevista,
      tpvRealizado: tpvRealizado ?? null,
      receitaRealizada: receitaRealizada ?? null,
    },
    update: {
      tpvPrevisto: tpvPrevisto || 0,
      qtdPrevista: qtdPrevista || 0,
      taxaMedia: taxaMedia || 0,
      receitaPrevista,
      tpvRealizado: tpvRealizado ?? undefined,
      receitaRealizada: receitaRealizada ?? undefined,
    },
  })

  return NextResponse.json({ forecast })
}
