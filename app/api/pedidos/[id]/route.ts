import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status, tipo, descricao, valor } = body

  const pedido = await prisma.pedidoCobravel.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(tipo !== undefined ? { tipo } : {}),
      ...(descricao !== undefined ? { descricao } : {}),
      ...(valor !== undefined ? { valor: Number(valor) } : {}),
    },
    include: { cliente: { select: { id: true, nome: true } } },
  })

  return NextResponse.json({ pedido })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  await prisma.pedidoCobravel.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
