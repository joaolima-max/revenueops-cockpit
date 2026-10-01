import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notificar } from '@/lib/notificacoes'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const {
    titulo, descricao, tipo, recorrente, diaSemana, horaInicio, horaFim,
    dataInicio, dataFim, notas, picoIntervaloDias, ultimoContato, proximoContato,
    responsavelId,
  } = body

  // Para detectar REATRIBUIÇÃO — trocar o dono sem avisar deixa o novo
  // responsável sem saber que o follow-up é dele.
  const anterior = await prisma.followUp.findUnique({
    where: { id }, select: { responsavelId: true },
  })

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
      picoIntervaloDias: picoIntervaloDias !== undefined ? (picoIntervaloDias ? parseInt(picoIntervaloDias) : null) : undefined,
      ultimoContato: ultimoContato !== undefined ? (ultimoContato ? new Date(ultimoContato) : null) : undefined,
      proximoContato: proximoContato !== undefined ? (proximoContato ? new Date(proximoContato) : null) : undefined,
      responsavelId: responsavelId !== undefined ? (responsavelId || null) : undefined,
    },
    include: {
      cliente: { select: { id: true, nome: true, segmento: true, modeloOperacional: true } },
      responsavel: { select: { id: true, name: true } },
    },
  })

  const mudouDono = responsavelId !== undefined
    && anterior?.responsavelId !== followUp.responsavelId
  if (mudouDono && followUp.responsavelId && followUp.responsavelId !== session.userId) {
    await notificar({
      destinatarioId: followUp.responsavelId,
      titulo: `Follow Up atribuído: ${followUp.cliente.nome}`,
      mensagem:
        `${session.name} passou para você o follow-up "${followUp.titulo}" de ${followUp.cliente.nome}`
        + (followUp.proximoContato
          ? `, previsto para ${followUp.proximoContato.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`
          : ' (sem data prevista).'),
      origem: 'FOLLOW_UP',
      entidade: 'FollowUp',
      entidadeId: followUp.id,
      href: '/dashboard/followup',
    })
  }

  return NextResponse.json({ followUp })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  await prisma.followUp.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
