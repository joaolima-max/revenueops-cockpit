export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getCurrentMonth } from '@/lib/utils'
import ClienteDetailClient from './ClienteDetailClient'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  const mesAtual = getCurrentMonth()

  const [clienteRaw, users, parametros] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        processamentos: { orderBy: { mesRef: 'desc' } },
        forecasts: { orderBy: { mesRef: 'desc' } },
        tarefas: {
          orderBy: { createdAt: 'desc' },
          include: {
            responsavel: { select: { id: true, name: true } },
            criadoPor: { select: { id: true, name: true } },
          },
        },
        pedidos: { orderBy: { mesRef: 'desc' } },
        incidentes: { include: { incidente: true } },
        contasReceber: { orderBy: { dataVenc: 'desc' } },
        followUps: { orderBy: { updatedAt: 'desc' } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.parametro.findMany({ where: { chave: { in: ['CAC', 'LTV_MESES'] } } }),
  ])

  if (!clienteRaw) notFound()

  clienteRaw.incidentes.sort((a, b) =>
    new Date(b.incidente.inicio).getTime() - new Date(a.incidente.inicio).getTime()
  )

  const procs = clienteRaw.processamentos
  const mrr = (clienteRaw.mensalidadeApi || 0) + (clienteRaw.sustentacaoWhiteLabel || 0)
  const avgTarifaria = procs.length > 0
    ? procs.slice(0, 6).reduce((s, p) => s + p.receitaTarifaria, 0) / Math.min(procs.length, 6)
    : 0
  const ltvMeses = Number(parametros.find(p => p.chave === 'LTV_MESES')?.valor || 24)
  const ltv = (mrr + avgTarifaria) * ltvMeses
  const cac = Number(parametros.find(p => p.chave === 'CAC')?.valor || 0)

  const latestMesRef = procs[0]?.mesRef
  const [rankingData, totalClientes] = await Promise.all([
    latestMesRef
      ? prisma.processamento.findMany({
          where: { mesRef: latestMesRef },
          select: { clienteId: true, tpv: true },
          orderBy: { tpv: 'desc' },
        })
      : Promise.resolve([]),
    prisma.cliente.count({ where: { status: 'ATIVO' } }),
  ])
  const rankingPosition = rankingData.length > 0
    ? (rankingData.findIndex(r => r.clienteId === id) + 1) || null
    : null

  const now = new Date()
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 7)
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  let healthScore = 40
  if (clienteRaw.status === 'ATIVO') healthScore += 20
  if (procs[0]?.mesRef >= twoMonthsAgo) healthScore += 15
  if (procs.length >= 2 && procs[0].tpv >= procs[1].tpv) healthScore += 10
  if (clienteRaw.tpvEsperado && procs[0] && procs[0].tpv >= clienteRaw.tpvEsperado * 0.9) healthScore += 10
  if (clienteRaw.incidentes.some(ic => ic.incidente.criticidade === 'CRITICA' && new Date(ic.incidente.inicio) >= threeMonthsAgo)) healthScore -= 25
  if (clienteRaw.contasReceber.some(c => c.status === 'INADIMPLENTE')) healthScore -= 20
  healthScore = Math.max(0, Math.min(100, healthScore))

  return (
    <ClienteDetailClient
      cliente={JSON.parse(JSON.stringify(clienteRaw))}
      users={users}
      role={session?.role || 'OPERACIONAL'}
      currentUserId={session?.userId || ''}
      ltv={ltv}
      cac={cac}
      ltvMeses={ltvMeses}
      rankingPosition={rankingPosition}
      totalClientes={totalClientes}
      healthScore={healthScore}
      mesAtual={mesAtual}
    />
  )
}
