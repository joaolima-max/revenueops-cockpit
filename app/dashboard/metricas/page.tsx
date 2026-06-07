export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatCurrency, formatTPV, formatPercent, getLast12Months, getCurrentMonth, formatMesRef, SEGMENTO_LABELS, MODELO_OPERACIONAL_LABELS } from '@/lib/utils'

async function getMetricas() {
  const meses = getLast12Months()
  const mesAtual = getCurrentMonth()

  const [clientes, processamentos12M, procMesAtual, metas] = await Promise.all([
    prisma.cliente.findMany({
      where: { status: { in: ['ATIVO', 'ENCERRADO'] } },
      select: {
        id: true, nome: true, status: true, segmento: true, modeloOperacional: true,
        scoreRisco: true, tpvEsperado: true, receitaPrevistaMensal: true,
        mensalidadeApi: true, sustentacaoWhiteLabel: true,
        descontoPercent: true, overpricePercent: true,
        dataFechamento: true, dataEncerramento: true,
      },
    }),
    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: { mesRef: { in: meses } },
      _sum: { tpv: true, receitaTarifaria: true, floating: true, qtdTransacoes: true },
      _avg: { tpv: true, receitaTarifaria: true },
    }),
    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: { mesRef: mesAtual },
      _sum: { tpv: true, receitaTarifaria: true, floating: true },
    }),
    prisma.meta.findMany({ where: { periodo: mesAtual } }),
  ])

  const procMap = new Map(processamentos12M.map(p => [p.clienteId, p]))
  const procMesMap = new Map(procMesAtual.map(p => [p.clienteId, p]))

  const ativos = clientes.filter(c => c.status === 'ATIVO')

  // Concentração de receita
  const receitaPorCliente = processamentos12M.map(p => ({
    clienteId: p.clienteId,
    receita: (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0),
  })).sort((a, b) => b.receita - a.receita)

  const receitaTotal = receitaPorCliente.reduce((s, r) => s + r.receita, 0)
  const top3Receita = receitaPorCliente.slice(0, 3).reduce((s, r) => s + r.receita, 0)
  const concentracao = receitaTotal > 0 ? (top3Receita / receitaTotal) * 100 : 0

  // Por segmento
  const segMap: Record<string, { count: number; receita: number; tpv: number }> = {}
  for (const c of ativos) {
    const seg = c.segmento || 'OUTROS'
    if (!segMap[seg]) segMap[seg] = { count: 0, receita: 0, tpv: 0 }
    segMap[seg].count++
    const proc = procMap.get(c.id)
    segMap[seg].receita += (proc?._sum.receitaTarifaria || 0) + (proc?._sum.floating || 0)
    segMap[seg].tpv += proc?._sum.tpv || 0
  }

  // MRR real
  const mrr = ativos.reduce((s, c) => s + (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0), 0)

  // Receita mês por modelo
  const receitaApiMes = procMesAtual
    .filter(p => {
      const c = clientes.find(c => c.id === p.clienteId)
      return c?.modeloOperacional === 'API'
    })
    .reduce((s, p) => s + (p._sum.receitaTarifaria || 0), 0)

  const receitaWLMes = procMesAtual
    .filter(p => {
      const c = clientes.find(c => c.id === p.clienteId)
      return c?.modeloOperacional === 'WHITE_LABEL'
    })
    .reduce((s, p) => s + (p._sum.receitaTarifaria || 0), 0)

  return {
    concentracao, mrr, receitaTotal, top3Receita,
    segMap, receitaApiMes, receitaWLMes,
    totalAtivos: ativos.length,
    scoreCritico: ativos.filter(c => c.scoreRisco === 'CRITICO').length,
    scoreAlto: ativos.filter(c => c.scoreRisco === 'ALTO').length,
  }
}

export default async function MetricasPage() {
  const data = await getMetricas()

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Métricas Financeiras</h1>
        <p className="text-gray-600 text-sm mt-0.5">Visão analítica da carteira e receita</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'MRR Total', value: formatCurrency(data.mrr), color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Receita 12M', value: formatCurrency(data.receitaTotal), color: 'text-sky-400', bg: 'bg-sky-500/10' },
          { label: 'Concentração Top 3', value: formatPercent(data.concentracao, 1), color: data.concentracao > 70 ? 'text-red-400' : 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Clientes Risco Alto/Crítico', value: String(data.scoreCritico + data.scoreAlto), color: data.scoreCritico > 0 ? 'text-red-400' : 'text-orange-400', bg: 'bg-red-500/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-5`}>
            <p className="text-gray-500 text-xs mb-1.5">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Receita por Segmento */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Receita por Segmento (12M)</h3>
          <div className="space-y-3">
            {Object.entries(data.segMap)
              .sort((a, b) => b[1].receita - a[1].receita)
              .map(([seg, info]) => {
                const pct = data.receitaTotal > 0 ? (info.receita / data.receitaTotal) * 100 : 0
                return (
                  <div key={seg}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300">{SEGMENTO_LABELS[seg] || seg}</span>
                        <span className="text-xs text-gray-600">{info.count} cliente{info.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-emerald-400">{formatCurrency(info.receita)}</span>
                        <span className="text-xs text-gray-600 ml-2">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: 'linear-gradient(90deg, #10b981, #0ea5e9)' }} />
                    </div>
                  </div>
                )
              })}
            {Object.keys(data.segMap).length === 0 && (
              <p className="text-gray-600 text-sm text-center py-4">Nenhum dado de processamento disponível</p>
            )}
          </div>
        </div>

        {/* Receita por Modelo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Receita Mês por Modelo</h3>
          <div className="space-y-5">
            {[
              { label: 'API', value: data.receitaApiMes, color: 'bg-sky-500' },
              { label: 'White Label', value: data.receitaWLMes, color: 'bg-violet-500' },
            ].map(row => {
              const total = data.receitaApiMes + data.receitaWLMes
              const pct = total > 0 ? (row.value / total) * 100 : 0
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">{row.label}</span>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-white">{formatCurrency(row.value)}</span>
                      <span className="text-xs text-gray-600 ml-2">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full">
                    <div className={`h-2 ${row.color} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-800">
            <h4 className="text-xs font-semibold text-gray-500 mb-3">Concentração de Receita</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Top 3 clientes</span>
                <span className={data.concentracao > 70 ? 'text-red-400 font-semibold' : 'text-amber-400'}>
                  {formatPercent(data.concentracao, 1)} da receita 12M
                </span>
              </div>
              {data.concentracao > 70 && (
                <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
                  Alta concentração — risco de churn impacta significativamente a receita.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
