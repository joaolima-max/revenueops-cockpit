import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const modelo = searchParams.get('modelo') || ''
  const segmento = searchParams.get('segmento') || ''

  const clientes = await prisma.cliente.findMany({
    where: {
      ...(search ? { nome: { contains: search, mode: 'insensitive' } } : {}),
      ...(status ? { status: status as 'ATIVO' | 'INATIVO' | 'PROSPECCAO' | 'ENCERRADO' } : {}),
      ...(modelo ? { modeloOperacional: modelo as 'API' | 'WHITE_LABEL' } : {}),
      ...(segmento ? { segmento: segmento as 'IGAMING' | 'ECOMMERCE' | 'SAAS' | 'ERP' | 'TELECOM' | 'CRIPTOMOEDAS' | 'VAREJO' | 'OUTROS' } : {}),
    },
    include: {
      owner: { select: { name: true } },
      gestor: { select: { id: true, name: true } },
    },
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
    segmento, operacao, scoreRisco,
    mensalidadeApi, sustentacaoWhiteLabel, setup,
    tpvEsperado, qtdTransacoesEsperada, qtdMedEsperada,
    receitaPrevistaMensal, volumeMinimo,
    descontoPercent, overpricePercent,
    dataFechamento, notas, gestorId,
  } = body

  if (!nome || !modeloOperacional) {
    return NextResponse.json({ error: 'Nome e modelo operacional são obrigatórios' }, { status: 400 })
  }

  const cliente = await prisma.cliente.create({
    data: {
      nome, cnpj: cnpj || null, email: email || null, telefone: telefone || null,
      modeloOperacional,
      segmento: segmento || null,
      operacao: operacao || null,
      scoreRisco: scoreRisco || null,
      mensalidadeApi: mensalidadeApi ?? null,
      sustentacaoWhiteLabel: sustentacaoWhiteLabel ?? null,
      setup: setup ?? null,
      tpvEsperado: tpvEsperado ?? null,
      qtdTransacoesEsperada: qtdTransacoesEsperada ?? null,
      qtdMedEsperada: qtdMedEsperada ?? null,
      receitaPrevistaMensal: receitaPrevistaMensal ?? null,
      descontoPercent: descontoPercent ?? null,
      overpricePercent: overpricePercent ?? null,
      dataFechamento: dataFechamento ? new Date(dataFechamento) : null,
      notas: notas || null,
      gestorId: gestorId || null,
      ownerId: session.userId,
    },
  })

  await logAudit(session.userId, 'CRIOU_CLIENTE', 'Cliente', cliente.id, `Nome: ${cliente.nome}`)

  return NextResponse.json({ cliente }, { status: 201 })
}
