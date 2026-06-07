export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatTPV, formatPercent, formatCompact, getLast12Months, getCurrentMonth, formatMesRef } from '@/lib/utils'
import DashboardCharts from '@/components/dashboard/DashboardCharts'

async function getData() {
  const meses = getLast12Months()
  const mesAtual = getCurrentMonth()
  const anoAtual = new Date().getFullYear().toString()

  const [
    clientesAtivos, clientesEncerradosMes,
    procMes, proc12M, rec12M, mrrAgg,
    metaRec, metaTPV, metaMRR,
    fg12M, fgMesAtual,
  ] = await Promise.all([
    prisma.cliente.count({ where: { status: 'ATIVO' } }),
    prisma.cliente.count({
      where: { status: 'ENCERRADO', dataEncerramento: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    }),
    prisma.processamento.aggregate({
      where: { mesRef: mesAtual },
      _sum: { tpv: true, receitaTarifaria: true, floating: true, qtdMed: true, qtdTransacoes: true },
    }),
    prisma.processamento.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses } },
      _sum: { tpv: true, receitaTarifaria: true, floating: true },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.receitaRealizada.findMany({ where: { mesRef: { in: meses } }, orderBy: { mesRef: 'asc' } }),
    prisma.cliente.aggregate({ where: { status: 'ATIVO' }, _sum: { mensalidadeApi: true, sustentacaoWhiteLabel: true } }),
    prisma.meta.findFirst({ where: { tipo: 'RECEITA', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'TPV', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'MRR', periodo: mesAtual } }),
    prisma.forecastGeral.findMany({ where: { mesRef: { in: meses } }, orderBy: { mesRef: 'asc' } }),
    prisma.forecastGeral.findFirst({ where: { mesRef: mesAtual } }),
  ])

  const tpv = procMes._sum.tpv || 0
  const receita = procMes._sum.receitaTarifaria || 0
  const floating = procMes._sum.floating || 0
  const qtdMed = procMes._sum.qtdMed || 0
  const qtdTx = procMes._sum.qtdTransacoes || 0
  const mrr = (mrrAgg._sum.mensalidadeApi || 0) + (mrrAgg._sum.sustentacaoWhiteLabel || 0)
  const takeRate = tpv > 0 ? (receita / tpv) * 100 : 0
  const med = qtdTx > 0 ? (qtdMed / qtdTx) * 100 : 0
  const receitaAno = rec12M.filter(r => r.mesRef.startsWith(anoAtual)).reduce((s, r) => s + r.receitaTarifaria + r.floatingRealizado, 0)

  // Precisão forecast geral: meses com realizado vs previsto
  const fgComReal = fg12M.filter(f => f.faturamentoRealizado != null && f.faturamentoPrevisto > 0)
  const precisao = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => a + (f.faturamentoRealizado! / f.faturamentoPrevisto) * 100, 0) / fgComReal.length
    : 0

  const procMap = new Map(proc12M.map(p => [p.mesRef, p._sum]))
  const recMap = new Map(rec12M.map(r => [r.mesRef, r]))
  const fgMap = new Map(fg12M.map(f => [f.mesRef, f]))

  const chartData = meses.map(mes => {
    const p = procMap.get(mes), r = recMap.get(mes), fg = fgMap.get(mes)
    const t = p?.tpv || 0, rv = r?.receitaTarifaria || 0
    return {
      mes,
      receitaTarifaria: rv,
      floating: r?.floatingRealizado || 0,
      tpv: t,
      faturamentoPrevisto: fg?.faturamentoPrevisto || 0,
      faturamentoRealizado: fg?.faturamentoRealizado || 0,
      tpvPrevisto: fg?.tpvPrevisto || 0,
      tpvRealizado: fg?.tpvRealizado || 0,
      takeRate: t > 0 ? (rv / t) * 100 : 0,
    }
  })

  return {
    kpis: { clientesAtivos, mrr, tpv, receita, floating, takeRate, med, churn: clientesEncerradosMes, receitaAno, precisao, qtdTx },
    metas: { receita: metaRec, tpv: metaTPV, mrr: metaMRR },
    chartData,
    mrrEvolution: meses.map(mes => ({ mes, mrr })),
    mesAtual,
    fgMesAtual,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  const { kpis, metas, chartData, mrrEvolution, mesAtual, fgMesAtual } = await getData()

  const primary = [
    { label: 'Receita Total (Ano)', value: formatCompact(kpis.receitaAno), sub: 'Tarifária + Floating', color: 'text-indigo-400', bg: 'bg-indigo-500/10', meta: metas.receita, metaVal: kpis.receita },
    { label: 'MRR', value: formatCurrency(kpis.mrr), sub: 'Receita recorrente mensal', color: 'text-emerald-400', bg: 'bg-emerald-500/10', meta: metas.mrr, metaVal: kpis.mrr },
    { label: `TPV ${formatMesRef(mesAtual)}`, value: formatTPV(kpis.tpv), sub: 'Volume processado no mês', color: 'text-sky-400', bg: 'bg-sky-500/10', meta: metas.tpv, metaVal: kpis.tpv },
    { label: 'Clientes Ativos', value: String(kpis.clientesAtivos), sub: kpis.churn > 0 ? `-${kpis.churn} churn este mês` : 'sem churn este mês', color: 'text-violet-400', bg: 'bg-violet-500/10', meta: null, metaVal: 0 },
  ]

  const secondary = [
    { label: 'Receita Tarifária', value: formatCurrency(kpis.receita), color: 'text-indigo-400' },
    { label: 'Floating (Mês)', value: formatCurrency(kpis.floating), color: 'text-emerald-400' },
    { label: 'Take Rate', value: formatPercent(kpis.takeRate, 3), color: 'text-amber-400' },
    { label: 'Churn (Mês)', value: String(kpis.churn), color: kpis.churn > 0 ? 'text-red-400' : 'text-emerald-400' },
    { label: 'MED Médio', value: formatPercent(kpis.med, 2), color: 'text-sky-400' },
    { label: 'Precisão Forecast', value: kpis.precisao > 0 ? formatPercent(kpis.precisao, 1) : '—', color: kpis.precisao >= 90 ? 'text-emerald-400' : kpis.precisao > 0 ? 'text-amber-400' : 'text-gray-600' },
  ]

  // Forecast do mês atual — progresso
  const fg = fgMesAtual
  const fgCards = fg ? [
    {
      label: 'TPV Previsto', previsto: fg.tpvPrevisto, realizado: fg.tpvRealizado,
      fmt: formatTPV, color: 'text-sky-400', bar: '#0ea5e9',
    },
    {
      label: 'Faturamento Previsto', previsto: fg.faturamentoPrevisto, realizado: fg.faturamentoRealizado,
      fmt: formatCurrency, color: 'text-emerald-400', bar: '#10b981',
    },
    {
      label: 'Qtd. Transações', previsto: fg.qtdTransacoesPrevista, realizado: fg.qtdTransacoesRealizadas,
      fmt: (v: number) => v.toLocaleString('pt-BR'), color: 'text-violet-400', bar: '#8b5cf6',
    },
    {
      label: 'Margem Prevista', previsto: fg.margemPrevista, realizado: fg.margemRealizada,
      fmt: (v: number) => formatPercent(v, 2), color: 'text-amber-400', bar: '#f59e0b',
    },
  ] : []

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Cockpit Executivo</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Olá, {session?.name.split(' ')[0]} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {primary.map(k => {
          const pct = k.meta && k.metaVal > 0 ? Math.min((k.metaVal / k.meta.valor) * 100, 100) : null
          return (
            <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-xs">{k.label}</span>
                <div className={`w-7 h-7 ${k.bg} rounded-lg`} />
              </div>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-700 mt-1">{k.sub}</p>
              {pct !== null && (
                <div className="mt-2.5">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700">Meta</span>
                    <span className="text-gray-500">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full">
                    <div className={`h-1 rounded-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {secondary.map(k => (
          <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1.5">{k.label}</p>
            <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Forecast da Carteira — mês atual */}
      {fg && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Forecast da Carteira — {formatMesRef(mesAtual)}</h3>
              <p className="text-xs text-gray-600 mt-0.5">Evolução do realizado vs previsto no mês atual</p>
            </div>
            <span className="text-xs text-gray-700 bg-gray-800 px-2 py-1 rounded-lg">Atualizado em tempo real</span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {fgCards.map(card => {
              const pct = card.realizado != null && card.previsto > 0
                ? Math.min((card.realizado / card.previsto) * 100, 150)
                : null
              const barPct = pct !== null ? Math.min(pct, 100) : 0
              const barColor = pct === null ? '#374151' : pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444'
              return (
                <div key={card.label}>
                  <p className="text-xs text-gray-600 mb-1">{card.label}</p>
                  <p className={`text-lg font-bold ${card.color}`}>{card.fmt(card.previsto)}</p>
                  {card.realizado != null ? (
                    <>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Realizado: <span className="text-gray-300">{card.fmt(card.realizado)}</span>
                      </p>
                      <div className="mt-2 h-1.5 bg-gray-800 rounded-full">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${barPct}%`, background: barColor }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: barColor }}>
                        {pct !== null ? `${pct.toFixed(0)}% do previsto` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-700 mt-0.5">Realizado não lançado</p>
                  )}
                </div>
              )
            })}
          </div>
          {fg.notas && (
            <p className="mt-4 text-xs text-gray-600 border-t border-gray-800 pt-3">{fg.notas}</p>
          )}
        </div>
      )}

      <DashboardCharts chartData={chartData} mrrEvolution={mrrEvolution} />
    </div>
  )
}
