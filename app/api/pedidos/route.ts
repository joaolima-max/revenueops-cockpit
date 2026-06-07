import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || ''
  const clienteId = searchParams.get('clienteId') || ''
  const mesRef = searchParams.get('mesRef') || ''

  const pedidos = await prisma.pedidoCobravel.findMany({
    where: {
      ...(status ? { status: status as 'PENDENTE' | 'FATURADO' | 'PAGO' | 'CANCELADO' } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(mesRef ? { mesRef } : {}),
    },
    include: { cliente: { select: { id: true, nome: true } } },
    orderBy: [{ mesRef: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ pedidos })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { clienteId, tipo, descricao, valor, mesRef } = body

  if (!clienteId || !tipo || !valor || !mesRef) {
    return NextResponse.json({ error: 'Campos obrigatórios: clienteId, tipo, valor, mesRef' }, { status: 400 })
  }

  const pedido = await prisma.pedidoCobravel.create({
    data: { clienteId, tipo, descricao: descricao || null, valor: Number(valor), mesRef },
    include: { cliente: { select: { id: true, nome: true } } },
  })

  return NextResponse.json({ pedido }, { status: 201 })
}
