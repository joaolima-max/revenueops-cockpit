import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const followUps = await prisma.followUp.findMany({
    include: { cliente: { select: { id: true, nome: true, segmento: true, modeloOperacional: true } } },
    orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }, { dataInicio: 'asc' }],
  })

  return NextResponse.json({ followUps })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { clienteId, titulo, descricao, tipo, recorrente, diaSemana, horaInicio, horaFim, dataInicio, dataFim, notas } = body

  if (!clienteId || !titulo) return NextResponse.json({ error: 'Cliente e título obrigatórios' }, { status: 400 })

  const followUp = await prisma.followUp.create({
    data: {
      clienteId, titulo, descricao: descricao || null, tipo: tipo || 'FOLLOW_UP',
      recorrente: !!recorrente,
      diaSemana: recorrente && diaSemana !== undefined ? parseInt(diaSemana) : null,
      horaInicio: horaInicio || null, horaFim: horaFim || null,
      dataInicio: !recorrente && dataInicio ? new Date(dataInicio) : null,
      dataFim: !recorrente && dataFim ? new Date(dataFim) : null,
      notas: notas || null,
    },
    include: { cliente: { select: { id: true, nome: true, segmento: true, modeloOperacional: true } } },
  })

  return NextResponse.json({ followUp }, { status: 201 })
}
