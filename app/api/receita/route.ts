import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { getLast12Months } from '@/lib/utils'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const meses = getLast12Months()

  const [receitas, forecasts] = await Promise.all([
    prisma.receitaRealizada.findMany({ orderBy: { mesRef: 'desc' } }),
    prisma.forecast.groupBy({
      by: ['mesRef'],
      where: { mesRef: { in: meses } },
      _sum: { receitaPrevista: true },
    }),
  ])

  const fcMap = new Map(forecasts.map(f => [f.mesRef, f._sum.receitaPrevista || 0]))

  const enriched = receitas.map(r => {
    const previsto = fcMap.get(r.mesRef) || 0
    const realizado = r.receitaTarifaria + r.floatingRealizado
    const gap = realizado - previsto
    const precisao = previsto > 0 ? (realizado / previsto) * 100 : null
    return { ...r, previsto, realizado, gap, precisao }
  })

  return NextResponse.json({ receitas: enriched })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { mesRef, receitaTarifaria, floatingRealizado } = await request.json()
  if (!mesRef) return NextResponse.json({ error: 'Mês de referência obrigatório' }, { status: 400 })

  const receita = await prisma.receitaRealizada.upsert({
    where: { mesRef },
    create: { mesRef, receitaTarifaria: receitaTarifaria || 0, floatingRealizado: floatingRealizado || 0 },
    update: { receitaTarifaria: receitaTarifaria || 0, floatingRealizado: floatingRealizado || 0 },
  })

  const receitaTotal = (receitaTarifaria || 0) + (floatingRealizado || 0)
  await Promise.all([
    prisma.meta.updateMany({ where: { tipo: 'RECEITA', periodo: mesRef }, data: { realizado: receitaTotal } }),
    prisma.meta.updateMany({ where: { tipo: 'FLOATING', periodo: mesRef }, data: { realizado: floatingRealizado || 0 } }),
  ])

  return NextResponse.json({ receita })
}
