import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  acessoAoCard, auditarPipeline, cardExcluido, ERRO_CARD_EXCLUIDO,
} from '@/lib/pipeline-db'

/**
 * ANOTAÇÕES DO CARD — texto, autor, data e hora.
 *
 * Mesma estrutura de `LeadComentario`, que já existia: conversa sobre a
 * oportunidade, separada de `Deal.notes`, que é o campo de observação do
 * cadastro. Não se sobrescreve uma anotação de outra pessoa.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const comentarios = await prisma.dealComentario.findMany({
    where: { dealId: id },
    include: { autor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ comentarios })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  // Quem enxerga o card pode comentar nele. Anotar é participar da conversa,
  // não alterar o cadastro — exigir `editar` silenciaria quem acompanha.
  if (!ctx.acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  if (cardExcluido(ctx.deal)) {
    return NextResponse.json({ error: ERRO_CARD_EXCLUIDO }, { status: 409 })
  }

  const { texto } = await request.json()
  const t = String(texto ?? '').trim()
  if (!t) return NextResponse.json({ error: 'Escreva a anotação.' }, { status: 400 })

  const comentario = await prisma.dealComentario.create({
    data: { dealId: id, autorId: session.userId, texto: t.slice(0, 2000) },
    include: { autor: { select: { id: true, name: true } } },
  })

  await auditarPipeline(
    session.userId, 'COMENTOU_CARD', 'Deal', id, `${ctx.deal.title}: ${t.slice(0, 80)}`,
  )

  return NextResponse.json({ comentario }, { status: 201 })
}
