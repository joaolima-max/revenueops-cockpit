import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const incidentes = await prisma.incidente.findMany({
    include: {
      clientesAfetados: {
        include: { cliente: { select: { id: true, nome: true } } },
      },
    },
    orderBy: { inicio: 'desc' },
    take: 50,
  })

  return NextResponse.json({ incidentes })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role === 'COMERCIAL') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const body = await request.json()
  const { titulo, descricao, inicio, fim, downtimeMins, criticidade, satisfacao, clienteIds } = body

  if (!titulo || !inicio) {
    return NextResponse.json({ error: 'Título e início são obrigatórios' }, { status: 400 })
  }

  const incidente = await prisma.incidente.create({
    data: {
      titulo, descricao: descricao || null,
      inicio: new Date(inicio),
      fim: fim ? new Date(fim) : null,
      downtimeMins: downtimeMins ?? null,
      criticidade: criticidade || 'MEDIA',
      satisfacao: satisfacao ?? null,
      clientesAfetados: clienteIds?.length ? {
        create: clienteIds.map((cid: string) => ({ clienteId: cid })),
      } : undefined,
    },
    include: {
      clientesAfetados: {
        include: { cliente: { select: { id: true, nome: true } } },
      },
    },
  })

  return NextResponse.json({ incidente }, { status: 201 })
}
