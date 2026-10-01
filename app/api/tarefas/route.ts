import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notificar } from '@/lib/notificacoes'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || ''
  const prioridade = searchParams.get('prioridade') || ''
  const clienteId = searchParams.get('clienteId') || ''
  const responsavelId = searchParams.get('responsavelId') || ''

  const tarefas = await prisma.tarefa.findMany({
    where: {
      ...(status ? { status: status as 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA' } : {}),
      ...(prioridade ? { prioridade: prioridade as 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA' } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(responsavelId ? { responsavelId } : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      criadoPor: { select: { id: true, name: true } },
    },
    orderBy: [{ prioridade: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json({ tarefas })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { titulo, descricao, prioridade, dueDate, clienteId, responsavelId } = body

  // PRAZO É OBRIGATÓRIO. Uma tarefa sem data de vencimento não entra em
  // nenhum dos lembretes (7, 3, 1, no dia, 1 após) — ela simplesmente nunca
  // cobra ninguém, e é exatamente a tarefa que se esquece.
  if (!titulo || !responsavelId || !dueDate) {
    return NextResponse.json(
      { error: 'Título, responsável e prazo são obrigatórios' }, { status: 400 },
    )
  }

  const tarefa = await prisma.tarefa.create({
    data: {
      titulo, descricao: descricao || null,
      prioridade: prioridade || 'MEDIA',
      dueDate: new Date(dueDate),
      clienteId: clienteId || null,
      responsavelId,
      criadoPorId: session.userId,
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true } },
      criadoPor: { select: { id: true, name: true } },
    },
  })

  /**
   * O RESPONSÁVEL É AVISADO NA HORA — não espera o cron.
   *
   * Os lembretes de 7/3/1 dias cobram quem já sabe da tarefa. Quem acabou de
   * ser designado precisa saber AGORA, senão descobre a tarefa no primeiro
   * lembrete — que pode ser no dia do vencimento, se o prazo for curto.
   *
   * Sem `chave`: é notificação de ação direta, acontece uma vez e não é
   * reprocessada. Atribuir a mesma tarefa de novo é um aviso novo e legítimo.
   *
   * Não se notifica quem criou a tarefa para si mesmo: a pessoa acabou de
   * digitá-la.
   */
  if (tarefa.responsavelId !== session.userId) {
    await notificar({
      destinatarioId: tarefa.responsavelId,
      titulo: `Nova tarefa: ${tarefa.titulo}`,
      mensagem:
        `${session.name} atribuiu a você a tarefa "${tarefa.titulo}", ` +
        `com prazo em ${tarefa.dueDate!.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
      origem: 'TAREFA',
      entidade: 'Tarefa',
      entidadeId: tarefa.id,
      href: '/dashboard/tarefas',
    })
  }

  return NextResponse.json({ tarefa }, { status: 201 })
}
