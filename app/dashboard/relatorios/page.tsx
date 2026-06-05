import { prisma } from '@/lib/prisma'
import { formatCurrency, formatTPV, formatPercent, formatMesRef, getLast12Months, CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS, MODELO_OPERACIONAL_LABELS } from '@/lib/utils'

export default async function RelatoriosPage() {
  const meses = getLast12Months()

  const [
    clientes, clientesByStatus, clientesByModelo,
    receitaTotal12M, tpvTotal12M, forecasts12M,
    topClientes,
  ] = await Promise.all([
    prisma.cliente.count(),
    prisma.cliente.groupBy({ by: ['status'], _count: true }),
    prisma.cliente.groupBy({ by: ['modeloOperacional'], _count: true }),
    prisma.processamento.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses } },
      _sum: { receitaTarifaria: true, floating: true, tpv: true },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.processamento.aggregate({
      where: { mesRef: { in: meses } },
      _sum: { tpv: true, receitaTarifaria: true, floating: true },
    }),
    prisma.forecast.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses } },
      _sum: { receitaPrevista: true, receitaRealizada: true },
    }),
    prisma.processamento.groupBy({
      by: ['clienteId'],
      _sum: { receitaTarifaria: true, floating: true, tpv: true },
      orderBy: { _sum: { receitaTarifaria: 'desc' } },
      take: 5,
    }),
  ])

  const clienteNames = await prisma.cliente.findMany({
    where: { id: { in: topClientes.map(t => t.clienteId) } },
    select: { id: true, nome: true, modeloOperacional: true, status: true },
  })
  const cMap = new Map(clienteNames.map(c => [c.id, c]))

  const fcComReal = forecasts12M.filter(f => f._sum.receitaRealizada && f._sum.receitaPrevista && f._sum.receitaPrevista > 0)
  const precisaoMedia = fcComReal.length > 0
    ? fcComReal.reduce((a, f) => a + (f._sum.receitaRealizada! / f._sum.receitaPrevista!) * 100, 0) / fcComReal.length
    : 0

  const receitaTotalGeral = (tpvTotal12M._sum.receitaTarifaria || 0) + (tpvTotal12M._sum.floating || 0)

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Relatórios</h1>
        <p className="text-gray-600 text-sm mt-0.5">Últimos 12 meses · visão consolidada</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { l: 'Total Clientes', v: String(clientes), c: 'text-white' },
          { l: 'Receita 12M (Tarifária)', v: formatCurrency(tpvTotal12M._sum.receitaTarifaria || 0), c: 'text-indigo-400' },
          { l: 'Floating 12M', v: formatCurrency(tpvTotal12M._sum.floating || 0), c: 'text-emerald-400' },
          { l: 'Precisão Forecast', v: precisaoMedia > 0 ? formatPercent(precisaoMedia, 1) : '—', c: precisaoMedia >= 90 ? 'text-emerald-400' : 'text-amber-400' },
        ].map(k => (
          <div key={k.l} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-600 text-xs mb-1.5">{k.l}</p>
            <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Clientes por Status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Carteira por Status</h3>
          <div className="space-y-3">
            {clientesByStatus.map(g => {
              const pct = clientes > 0 ? (g._count / clientes) * 100 : 0
              return (
                <div key={g.status}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLIENTE_STATUS_COLORS[g.status]}`}>{CLIENTE_STATUS_LABELS[g.status]}</span>
                    <span className="text-sm font-semibold text-white">{g._count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full">
                    <div className="h-1.5 bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Clientes por Modelo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Carteira por Modelo</h3>
          <div className="space-y-4">
            {clientesByModelo.map(g => {
              const pct = clientes > 0 ? (g._count / clientes) * 100 : 0
              return (
                <div key={g.modeloOperacional}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-300">{MODELO_OPERACIONAL_LABELS[g.modeloOperacional]}</span>
                    <span className="text-sm font-semibold text-white">{g._count} cliente{g._count !== 1 ? 's' : ''} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full">
                    <div className="h-1.5 bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Receita Mensal 12M */}
        <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Receita por Mês (últimos 12 meses)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Mês', 'TPV', 'Rec. Tarifária', 'Floating', 'Total', 'Take Rate'].map(h => (
                    <th key={h} className={`text-xs font-medium text-gray-600 pb-2 ${h === 'Mês' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map(mes => {
                  const r = receitaTotal12M.find(x => x.mesRef === mes)
                  const tpv = r?._sum.tpv || 0
                  const tar = r?._sum.receitaTarifaria || 0
                  const fl = r?._sum.floating || 0
                  const tr = tpv > 0 ? (tar / tpv) * 100 : 0
                  return (
                    <tr key={mes} className="border-b border-gray-800/50">
                      <td className="py-2.5 text-gray-300 font-medium">{formatMesRef(mes)}</td>
                      <td className="py-2.5 text-right text-sky-400">{tpv > 0 ? formatTPV(tpv) : '—'}</td>
                      <td className="py-2.5 text-right text-indigo-400">{tar > 0 ? formatCurrency(tar) : '—'}</td>
                      <td className="py-2.5 text-right text-emerald-400">{fl > 0 ? formatCurrency(fl) : '—'}</td>
                      <td className="py-2.5 text-right text-white font-medium">{(tar + fl) > 0 ? formatCurrency(tar + fl) : '—'}</td>
                      <td className="py-2.5 text-right text-amber-400">{tr > 0 ? formatPercent(tr, 3) : '—'}</td>
                    </tr>
                  )
                })}
                <tr className="border-t border-gray-700">
                  <td className="py-2.5 text-gray-500 font-semibold text-xs">TOTAL</td>
                  <td className="py-2.5 text-right text-sky-300 font-semibold">{formatTPV(tpvTotal12M._sum.tpv || 0)}</td>
                  <td className="py-2.5 text-right text-indigo-300 font-semibold">{formatCurrency(tpvTotal12M._sum.receitaTarifaria || 0)}</td>
                  <td className="py-2.5 text-right text-emerald-300 font-semibold">{formatCurrency(tpvTotal12M._sum.floating || 0)}</td>
                  <td className="py-2.5 text-right text-white font-semibold">{formatCurrency(receitaTotalGeral)}</td>
                  <td className="py-2.5 text-right text-amber-300 font-semibold">
                    {(tpvTotal12M._sum.tpv || 0) > 0 ? formatPercent(((tpvTotal12M._sum.receitaTarifaria || 0) / (tpvTotal12M._sum.tpv || 1)) * 100, 3) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Clientes */}
        <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Clientes por Receita (12 meses)</h3>
          <div className="space-y-3">
            {topClientes.map((t, i) => {
              const c = cMap.get(t.clienteId)
              const rec = (t._sum.receitaTarifaria || 0) + (t._sum.floating || 0)
              const pct = receitaTotalGeral > 0 ? (rec / receitaTotalGeral) * 100 : 0
              return (
                <div key={t.clienteId} className="flex items-center gap-4">
                  <span className="text-gray-700 text-xs w-4">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white">{c?.nome || '—'}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-600">{formatTPV(t._sum.tpv || 0)} TPV</span>
                        <span className="text-sm font-semibold text-indigo-400">{formatCurrency(rec)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-1.5 bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
            {topClientes.length === 0 && <p className="text-gray-700 text-sm text-center py-4">Nenhum dado de processamento</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
