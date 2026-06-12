export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatCurrency, formatTPV, formatPercent, getLast12Months, getCurrentMonth, formatMesRef, SEGMENTO_LABELS, MODELO_OPERACIONAL_LABELS } from '@/lib/utils'

async function getMetricas() {
  const meses = getLast12Months()
  const mesAtual = getCurrentMonth()

  const [clientes, processamentos12M, procMesAtual, receitaRealizada12M, receitaMesAtual, metas, fgMesAtual] = await Promise.all([
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
    // Receita lançada no módulo Receita (agregada, não por cliente)
    prisma.receitaRealizada.findMany({
      where: { mesRef: { in: meses } },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.receitaRealizada.findFirst({ where: { mesRef: mesAtual } }),
    prisma.meta.findMany({ where: { periodo: mesAtual } }),
    prisma.forecastGeral.findFirst({ where: { mesRef: mesAtual } }),
  ])

  const procMap = new Map(processamentos12M.map(p => [p.clienteId, p]))
  const procMesMap = new Map(procMesAtual.map(p => [p.clienteId, p]))
  const ativos = clientes.filter(c => c.status === 'ATIVO')

  // Receita total 12M: processamento + receita lançada
  const receitaProcTotal = processamentos12M.reduce((s, p) => s + (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0), 0)
  const receitaLancadaTotal = receitaRealizada12M.reduce((s, r) => s + r.receitaTarifaria + r.floatingRealizado, 0)
  // Usa receitaLançada se maior (evita duplicação), senão usa processamento
  const receitaTotal12M = Math.max(receitaProcTotal, receitaLancadaTotal)

  // Concentração de receita (por cliente, a partir de processamentos)
  const receitaPorCliente = processamentos12M.map(p => ({
    clienteId: p.clienteId,
    nome: clientes.find(c => c.id === p.clienteId)?.nome || 'Desconhecido',
    receita: (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0),
  })).sort((a, b) => b.receita - a.receita)

  const receitaTotalProc = receitaPorCliente.reduce((s, r) => s + r.receita, 0)
  const top3Receita = receitaPorCliente.slice(0, 3).reduce((s, r) => s + r.receita, 0)
  const concentracao = receitaTotalProc > 0 ? (top3Receita / receitaTotalProc) * 100 : 0

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

  // Receita mês por modelo (processamento)
  const clienteMap = new Map(clientes.map(c => [c.id, c]))
  const receitaApiMes = procMesAtual
    .filter(p => clienteMap.get(p.clienteId)?.modeloOperacional === 'API')
    .reduce((s, p) => s + (p._sum.receitaTarifaria || 0), 0)
  const receitaWLMes = procMesAtual
    .filter(p => clienteMap.get(p.clienteId)?.modeloOperacional === 'WHITE_LABEL')
    .reduce((s, p) => s + (p._sum.receitaTarifaria || 0), 0)

  // Receita mês atual: maior entre processamento e receita lançada
  const receitaMesProc = procMesAtual.reduce((s, p) => s + (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0), 0)
  const receitaMesLancada = receitaMesAtual ? receitaMesAtual.receitaTarifaria + receitaMesAtual.floatingRealizado : 0
  const receitaMesTotal = Math.max(receitaMesProc, receitaMesLancada)

  // TPV mês: processamento se disponível, senão forecastGeral realizado
  const tpvMesProc = procMesAtual.reduce((s, p) => s + (p._sum.tpv || 0), 0)
  const tpvMes = tpvMesProc > 0 ? tpvMesProc : (fgMesAtual?.tpvRealizado || 0)
  const takeRateMes = tpvMes > 0 ? (receitaMesTotal / tpvMes) * 100 : 0

  // Metas do mês
  const metaReceita = metas.find(m => m.tipo === 'RECEITA')
  const metaTPV = metas.find(m => m.tipo === 'TPV')

  // Clientes por receita esperada vs realizada (realização)
  const realizacaoClientes = ativos
    .filter(c => (c.receitaPrevistaMensal || 0) > 0)
    .map(c => {
      const proc = procMesMap.get(c.id)
      const realizado = (proc?._sum.receitaTarifaria || 0) + (proc?._sum.floating || 0) + (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0)
      const previsto = c.receitaPrevistaMensal || 0
      return {
        nome: c.nome,
        previsto,
        realizado,
        pct: previsto > 0 ? (realizado / previsto) * 100 : 0,
        segmento: c.segmento,
        modelo: c.modeloOperacional,
      }
    })
    .sort((a, b) => a.pct - b.pct)

  return {
    concentracao, mrr, receitaTotal: receitaTotal12M, top3Receita,
    segMap, receitaApiMes, receitaWLMes, receitaMesTotal,
    tpvMes, takeRateMes,
    totalAtivos: ativos.length,
    scoreCritico: ativos.filter(c => c.scoreRisco === 'CRITICO').length,
    scoreAlto: ativos.filter(c => c.scoreRisco === 'ALTO').length,
    metaReceita, metaTPV,
    top5Clientes: receitaPorCliente.slice(0, 5),
    realizacaoClientes: realizacaoClientes.slice(0, 8),
    receitaMesAtual: receitaMesAtual ?? null,
    mesAtual,
  }
}

export default async function MetricasPage() {
  const data = await getMetricas()

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Métricas Financeiras</h1>
        <p className="text-gray-600 text-sm mt-0.5">Visão analítica cruzando processamento, receita lançada e carteira</p>
      </div>

      {/* KPIs */}
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

      {/* Receita mês atual — cruzamento */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Receita {formatMesRef(data.mesAtual)} — Cruzamento de Fontes</h3>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-600 mb-1">Total do Mês</p>
            <p className="text-xl font-bold text-white">{formatCurrency(data.receitaMesTotal)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Maior entre proc. e lançada</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Via Processamento</p>
            <p className="text-xl font-bold text-sky-400">{formatCurrency(data.receitaApiMes + data.receitaWLMes)}</p>
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-sky-400">API: {formatCurrency(data.receitaApiMes)}</p>
              <p className="text-xs text-violet-400">WL: {formatCurrency(data.receitaWLMes)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Receita Lançada</p>
            <p className="text-xl font-bold text-emerald-400">
              {data.receitaMesAtual ? formatCurrency(data.receitaMesAtual.receitaTarifaria + data.receitaMesAtual.floatingRealizado) : '—'}
            </p>
            {data.receitaMesAtual && (
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-indigo-400">Tarifária: {formatCurrency(data.receitaMesAtual.receitaTarifaria)}</p>
                <p className="text-xs text-emerald-400">Floating: {formatCurrency(data.receitaMesAtual.floatingRealizado)}</p>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Take Rate</p>
            <p className={`text-xl font-bold ${data.takeRateMes > 0 ? 'text-amber-400' : 'text-gray-700'}`}>
              {data.takeRateMes > 0 ? formatPercent(data.takeRateMes, 3) : '—'}
            </p>
            <p className="text-xs text-gray-700 mt-0.5">TPV: {formatTPV(data.tpvMes)}</p>
          </div>
        </div>
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
                        <span className="text-sm text-gray-300">{SEGMENTO_LABELS[seg as keyof typeof SEGMENTO_LABELS] || seg}</span>
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

        {/* Top 5 clientes + concentração */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top 5 Clientes por Receita (12M)</h3>
          <div className="space-y-3">
            {data.top5Clientes.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-4">Nenhum processamento registrado</p>
            )}
            {data.top5Clientes.map((c, i) => {
              const pct = data.receitaTotal > 0 ? (c.receita / data.receitaTotal) * 100 : 0
              return (
                <div key={c.clienteId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-4">#{i + 1}</span>
                      <span className="text-sm text-gray-300 truncate max-w-[140px]">{c.nome}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-emerald-400">{formatCurrency(c.receita)}</span>
                      <span className={`text-xs ml-2 ${pct > 30 ? 'text-red-400' : 'text-gray-600'}`}>{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 30 ? '#ef4444' : 'linear-gradient(90deg, #10b981, #0ea5e9)' }} />
                  </div>
                </div>
              )
            })}
          </div>
          {data.concentracao > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Top 3 concentração</span>
                <span className={data.concentracao > 70 ? 'text-red-400 font-semibold' : 'text-amber-400'}>
                  {formatPercent(data.concentracao, 1)}
                </span>
              </div>
              {data.concentracao > 70 && (
                <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mt-2">
                  Alta concentração — risco de churn impacta significativamente a receita.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Realização por cliente */}
      {data.realizacaoClientes.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Realização por Cliente — {formatMesRef(data.mesAtual)}</h3>
          <p className="text-xs text-gray-600 mb-4">Receita realizada vs prevista (somente clientes com receita prevista cadastrada)</p>
          <div className="space-y-3">
            {data.realizacaoClientes.map(c => (
              <div key={c.nome}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-300 truncate max-w-[180px]">{c.nome}</span>
                    <span className="text-xs text-gray-700">{SEGMENTO_LABELS[c.segmento as keyof typeof SEGMENTO_LABELS] || c.segmento || '—'}</span>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <span className="text-xs text-gray-600">{formatCurrency(c.realizado)} / {formatCurrency(c.previsto)}</span>
                    <span className={`text-xs font-semibold ${c.pct >= 100 ? 'text-emerald-400' : c.pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                      {c.pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full">
                  <div className="h-1.5 rounded-full transition-all" style={{
                    width: `${Math.min(c.pct, 100)}%`,
                    background: c.pct >= 100 ? '#10b981' : c.pct >= 70 ? '#f59e0b' : '#ef4444',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receita por Modelo */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Receita Mês por Modelo Operacional</h3>
        <div className="space-y-5 max-w-lg">
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
      </div>
    </div>
  )
}
