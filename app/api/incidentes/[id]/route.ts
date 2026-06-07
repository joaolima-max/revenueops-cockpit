import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role === 'COMERCIAL') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { titulo, descricao, inicio, fim, downtimeMins, criticidade, satisfacao, clienteIds } = body

  const incidente = await prisma.incidente.update({
    where: { id },
    data: {
      ...(titulo !== undefined ? { titulo } : {}),
      ...(descricao !== undefined ? { descricao } : {}),
      ...(inicio !== undefined ? { inicio: new Date(inicio) } : {}),
      ...(fim !== undefined ? { fim: fim ? new Date(fim) : null } : {}),
      ...(downtimeMins !== undefined ? { downtimeMins } : {}),
      ...(criticidade !== undefined ? { criticidade } : {}),
      ...(satisfacao !== undefined ? { satisfacao } : {}),
    },
    include: {
      clientesAfetados: {
        include: { cliente: { select: { id: true, nome: true } } },
      },
    },
  })

  return NextResponse.json({ incidente })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  await prisma.incidente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
