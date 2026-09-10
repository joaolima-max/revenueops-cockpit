import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { acessoAoCard } from '@/lib/pipeline-db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const historico = await prisma.pipelineMovimentacao.findMany({
    where: { dealId: id },
    include: {
      user: { select: { name: true } },
      funilOrigem: { select: { nome: true } },
      etapaOrigem: { select: { nome: true } },
      funilDestino: { select: { nome: true } },
      etapaDestino: { select: { nome: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ historico })
}
