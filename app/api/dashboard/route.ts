import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const [
    totalLeads,
    leadsGanhos,
    leadsPerdidos,
    totalDeals,
    dealsGanhos,
    dealsPipeline,
    recentLeads,
    recentDeals,
    leadsByStatus,
    dealsByStage,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: 'GANHO' } }),
    prisma.lead.count({ where: { status: 'PERDIDO' } }),
    prisma.deal.count(),
    prisma.deal.aggregate({
      where: { stage: 'GANHO' },
      _sum: { value: true },
      _count: true,
    }),
    prisma.deal.aggregate({
      where: { stage: { notIn: ['GANHO', 'PERDIDO'] } },
      _sum: { value: true },
    }),
    prisma.lead.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { name: true } } },
    }),
    prisma.deal.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { name: true } },
        lead: { select: { name: true, company: true } },
      },
    }),
    prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.deal.groupBy({
      by: ['stage'],
      _sum: { value: true },
      _count: true,
    }),
  ])

  const taxaConversao = totalLeads > 0 ? ((leadsGanhos / totalLeads) * 100).toFixed(1) : '0'

  return NextResponse.json({
    kpis: {
      totalLeads,
      leadsGanhos,
      leadsPerdidos,
      taxaConversao,
      totalDeals,
      receitaFechada: dealsGanhos._sum.value || 0,
      negociosFechados: dealsGanhos._count,
      pipelineValue: dealsPipeline._sum.value || 0,
    },
    recentLeads,
    recentDeals,
    leadsByStatus,
    dealsByStage,
  })
}
