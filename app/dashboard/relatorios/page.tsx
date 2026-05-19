import { prisma } from '@/lib/prisma'
import { formatCurrency, LEAD_STATUS_LABELS, DEAL_STAGE_LABELS } from '@/lib/utils'

export default async function RelatoriosPage() {
  const [
    leadsByStatus,
    dealsByStage,
    topDeals,
    users,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], _count: true, _sum: { value: true } }),
    prisma.deal.groupBy({ by: ['stage'], _count: true, _sum: { value: true } }),
    prisma.deal.findMany({
      where: { stage: { notIn: ['PERDIDO'] } },
      orderBy: { value: 'desc' },
      take: 10,
      include: {
        owner: { select: { name: true } },
        lead: { select: { name: true, company: true } },
      },
    }),
    prisma.user.findMany({
      select: {
        id: true, name: true, role: true,
        _count: { select: { leads: true, deals: true } },
      },
    }),
  ])

  const totalLeads = leadsByStatus.reduce((s, g) => s + g._count, 0)
  const totalDealsValue = dealsByStage.reduce((s, g) => s + (g._sum.value || 0), 0)
  const wonDeals = dealsByStage.find((g) => g.stage === 'GANHO')

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral de performance do pipeline</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Leads por Status</h2>
          <div className="space-y-3">
            {leadsByStatus.map((g) => {
              const pct = totalLeads > 0 ? (g._count / totalLeads) * 100 : 0
              return (
                <div key={g.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{LEAD_STATUS_LABELS[g.status]}</span>
                    <span className="text-sm font-semibold text-gray-900">{g._count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {g._sum.value ? (
                    <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(g._sum.value)}</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Negócios por Estágio</h2>
          <div className="space-y-3">
            {dealsByStage.map((g) => {
              const pct = totalDealsValue > 0 ? ((g._sum.value || 0) / totalDealsValue) * 100 : 0
              return (
                <div key={g.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{DEAL_STAGE_LABELS[g.stage]}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(g._sum.value || 0)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{g._count} negócio(s)</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top 10 Negócios por Valor</h2>
          <div className="space-y-2">
            {topDeals.map((deal, i) => (
              <div key={deal.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {deal.lead?.company || deal.lead?.name || deal.owner.name}
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                  {formatCurrency(deal.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Performance por Usuário</h2>
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-400">{user.role}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{user._count.deals} negócios</p>
                  <p className="text-xs text-gray-400">{user._count.leads} leads</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
