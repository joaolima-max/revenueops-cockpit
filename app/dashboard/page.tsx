import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatDate, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from '@/lib/utils'

async function getDashboardData() {
  const [
    totalLeads,
    leadsGanhos,
    dealsGanhos,
    dealsPipeline,
    recentLeads,
    recentDeals,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: 'GANHO' } }),
    prisma.deal.aggregate({
      where: { stage: 'GANHO' },
      _sum: { value: true },
      _count: true,
    }),
    prisma.deal.aggregate({
      where: { stage: { notIn: ['GANHO', 'PERDIDO'] } },
      _sum: { value: true },
      _count: true,
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
  ])

  const taxaConversao = totalLeads > 0 ? ((leadsGanhos / totalLeads) * 100).toFixed(1) : '0'

  return {
    kpis: {
      totalLeads,
      leadsGanhos,
      taxaConversao,
      receitaFechada: dealsGanhos._sum.value || 0,
      negociosFechados: dealsGanhos._count,
      pipelineValue: dealsPipeline._sum.value || 0,
      negociosPipeline: dealsPipeline._count,
    },
    recentLeads,
    recentDeals,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  const data = await getDashboardData()

  const kpis = [
    {
      label: 'Total de Leads',
      value: data.kpis.totalLeads,
      sub: `${data.kpis.leadsGanhos} convertidos`,
      color: 'bg-blue-500',
    },
    {
      label: 'Taxa de Conversão',
      value: `${data.kpis.taxaConversao}%`,
      sub: 'leads → clientes',
      color: 'bg-purple-500',
    },
    {
      label: 'Receita Fechada',
      value: formatCurrency(data.kpis.receitaFechada),
      sub: `${data.kpis.negociosFechados} negócios`,
      color: 'bg-green-500',
    },
    {
      label: 'Pipeline Ativo',
      value: formatCurrency(data.kpis.pipelineValue),
      sub: `${data.kpis.negociosPipeline} negócios`,
      color: 'bg-orange-500',
    },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Bom dia, {session?.name.split(' ')[0]}!
        </h1>
        <p className="text-gray-500 mt-1">Aqui está o resumo do seu pipeline de receita.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className={`w-10 h-10 ${kpi.color} rounded-lg mb-4`} />
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-sm font-medium text-gray-700 mt-1">{kpi.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Leads Recentes</h2>
            <a href="/dashboard/leads" className="text-sm text-indigo-600 hover:underline">Ver todos</a>
          </div>
          <div className="space-y-3">
            {data.recentLeads.map((lead) => (
              <a key={lead.id} href={`/dashboard/leads/${lead.id}`}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                  <p className="text-xs text-gray-400 truncate">{lead.company || lead.email}</p>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[lead.status]}`}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(lead.createdAt)}</span>
                </div>
              </a>
            ))}
            {data.recentLeads.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum lead cadastrado</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Negócios Recentes</h2>
            <a href="/dashboard/deals" className="text-sm text-indigo-600 hover:underline">Ver todos</a>
          </div>
          <div className="space-y-3">
            {data.recentDeals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {deal.lead?.company || deal.lead?.name || deal.owner.name}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEAL_STAGE_COLORS[deal.stage]}`}>
                    {DEAL_STAGE_LABELS[deal.stage]}
                  </span>
                  <span className="text-xs font-semibold text-gray-700">{formatCurrency(deal.value)}</span>
                </div>
              </div>
            ))}
            {data.recentDeals.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum negócio cadastrado</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
