import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

/** Comentários com autor e data/hora. Separados de `Lead.notes`, que é a observação livre do cadastro. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const comentarios = await prisma.leadComentario.findMany({
    where: { leadId: id },
    include: { autor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ comentarios })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const { texto } = await request.json()
  const conteudo = String(texto ?? '').trim()
  if (!conteudo) return NextResponse.json({ error: 'Escreva o comentário.' }, { status: 400 })

  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true } })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const comentario = await prisma.leadComentario.create({
    data: { leadId: id, autorId: session.userId, texto: conteudo.slice(0, 2000) },
    include: { autor: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ comentario }, { status: 201 })
}
