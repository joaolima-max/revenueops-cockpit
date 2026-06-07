export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import TarefasClient from './TarefasClient'

export default async function TarefasPage() {
  const session = await getSession()

  const [tarefas, usuarios, clientes] = await Promise.all([
    prisma.tarefa.findMany({
      include: {
        cliente: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, name: true } },
        criadoPor: { select: { id: true, name: true } },
      },
      orderBy: [{ prioridade: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.cliente.findMany({
      where: { status: { in: ['ATIVO', 'PROSPECCAO'] } },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  return (
    <TarefasClient
      initial={JSON.parse(JSON.stringify(tarefas))}
      usuarios={usuarios}
      clientes={clientes}
      userId={session?.userId || ''}
    />
  )
}
