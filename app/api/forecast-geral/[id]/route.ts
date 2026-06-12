import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const {
    tpvPrevisto, qtdTransacoesPrevista, faturamentoPrevisto, margemPrevista,
    tpvRealizado, qtdTransacoesRealizadas, faturamentoRealizado, margemRealizada, notas,
    qtdMedRealizada, receitaTarifariaWl, dataLancamento,
  } = await request.json()

  const forecast = await prisma.forecastGeral.update({
    where: { id },
    data: {
      tpvPrevisto: tpvPrevisto ?? undefined,
      qtdTransacoesPrevista: qtdTransacoesPrevista ?? undefined,
      faturamentoPrevisto: faturamentoPrevisto ?? undefined,
      margemPrevista: margemPrevista ?? undefined,
      tpvRealizado: tpvRealizado ?? undefined,
      qtdTransacoesRealizadas: qtdTransacoesRealizadas ?? undefined,
      faturamentoRealizado: faturamentoRealizado ?? undefined,
      margemRealizada: margemRealizada ?? undefined,
      qtdMedRealizada: qtdMedRealizada !== undefined ? (qtdMedRealizada ?? null) : undefined,
      receitaTarifariaWl: receitaTarifariaWl !== undefined ? (receitaTarifariaWl ?? null) : undefined,
      dataLancamento: dataLancamento !== undefined ? (dataLancamento ? new Date(dataLancamento) : null) : undefined,
      notas: notas ?? undefined,
    },
  })

  // Sync metas when realizado values are updated
  const mesRef = forecast.mesRef
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

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  await prisma.forecastGeral.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
