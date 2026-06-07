import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { titulo, descricao, tipo, recorrente, diaSemana, horaInicio, horaFim, dataInicio, dataFim, notas, frequenciaDias, ultimoContato, proximoContato } = body

  const followUp = await prisma.followUp.update({
    where: { id },
    data: {
      ...(titulo !== undefined && { titulo }),
      descricao: descricao !== undefined ? descricao || null : undefined,
      ...(tipo !== undefined && { tipo }),
      ...(recorrente !== undefined && { recorrente: !!recorrente }),
      ...(recorrente !== undefined && { diaSemana: recorrente && diaSemana !== undefined ? parseInt(diaSemana) : null }),
      horaInicio: horaInicio !== undefined ? horaInicio || null : undefined,
      horaFim: horaFim !== undefined ? horaFim || null : undefined,
      ...(dataInicio !== undefined && { dataInicio: !recorrente && dataInicio ? new Date(dataInicio) : null }),
      ...(dataFim !== undefined && { dataFim: !recorrente && dataFim ? new Date(dataFim) : null }),
      notas: notas !== undefined ? notas || null : undefined,
      frequenciaDias: frequenciaDias !== undefined ? (frequenciaDias ? parseInt(frequenciaDias) : null) : undefined,
      ultimoContato: ultimoContato !== undefined ? (ultimoContato ? new Date(ultimoContato) : null) : undefined,
      proximoContato: proximoContato !== undefined ? (proximoContato ? new Date(proximoContato) : null) : undefined,
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
