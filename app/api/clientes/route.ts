import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const modelo = searchParams.get('modelo') || ''

  const clientes = await prisma.cliente.findMany({
    where: {
      ...(search ? { nome: { contains: search, mode: 'insensitive' } } : {}),
      ...(status ? { status: status as 'ATIVO' | 'INATIVO' | 'PROSPECCAO' | 'ENCERRADO' } : {}),
      ...(modelo ? { modeloOperacional: modelo as 'API' | 'WHITE_LABEL' } : {}),
    },
    include: { owner: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { nome: 'asc' }],
  })

  return NextResponse.json({ clientes })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const {
    nome, cnpj, email, telefone, modeloOperacional,
    mensalidadeApi, sustentacaoWhiteLabel, setup,
    tpvEsperado, qtdTransacoesEsperada, qtdMedEsperada,
    receitaPrevistaMensal, dataFechamento, notas,
  } = body

  if (!nome || !modeloOperacional) {
    return NextResponse.json({ error: 'Nome e modelo operacional são obrigatórios' }, { status: 400 })
  }

  const cliente = await prisma.cliente.create({
    data: {
      nome, cnpj: cnpj || null, email: email || null, telefone: telefone || null,
      modeloOperacional,
      mensalidadeApi: mensalidadeApi ?? null,
      sustentacaoWhiteLabel: sustentacaoWhiteLabel ?? null,
      setup: setup ?? null,
      tpvEsperado: tpvEsperado ?? null,
      qtdTransacoesEsperada: qtdTransacoesEsperada ?? null,
      qtdMedEsperada: qtdMedEsperada ?? null,
      receitaPrevistaMensal: receitaPrevistaMensal ?? null,
      dataFechamento: dataFechamento ? new Date(dataFechamento) : null,
      notas: notas || null,
      ownerId: session.userId,
    },
  })

  return NextResponse.json({ cliente }, { status: 201 })
}
