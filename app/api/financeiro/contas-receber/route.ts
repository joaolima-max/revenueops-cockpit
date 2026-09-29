import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || ''
  const mes = searchParams.get('mes') || ''

  const contas = await prisma.contaReceber.findMany({
    where: {
      ...(status ? { status: status as 'PENDENTE' | 'FATURADO' | 'PAGO' | 'INADIMPLENTE' } : {}),
      ...(mes ? { dataVenc: {
        gte: new Date(`${mes}-01`),
        lt: new Date(new Date(`${mes}-01`).getFullYear(), new Date(`${mes}-01`).getMonth() + 1, 1),
      }} : {}),
    },
    include: { cliente: { select: { id: true, nome: true, modeloOperacional: true } } },
    orderBy: { dataVenc: 'asc' },
  })

  return NextResponse.json({ contas })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { clienteId, descricao, tipo, valor, dataVenc, parcela, totalParcel, notas } = body

  if (!clienteId || !descricao || !valor || !dataVenc) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const conta = await prisma.contaReceber.create({
    data: {
      clienteId, descricao, tipo: tipo || 'OUTRO', valor: parseFloat(valor),
      dataVenc: new Date(dataVenc),
      parcela: parcela ? parseInt(parcela) : null,
      totalParcel: totalParcel ? parseInt(totalParcel) : null,
      notas: notas || null,
    },
    include: { cliente: { select: { id: true, nome: true, modeloOperacional: true } } },
  })

  return NextResponse.json({ conta }, { status: 201 })
}
