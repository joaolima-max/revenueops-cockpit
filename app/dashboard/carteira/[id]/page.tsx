export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ClienteDetailClient from './ClienteDetailClient'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()

  const [cliente, users] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        tarefas: {
          orderBy: { createdAt: 'desc' },
          include: {
            responsavel: { select: { id: true, name: true } },
            criadoPor: { select: { id: true, name: true } },
          },
        },
        contasReceber: { orderBy: { dataVenc: 'desc' } },
        followUps: { orderBy: { proximoContato: 'asc' } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!cliente) notFound()

  // LTV e CAC saíram: vinham do ambiente "Parâmetros", que não existe mais, e
  // já eram props mortas — a tela de detalhe recebia os três valores e não
  // renderizava nenhum deles.
  const mrr = cliente.mensalidadeApi ?? 0

  // Score de saúde sobre sinais que pertencem ao cliente.
  let healthScore = 40
  if (cliente.status === 'ATIVO') healthScore += 25
  if (mrr > 0) healthScore += 15
  if (cliente.dataFechamento) healthScore += 10
  if (cliente.contasReceber.some((c) => c.status === 'INADIMPLENTE')) healthScore -= 30
  if (cliente.contasReceber.some((c) => c.status !== 'PAGO' && c.dataVenc < new Date())) healthScore -= 10
  healthScore = Math.max(0, Math.min(100, healthScore))

  return (
    <ClienteDetailClient
      cliente={JSON.parse(JSON.stringify(cliente))}
      users={users}
      role={session?.role || 'OPERACIONAL'}
      currentUserId={session?.userId || ''}
      healthScore={healthScore}
    />
  )
}
