import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const processamentos = await prisma.processamento.findMany({
    where: { clienteId: id },
    orderBy: { mesRef: 'desc' },
  })

  return NextResponse.json({ processamentos })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id: clienteId } = await params
  const { mesRef, tpv, qtdTransacoes, qtdMed, receitaTarifaria, floating } = await request.json()

  if (!mesRef) return NextResponse.json({ error: 'Mês de referência é obrigatório' }, { status: 400 })

  const proc = await prisma.processamento.upsert({
    where: { clienteId_mesRef: { clienteId, mesRef } },
    create: { clienteId, mesRef, tpv: tpv || 0, qtdTransacoes: qtdTransacoes || 0, qtdMed: qtdMed || 0, receitaTarifaria: receitaTarifaria || 0, floating: floating || 0 },
    update: { tpv: tpv || 0, qtdTransacoes: qtdTransacoes || 0, qtdMed: qtdMed || 0, receitaTarifaria: receitaTarifaria || 0, floating: floating || 0 },
  })

  return NextResponse.json({ processamento: proc })
}
