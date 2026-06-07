import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { titulo, descricao, status, prioridade, dueDate, clienteId, responsavelId } = body

  const tarefa = await prisma.tarefa.update({
    where: { id },
    data: {
      ...(titulo !== undefined ? { titulo } : {}),
      ...(descricao !== undefined ? { descricao } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(prioridade !== undefined ? { prioridade } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(clienteId !== undefined ? { clienteId: clienteId || null } : {}),
      ...(responsavelId !== undefined ? { responsavelId } : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ tarefa })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  await prisma.tarefa.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
