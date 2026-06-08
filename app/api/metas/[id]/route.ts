import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const { valor, realizado } = await request.json()

  const meta = await prisma.meta.update({
    where: { id },
    data: {
      ...(valor !== undefined ? { valor: Number(valor) } : {}),
      ...(realizado !== undefined ? { realizado: realizado !== null ? Number(realizado) : null } : {}),
    },
  })

  return NextResponse.json({ meta })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  await prisma.meta.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
