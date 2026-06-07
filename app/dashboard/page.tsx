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
    procMes, proc12M, rec12M, fc12M, mrrAgg,
    metaRec, metaTPV, metaMRR,
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
    prisma.forecast.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses } },
      _sum: { receitaPrevista: true, receitaRealizada: true, tpvPrevisto: true },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.cliente.aggregate({ where: { status: 'ATIVO' }, _sum: { mensalidadeApi: true, sustentacaoWhiteLabel: true } }),
    prisma.meta.findFirst({ where: { tipo: 'RECEITA', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'TPV', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'MRR', periodo: mesAtual } }),
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
  const fcComReal = fc12M.filter(f => f._sum.receitaRealizada && f._sum.receitaPrevista && f._sum.receitaPrevista > 0)
  const precisao = fcComReal.length > 0
    ? fcComReal.reduce((a, f) => a + (f._sum.receitaRealizada! / f._sum.receitaPrevista!) * 100, 0) / fcComReal.length
    : 0

  const procMap = new Map(proc12M.map(p => [p.mesRef, p._sum]))
  const recMap = new Map(rec12M.map(r => [r.mesRef, r]))
  const fcMap = new Map(fc12M.map(f => [f.mesRef, f._sum]))

  const chartData = meses.map(mes => {
    const p = procMap.get(mes), r = recMap.get(mes), f = fcMap.get(mes)
    const t = p?.tpv || 0, rv = r?.receitaTarifaria || 0
    return { mes, receitaTarifaria: rv, floating: r?.floatingRealizado || 0, tpv: t, receitaPrevista: f?.receitaPrevista || 0, receitaRealizada: f?.receitaRealizada || 0, takeRate: t > 0 ? (rv / t) * 100 : 0 }
  })

  return {
    kpis: { clientesAtivos, mrr, tpv, receita, floating, takeRate, med, churn: clientesEncerradosMes, receitaAno, precisao },
    metas: { receita: metaRec, tpv: metaTPV, mrr: metaMRR },
    chartData,
    mrrEvolution: meses.map(mes => ({ mes, mrr })),
    mesAtual,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  const { kpis, metas, chartData, mrrEvolution, mesAtual } = await getData()

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

      <DashboardCharts chartData={chartData} mrrEvolution={mrrEvolution} />
    </div>
  )
}
