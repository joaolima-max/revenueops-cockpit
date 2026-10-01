import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notificar } from '@/lib/notificacoes'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const followUps = await prisma.followUp.findMany({
    include: {
      cliente: { select: { id: true, nome: true, segmento: true, modeloOperacional: true } },
      responsavel: { select: { id: true, name: true } },
    },
    // DATA PREVISTA primeiro: é o que a tela precisa destacar, e ordenar por
    // dia da semana punha o recorrente antes do que vence amanhã.
    orderBy: [
      { proximoContato: 'asc' }, { diaSemana: 'asc' },
      { horaInicio: 'asc' }, { dataInicio: 'asc' },
    ],
  })

  return NextResponse.json({ followUps })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const {
    clienteId, titulo, descricao, tipo, recorrente, diaSemana, horaInicio, horaFim,
    dataInicio, dataFim, notas, picoIntervaloDias, responsavelId, proximoContato,
  } = body

  if (!clienteId || !titulo) return NextResponse.json({ error: 'Cliente e título obrigatórios' }, { status: 400 })

  // Ensure the synthetic "Carteira Geral" client exists to satisfy the FK constraint
  if (clienteId === 'CARTEIRA_GERAL') {
    await prisma.cliente.upsert({
      where: { id: 'CARTEIRA_GERAL' },
      create: {
        id: 'CARTEIRA_GERAL',
        nome: 'Carteira Geral',
        modeloOperacional: 'API',
        status: 'ATIVO',
        ownerId: session.userId,
      },
      update: {},
    })
  }

  const followUp = await prisma.followUp.create({
    data: {
      clienteId, titulo, descricao: descricao || null, tipo: tipo || 'FOLLOW_UP',
      recorrente: !!recorrente,
      diaSemana: recorrente && diaSemana !== undefined ? parseInt(diaSemana) : null,
      horaInicio: horaInicio || null, horaFim: horaFim || null,
      dataInicio: !recorrente && dataInicio ? new Date(dataInicio) : null,
      dataFim: !recorrente && dataFim ? new Date(dataFim) : null,
      notas: notas || null,
      picoIntervaloDias: picoIntervaloDias ? parseInt(picoIntervaloDias) : null,
      // RESPONSÁVEL e DATA PREVISTA. Sem os dois, o follow-up não gera
      // lembrete: `lembretesDeFollowUp` exige dono e data para avisar no dia.
      responsavelId: responsavelId || null,
      proximoContato: proximoContato ? new Date(proximoContato) : null,
    },
    include: {
      cliente: { select: { id: true, nome: true, segmento: true, modeloOperacional: true } },
      responsavel: { select: { id: true, name: true } },
    },
  })

  /**
   * O RESPONSÁVEL É AVISADO AO SER DESIGNADO.
   *
   * O lembrete do cron avisa NO DIA do contato. Quem foi designado hoje para
   * um follow-up da semana que vem precisa saber agora — descobrir no próprio
   * dia não dá tempo de preparar a conversa.
   */
  if (followUp.responsavelId && followUp.responsavelId !== session.userId) {
    await notificar({
      destinatarioId: followUp.responsavelId,
      titulo: `Follow Up atribuído: ${followUp.cliente.nome}`,
      mensagem:
        `${session.name} atribuiu a você o follow-up "${followUp.titulo}" de ${followUp.cliente.nome}`
        + (followUp.proximoContato
          ? `, previsto para ${followUp.proximoContato.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`
          : ' (sem data prevista).'),
      origem: 'FOLLOW_UP',
      entidade: 'FollowUp',
      entidadeId: followUp.id,
      href: '/dashboard/followup',
    })
  }

  return NextResponse.json({ followUp }, { status: 201 })
}
