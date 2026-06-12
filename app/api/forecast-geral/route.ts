import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { getLast12Months } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const mesRef = searchParams.get('mes') || ''

  const meses = getLast12Months()
  const forecasts = await prisma.forecastGeral.findMany({
    where: mesRef ? { mesRef } : { mesRef: { in: meses } },
    orderBy: { mesRef: 'desc' },
  })

  return NextResponse.json({ forecasts })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const {
    mesRef, tpvPrevisto, qtdTransacoesPrevista, faturamentoPrevisto, margemPrevista,
    tpvRealizado, qtdTransacoesRealizadas, faturamentoRealizado, margemRealizada, notas,
    qtdMedRealizada, receitaTarifariaWl, dataLancamento,
  } = body

  if (!mesRef) return NextResponse.json({ error: 'Mês é obrigatório' }, { status: 400 })

  const data = {
    tpvPrevisto: tpvPrevisto ?? 0,
    qtdTransacoesPrevista: qtdTransacoesPrevista ?? 0,
    faturamentoPrevisto: faturamentoPrevisto ?? 0,
    margemPrevista: margemPrevista ?? 0,
    tpvRealizado: tpvRealizado ?? null,
    qtdTransacoesRealizadas: qtdTransacoesRealizadas ?? null,
    faturamentoRealizado: faturamentoRealizado ?? null,
    margemRealizada: margemRealizada ?? null,
    qtdMedRealizada: qtdMedRealizada ?? null,
    receitaTarifariaWl: receitaTarifariaWl ?? null,
    dataLancamento: dataLancamento ? new Date(dataLancamento) : null,
    notas: notas ?? null,
  }

  const forecast = await prisma.forecastGeral.upsert({
    where: { mesRef },
    create: { mesRef, ...data },
    update: data,
  })

  // Sync metas when realizado values are provided
  const syncMetas: Promise<unknown>[] = []
  if (tpvRealizado != null) {
    syncMetas.push(prisma.meta.updateMany({ where: { tipo: 'TPV', periodo: mesRef }, data: { realizado: tpvRealizado } }))
  }
  if (qtdTransacoesRealizadas != null) {
    syncMetas.push(prisma.meta.updateMany({ where: { tipo: 'TRANSACOES', periodo: mesRef }, data: { realizado: qtdTransacoesRealizadas } }))
  }
  if (faturamentoRealizado != null) {
    syncMetas.push(prisma.meta.updateMany({ where: { tipo: 'RECEITA', periodo: mesRef }, data: { realizado: faturamentoRealizado } }))
  }
  if (syncMetas.length > 0) await Promise.all(syncMetas)

  return NextResponse.json({ forecast })
}
