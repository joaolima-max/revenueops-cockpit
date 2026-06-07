import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      processamentos: { orderBy: { mesRef: 'desc' }, take: 12 },
      forecasts: { orderBy: { mesRef: 'desc' }, take: 12 },
    },
  })

  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  return NextResponse.json({ cliente })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const {
    nome, cnpj, email, telefone, modeloOperacional, status,
    segmento, operacao, scoreRisco,
    mensalidadeApi, sustentacaoWhiteLabel, setup,
    tpvEsperado, qtdTransacoesEsperada, qtdMedEsperada,
    receitaPrevistaMensal, volumeMinimo, descontoPercent, overpricePercent,
    dataFechamento, dataEncerramento, notas, ownerId,
  } = body

  const cliente = await prisma.cliente.update({
    where: { id },
    data: {
      ...(nome ? { nome } : {}),
      cnpj: cnpj ?? undefined, email: email ?? undefined, telefone: telefone ?? undefined,
      ...(modeloOperacional ? { modeloOperacional } : {}),
      ...(status ? { status } : {}),
      ...(segmento !== undefined ? { segmento: segmento || null } : {}),
      ...(operacao !== undefined ? { operacao: operacao || null } : {}),
      ...(scoreRisco !== undefined ? { scoreRisco: scoreRisco || null } : {}),
      mensalidadeApi: mensalidadeApi ?? undefined,
      sustentacaoWhiteLabel: sustentacaoWhiteLabel ?? undefined,
      setup: setup ?? undefined,
      tpvEsperado: tpvEsperado ?? undefined,
      qtdTransacoesEsperada: qtdTransacoesEsperada ?? undefined,
      qtdMedEsperada: qtdMedEsperada ?? undefined,
      receitaPrevistaMensal: receitaPrevistaMensal ?? undefined,
      volumeMinimo: volumeMinimo ?? undefined,
      descontoPercent: descontoPercent ?? undefined,
      overpricePercent: overpricePercent ?? undefined,
      dataFechamento: dataFechamento ? new Date(dataFechamento) : undefined,
      dataEncerramento: dataEncerramento ? new Date(dataEncerramento) : undefined,
      notas: notas ?? undefined,
      ...(ownerId ? { ownerId } : {}),
    },
  })

  return NextResponse.json({ cliente })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  await prisma.cliente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
