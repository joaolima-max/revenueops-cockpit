export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ClienteDetailClient from './ClienteDetailClient'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()

  const [cliente, users, parametros] = await Promise.all([
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
    prisma.parametro.findMany({ where: { chave: { in: ['CAC', 'LTV_MESES'] } } }),
  ])

  if (!cliente) notFound()

  // LTV a partir do contrato do cliente. TPV é indicador da empresa e não entra
  // aqui — não existe TPV por cliente nesta arquitetura.
  const mrr = (cliente.mensalidadeApi ?? 0) + (cliente.sustentacaoWhiteLabel ?? 0)
  const ltvMeses = Number(parametros.find((p) => p.chave === 'LTV_MESES')?.valor ?? 24)
  const ltv = mrr * ltvMeses
  const cac = Number(parametros.find((p) => p.chave === 'CAC')?.valor ?? 0)

  // Score de saúde sobre sinais que pertencem ao cliente.
  let healthScore = 40
  if (cliente.status === 'ATIVO') healthScore += 25
  if (mrr > 0) healthScore += 15
  if (cliente.dataFechamento) healthScore += 10
  if (cliente.contasReceber.some((c) => c.status === 'INADIMPLENTE')) healthScore -= 30
  if (cliente.contasReceber.some((c) => c.status !== 'PAGO' && c.dataVenc < new Date())) healthScore -= 10
  if (cliente.scoreRisco === 'ALTO') healthScore -= 10
  if (cliente.scoreRisco === 'CRITICO') healthScore -= 20
  healthScore = Math.max(0, Math.min(100, healthScore))

  return (
    <ClienteDetailClient
      cliente={JSON.parse(JSON.stringify(cliente))}
      users={users}
      role={session?.role || 'OPERACIONAL'}
      currentUserId={session?.userId || ''}
      ltv={ltv}
      cac={cac}
      ltvMeses={ltvMeses}
      healthScore={healthScore}
    />
  )
}
