import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { notificar } from '@/lib/notificacoes'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { titulo, descricao, status, prioridade, dueDate, clienteId, responsavelId } = body

  // Quem era o responsável antes — para saber se houve REATRIBUIÇÃO e avisar
  // o novo dono. Sem isto, mudar o responsável deixava a pessoa sem saber.
  const anterior = await prisma.tarefa.findUnique({
    where: { id }, select: { responsavelId: true },
  })

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

  /**
   * REATRIBUIÇÃO avisa o novo responsável.
   *
   * Só quando o dono MUDOU: um ajuste de prioridade ou de título não é notícia
   * para quem já está com a tarefa, e notificar toda edição transformaria a
   * central em ruído.
   */
  const mudouDono = responsavelId !== undefined
    && anterior?.responsavelId !== tarefa.responsavelId
  if (mudouDono && tarefa.responsavelId !== session.userId) {
    await notificar({
      destinatarioId: tarefa.responsavelId,
      titulo: `Tarefa atribuída a você: ${tarefa.titulo}`,
      mensagem:
        `${session.name} passou a tarefa "${tarefa.titulo}" para você`
        + (tarefa.dueDate
          ? `, com prazo em ${tarefa.dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`
          : '.'),
      origem: 'TAREFA',
      entidade: 'Tarefa',
      entidadeId: tarefa.id,
      href: '/dashboard/tarefas',
    })
  }

  return NextResponse.json({ tarefa })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  await prisma.tarefa.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
