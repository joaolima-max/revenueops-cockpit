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
      ...(modelo ? { modeloOperacional: modelo as 'API' | 'WHITE_LABEL' | 'BAAS' } : {}),
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

  // CADASTRO COMERCIAL ENXUTO: nome, CNPJ, modelo operacional, e-mail,
  // telefone, segmento, data de fechamento e mensalidade de API. Campos de
  // expectativa financeira (TPV esperado, receita prevista, desconto,
  // overprice, setup, sustentação) e Score de Risco saíram do produto — as
  // condições de BaaS/White Label moram em CondicaoComercial e o realizado em
  // LancamentoDiario. Nada aqui entra no lugar deles.
  const body = await request.json()
  const {
    nome, cnpj, email, telefone, modeloOperacional,
    segmento, mensalidadeApi, dataFechamento, notas, gestorId,
  } = body

  if (!nome || !modeloOperacional) {
    return NextResponse.json({ error: 'Nome e modelo operacional são obrigatórios' }, { status: 400 })
  }

  const cliente = await prisma.cliente.create({
    data: {
      nome, cnpj: cnpj || null, email: email || null, telefone: telefone || null,
      modeloOperacional,
      segmento: segmento || null,
      mensalidadeApi: mensalidadeApi ?? null,
      dataFechamento: dataFechamento ? new Date(dataFechamento) : null,
      notas: notas || null,
      gestorId: gestorId || null,
      ownerId: session.userId,
    },
  })

  await logAudit(session.userId, 'CRIOU_CLIENTE', 'Cliente', cliente.id, `Nome: ${cliente.nome}`)

  return NextResponse.json({ cliente }, { status: 201 })
}
