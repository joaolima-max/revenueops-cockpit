import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { titulo, descricao, tipo, recorrente, diaSemana, horaInicio, horaFim, dataInicio, dataFim, notas } = body

  const followUp = await prisma.followUp.update({
    where: { id },
    data: {
      titulo, descricao: descricao || null, tipo,
      recorrente: !!recorrente,
      diaSemana: recorrente && diaSemana !== undefined ? parseInt(diaSemana) : null,
      horaInicio: horaInicio || null, horaFim: horaFim || null,
      dataInicio: !recorrente && dataInicio ? new Date(dataInicio) : null,
      dataFim: !recorrente && dataFim ? new Date(dataFim) : null,
      notas: notas || null,
    },
    include: { cliente: { select: { id: true, nome: true, segmento: true, modeloOperacional: true } } },
  })

  return NextResponse.json({ followUp })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  await prisma.followUp.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
