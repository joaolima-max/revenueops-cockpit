export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatCurrency, formatTPV, formatPercent, getLast12Months } from '@/lib/utils'

async function getRanking() {
  const meses = getLast12Months()

  const [topReceita, topTpv, topTransacoes] = await Promise.all([
    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: { mesRef: { in: meses } },
      _sum: { receitaTarifaria: true, floating: true, tpv: true, qtdTransacoes: true },
      orderBy: { _sum: { receitaTarifaria: 'desc' } },
      take: 10,
    }),
    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: { mesRef: { in: meses } },
      _sum: { tpv: true, receitaTarifaria: true },
      orderBy: { _sum: { tpv: 'desc' } },
      take: 10,
    }),
    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: { mesRef: { in: meses } },
      _sum: { qtdTransacoes: true, tpv: true },
      orderBy: { _sum: { qtdTransacoes: 'desc' } },
      take: 10,
    }),
  ])

  const allIds = [...new Set([
    ...topReceita.map(t => t.clienteId),
    ...topTpv.map(t => t.clienteId),
    ...topTransacoes.map(t => t.clienteId),
  ])]

  const clientes = await prisma.cliente.findMany({
    where: { id: { in: allIds } },
    select: { id: true, nome: true, segmento: true, modeloOperacional: true, status: true },
  })
  const cMap = new Map(clientes.map(c => [c.id, c]))

  const totalReceita = topReceita.reduce((s, t) => s + (t._sum.receitaTarifaria || 0) + (t._sum.floating || 0), 0)
  const totalTpv = topTpv.reduce((s, t) => s + (t._sum.tpv || 0), 0)

  return {
    topReceita: topReceita.map((t, i) => ({
      rank: i + 1,
      cliente: cMap.get(t.clienteId),
      receita: (t._sum.receitaTarifaria || 0) + (t._sum.floating || 0),
      tpv: t._sum.tpv || 0,
      pct: totalReceita > 0 ? (((t._sum.receitaTarifaria || 0) + (t._sum.floating || 0)) / totalReceita) * 100 : 0,
    })),
    topTpv: topTpv.map((t, i) => ({
      rank: i + 1,
      cliente: cMap.get(t.clienteId),
      tpv: t._sum.tpv || 0,
      receita: t._sum.receitaTarifaria || 0,
      pct: totalTpv > 0 ? ((t._sum.tpv || 0) / totalTpv) * 100 : 0,
    })),
    topTransacoes: topTransacoes.map((t, i) => ({
      rank: i + 1,
      cliente: cMap.get(t.clienteId),
      qtd: t._sum.qtdTransacoes || 0,
      tpv: t._sum.tpv || 0,
    })),
    totalReceita,
    totalTpv,
  }
}

function RankBadge({ rank }: { rank: number }) {
  const colors = ['text-amber-400', 'text-gray-300', 'text-amber-600']
  return (
    <span className={`text-sm font-bold ${colors[rank - 1] || 'text-gray-600'} w-6 text-center`}>
      {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
    </span>
  )
}

export default async function RankingPage() {
  const { topReceita, topTpv, topTransacoes, totalReceita } = await getRanking()

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Ranking de Clientes</h1>
        <p className="text-gray-600 text-sm mt-0.5">Últimos 12 meses · Top 10 por métrica</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Top Receita */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-emerald-500/10 rounded flex items-center justify-center">
              <span className="text-emerald-400 text-xs">R$</span>
            </span>
            Top Receita
          </h3>
          <div className="space-y-3">
            {topReceita.map(row => (
              <div key={row.cliente?.id} className="flex items-center gap-3">
                <RankBadge rank={row.rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white truncate">{row.cliente?.nome || '—'}</span>
                    <span className="text-sm font-semibold text-emerald-400 flex-shrink-0 ml-2">{formatCurrency(row.receita)}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full">
                    <div className="h-1 bg-emerald-500 rounded-full" style={{ width: `${Math.min(row.pct, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {topReceita.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Sem dados</p>}
          </div>
        </div>

        {/* Top TPV */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-sky-500/10 rounded flex items-center justify-center">
              <span className="text-sky-400 text-xs">TPV</span>
            </span>
            Top Volume (TPV)
          </h3>
          <div className="space-y-3">
            {topTpv.map(row => (
              <div key={row.cliente?.id} className="flex items-center gap-3">
                <RankBadge rank={row.rank} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white truncate">{row.cliente?.nome || '—'}</span>
                    <span className="text-sm font-semibold text-sky-400 flex-shrink-0 ml-2">{formatTPV(row.tpv)}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full">
                    <div className="h-1 bg-sky-500 rounded-full" style={{ width: `${Math.min(row.pct, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {topTpv.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Sem dados</p>}
          </div>
        </div>

        {/* Top Transações */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-violet-500/10 rounded flex items-center justify-center">
              <span className="text-violet-400 text-xs">TX</span>
            </span>
            Top Transações
          </h3>
          <div className="space-y-3">
            {topTransacoes.map((row, i) => {
              const maxQtd = topTransacoes[0]?.qtd || 1
              return (
                <div key={row.cliente?.id} className="flex items-center gap-3">
                  <RankBadge rank={row.rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white truncate">{row.cliente?.nome || '—'}</span>
                      <span className="text-sm font-semibold text-violet-400 flex-shrink-0 ml-2">
                        {row.qtd.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full">
                      <div className="h-1 bg-violet-500 rounded-full" style={{ width: `${(row.qtd / maxQtd) * 100}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
            {topTransacoes.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Sem dados</p>}
          </div>
        </div>
      </div>

      {/* Tabela consolidada Top 10 Receita */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Consolidado — Top 10 por Receita Total</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['#', 'Cliente', 'Segmento', 'Modelo', 'TPV 12M', 'Receita 12M', '% Carteira'].map(h => (
                  <th key={h} className={`text-xs font-medium text-gray-600 pb-2 ${h === '#' || h === 'Cliente' || h === 'Segmento' || h === 'Modelo' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topReceita.map(row => (
                <tr key={row.cliente?.id} className="border-b border-gray-800/50">
                  <td className="py-2.5 text-gray-600 font-bold text-xs w-6">{row.rank}</td>
                  <td className="py-2.5 text-white font-medium">{row.cliente?.nome || '—'}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{row.cliente?.segmento || '—'}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{row.cliente?.modeloOperacional === 'WHITE_LABEL' ? 'WL' : row.cliente?.modeloOperacional || '—'}</td>
                  <td className="py-2.5 text-right text-sky-400">{formatTPV(row.tpv)}</td>
                  <td className="py-2.5 text-right text-emerald-400 font-semibold">{formatCurrency(row.receita)}</td>
                  <td className="py-2.5 text-right text-gray-400">{formatPercent(row.pct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
