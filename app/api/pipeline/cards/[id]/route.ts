import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { acessoAoCard } from '@/lib/pipeline-db'

/**
 * DETALHES DO CARD — tudo o que a visão de detalhe mostra, numa chamada.
 *
 * Lead vinculado (com empresa e CNPJ), cliente, responsável, funil, etapa,
 * resultado, datas, histórico completo e anotações. Nada aqui é copiado: o
 * CNPJ é o do Lead, o responsável é o `owner` do card, e o histórico é a mesma
 * `PipelineMovimentacao` que o quadro grava.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const [card, historico, comentarios] = await Promise.all([
    prisma.deal.findUnique({
      where: { id },
      select: {
        id: true, title: true, notes: true, resultado: true, resultadoEm: true,
        createdAt: true, updatedAt: true, closedAt: true, expectedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        funil: { select: { id: true, nome: true, area: true } },
        etapa: { select: { id: true, nome: true, ordem: true } },
        cliente: { select: { id: true, nome: true, cnpj: true } },
        lead: {
          select: {
            id: true, name: true, company: true, cnpj: true, email: true,
            phone: true, position: true, segmento: true, canal: true,
            status: true, source: true, createdAt: true,
          },
        },
      },
    }),
    prisma.pipelineMovimentacao.findMany({
      where: { dealId: id },
      include: {
        user: { select: { name: true } },
        funilOrigem: { select: { nome: true } },
        etapaOrigem: { select: { nome: true } },
        funilDestino: { select: { nome: true } },
        etapaDestino: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.dealComentario.findMany({
      where: { dealId: id },
      include: { autor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  if (!card) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })

  return NextResponse.json({ card, historico, comentarios, acesso: ctx.acesso })
}
