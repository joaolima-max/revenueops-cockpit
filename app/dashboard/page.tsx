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
    procMes, proc12M, rec12M, mrrApiAgg, mrrWlAgg,
    metaRec, metaTPV, metaMRR,
    fg12M, fgMesAtual,
    setupsMes, setups12M,
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
    prisma.cliente.aggregate({ where: { status: 'ATIVO', modeloOperacional: 'API' }, _sum: { mensalidadeApi: true } }),
    prisma.cliente.aggregate({ where: { status: 'ATIVO', modeloOperacional: 'WHITE_LABEL' }, _sum: { sustentacaoWhiteLabel: true } }),
    prisma.meta.findFirst({ where: { tipo: 'RECEITA', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'TPV', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'MRR', periodo: mesAtual } }),
    prisma.forecastGeral.findMany({ where: { mesRef: { in: meses } }, orderBy: { mesRef: 'desc' } }),
    prisma.forecastGeral.findFirst({ where: { mesRef: mesAtual } }),
    prisma.pedidoCobravel.aggregate({
      where: { mesRef: mesAtual, status: { in: ['FATURADO', 'PAGO'] } },
      _sum: { valor: true },
    }),
    prisma.pedidoCobravel.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses }, status: { in: ['FATURADO', 'PAGO'] } },
      _sum: { valor: true },
    }),
  ])

  // TPV: processamento é primário; cai back em forecast realizado se vazio
  const procTpv = procMes._sum.tpv || 0
  const tpv = procTpv > 0 ? procTpv : (fgMesAtual?.tpvRealizado || 0)
  const receita = procMes._sum.receitaTarifaria || 0
  const floating = procMes._sum.floating || 0
  const qtdMed = procMes._sum.qtdMed || 0
  // Transações: processamento é primário; cai back em forecast
  const procQtdTx = procMes._sum.qtdTransacoes || 0
  const qtdTx = procQtdTx > 0 ? procQtdTx : (fgMesAtual?.qtdTransacoesRealizadas || 0)
  const mrrApi = mrrApiAgg._sum.mensalidadeApi || 0
  const mrrWl = mrrWlAgg._sum.sustentacaoWhiteLabel || 0
  const mrr = mrrApi + mrrWl
  const takeRate = tpv > 0 ? (receita / tpv) * 100 : 0
  const pmp = qtdTx > 0 ? receita / qtdTx : 0
  const med = qtdTx > 0 ? (qtdMed / qtdTx) * 100 : 0
  const setupsMap = new Map(setups12M.map((s: { mesRef: string; _sum: { valor: number | null } }) => [s.mesRef, s._sum.valor || 0]))
  const setupsMesVal = setupsMes._sum.valor || 0
  const receitaAno = rec12M
    .filter(r => r.mesRef.startsWith(anoAtual))
    .reduce((s, r) => s + r.receitaTarifaria + r.floatingRealizado, 0)
    + Array.from(setupsMap.entries())
      .filter(([mes]) => mes.startsWith(anoAtual))
      .reduce((s, [, v]) => s + v, 0)

  const procMap = new Map(proc12M.map(p => [p.mesRef, p._sum]))
  const recMap = new Map(rec12M.map(r => [r.mesRef, r]))
  const fgMap = new Map(fg12M.map(f => [f.mesRef, f]))

  // Precision: considera tanto faturamentoRealizado do forecast quanto receitaRealizada
  const fgComReal = fg12M.filter(f => {
    if (f.faturamentoPrevisto <= 0) return false
    const r = recMap.get(f.mesRef)
    const realizado = f.faturamentoRealizado ?? ((r?.receitaTarifaria || 0) + (r?.floatingRealizado || 0))
    return realizado > 0
  })
  const precisao = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => {
        const r = recMap.get(f.mesRef)
        const realizado = f.faturamentoRealizado ?? ((r?.receitaTarifaria || 0) + (r?.floatingRealizado || 0))
        return a + (realizado / f.faturamentoPrevisto) * 100
      }, 0) / fgComReal.length
    : 0

  // Margem operacional: do forecast geral do mês atual
  const margemOp = fgMesAtual?.margemRealizada ?? fgMesAtual?.margemPrevista ?? null

  const chartData = meses.map(mes => {
    const p = procMap.get(mes), r = recMap.get(mes), fg = fgMap.get(mes)
    const t = p?.tpv || 0, rv = r?.receitaTarifaria || 0
    // Faturamento realizado: forecast se disponível, senão receita lançada
    const receitaReal = (r?.receitaTarifaria || 0) + (r?.floatingRealizado || 0)
    const fatRealizado = fg?.faturamentoRealizado ?? (receitaReal > 0 ? receitaReal : null)
    // TPV realizado: processamento se disponível, senão forecast
    const tpvReal = t > 0 ? t : (fg?.tpvRealizado ?? null)
    return {
      mes, receitaTarifaria: rv, floating: r?.floatingRealizado || 0, tpv: t,
      faturamentoPrevisto: fg?.faturamentoPrevisto || 0,
      faturamentoRealizado: fatRealizado,
      tpvPrevisto: fg?.tpvPrevisto || 0,
      tpvRealizado: tpvReal,
      takeRate: t > 0 ? (rv / t) * 100 : 0,
      margemPrevista: fg?.margemPrevista ?? null,
      margemRealizada: fg?.margemRealizada ?? null,
    }
  })

  return {
    kpis: { clientesAtivos, mrr, mrrApi, mrrWl, tpv, receita, floating, takeRate, pmp, med, churn: clientesEncerradosMes, receitaAno, precisao, qtdTx, margemOp, setups: setupsMesVal },
    metas: { receita: metaRec, tpv: metaTPV, mrr: metaMRR },
    chartData,
    mrrEvolution: meses.map(mes => ({ mes, mrr })),
    mesAtual, fgMesAtual, fg12M,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  const { kpis, metas, chartData, mrrEvolution, mesAtual, fgMesAtual, fg12M } = await getData()

  const primary = [
    { label: 'Receita Total (Ano)', value: formatCompact(kpis.receitaAno), sub: 'Tarifária + Floating', color: 'text-indigo-400', bg: 'bg-indigo-500/10', meta: metas.receita, metaVal: kpis.receita },
    { label: 'MRR', value: formatCurrency(kpis.mrr), sub: 'Receita recorrente mensal', color: 'text-emerald-400', bg: 'bg-emerald-500/10', meta: metas.mrr, metaVal: kpis.mrr },
    { label: `TPV ${formatMesRef(mesAtual)}`, value: formatTPV(kpis.tpv), sub: 'Volume processado no mês', color: 'text-sky-400', bg: 'bg-sky-500/10', meta: metas.tpv, metaVal: kpis.tpv },
    { label: 'Clientes Ativos', value: String(kpis.clientesAtivos), sub: kpis.churn > 0 ? `-${kpis.churn} churn este mês` : 'sem churn este mês', color: 'text-violet-400', bg: 'bg-violet-500/10', meta: null, metaVal: 0 },
  ]

  const secondary = [
    { label: 'Receita Tarifária', value: formatCurrency(kpis.receita), color: 'text-indigo-400' },
    { label: 'Floating (Mês)', value: formatCurrency(kpis.floating), color: 'text-emerald-400' },
    { label: 'Take Rate', value: kpis.takeRate > 0 ? formatPercent(kpis.takeRate, 3) : '—', color: 'text-amber-400' },
    { label: 'Margem Operacional', value: kpis.margemOp !== null ? formatPercent(kpis.margemOp, 2) : '—', color: kpis.margemOp !== null && kpis.margemOp >= 30 ? 'text-emerald-400' : kpis.margemOp !== null ? 'text-amber-400' : 'text-gray-600' },
    { label: 'PMP (Preço Médio Pix)', value: kpis.pmp > 0 ? formatCurrency(kpis.pmp) : '—', color: 'text-violet-400' },
    { label: 'MED Médio', value: kpis.med > 0 ? formatPercent(kpis.med, 2) : '—', color: 'text-sky-400' },
    { label: 'Precisão Forecast', value: kpis.precisao > 0 ? formatPercent(kpis.precisao, 1) : '—', color: kpis.precisao >= 90 ? 'text-emerald-400' : kpis.precisao > 0 ? 'text-amber-400' : 'text-gray-600' },
  ]

  // Cards do forecast do mês atual
  const fg = fgMesAtual
  const fgCards = fg ? [
    { label: 'TPV Previsto', previsto: fg.tpvPrevisto, realizado: fg.tpvRealizado, fmt: formatTPV, color: 'text-sky-400' },
    { label: 'Faturamento Previsto', previsto: fg.faturamentoPrevisto, realizado: fg.faturamentoRealizado, fmt: formatCurrency, color: 'text-emerald-400' },
    { label: 'Qtd. Transações', previsto: fg.qtdTransacoesPrevista, realizado: fg.qtdTransacoesRealizadas, fmt: (v: number) => v.toLocaleString('pt-BR'), color: 'text-violet-400' },
    { label: 'Margem Operacional', previsto: fg.margemPrevista, realizado: fg.margemRealizada, fmt: (v: number) => formatPercent(v, 2), color: 'text-amber-400' },
  ] : []

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Cockpit Executivo</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Olá, {session?.name.split(' ')[0]} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPIs primários */}
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

      {/* KPIs secundários */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {secondary.map(k => (
          <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1.5">{k.label}</p>
            <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Receita Mensal — mês atual */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Receita Mensal — {formatMesRef(mesAtual)}</h3>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-600 mb-1">Receita Tarifária</p>
            <p className="text-xl font-bold text-indigo-400">{formatCurrency(kpis.receita)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Do processamento</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Floating</p>
            <p className="text-xl font-bold text-emerald-400">{formatCurrency(kpis.floating)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Rendimento em trânsito</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">MRR</p>
            <p className="text-xl font-bold text-violet-400">{formatCurrency(kpis.mrr)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Mensalidades recorrentes</p>
            <div className="mt-2 space-y-0.5">
              <p className="text-xs text-sky-400">API: {formatCurrency(kpis.mrrApi)}</p>
              <p className="text-xs text-violet-400">White Label: {formatCurrency(kpis.mrrWl)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Setups Faturados</p>
            <p className={`text-xl font-bold ${kpis.setups > 0 ? 'text-amber-400' : 'text-gray-700'}`}>{kpis.setups > 0 ? formatCurrency(kpis.setups) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Mensal</p>
            <p className="text-xl font-bold text-white">{formatCurrency(kpis.receita + kpis.floating + kpis.mrr + kpis.setups)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Tarifária + Floating + MRR + Setups</p>
          </div>
        </div>
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
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
            {fgCards.map(card => {
              const pct = card.realizado != null && card.previsto > 0 ? (card.realizado / card.previsto) * 100 : null
              const barPct = pct !== null ? Math.min(pct, 100) : 0
              const barColor = pct === null ? '#374151' : pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444'
              return (
                <div key={card.label}>
                  <p className="text-xs text-gray-600 mb-1">{card.label}</p>
                  <p className={`text-lg font-bold ${card.color}`}>{card.fmt(card.previsto)}</p>
                  {card.realizado != null ? (
                    <>
                      <p className="text-xs text-gray-500 mt-0.5">Real: <span className="text-gray-300">{card.fmt(card.realizado)}</span></p>
                      <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full">
                        <div className="h-1.5 rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: barColor }}>{pct !== null ? `${pct.toFixed(0)}%` : ''}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-700 mt-0.5">Não lançado</p>
                  )}
                </div>
              )
            })}
          </div>
          {fg.notas && <p className="mt-4 text-xs text-gray-600 border-t border-gray-800 pt-3">{fg.notas}</p>}
        </div>
      )}

      {/* Tabela de Forecast — todos os meses */}
      {fg12M.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Histórico de Forecast da Carteira</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Mês', 'TPV Prev.', 'TPV Real.', 'Qtd. Tx Prev.', 'Qtd. Tx Real.', 'Faturamento Prev.', 'Faturamento Real.', 'Margem Op. Prev.', 'Margem Op. Real.', 'Precisão'].map(h => (
                    <th key={h} className={`text-xs font-medium text-gray-600 pb-2 ${h === 'Mês' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fg12M.map(fc => {
                  const prec = fc.faturamentoRealizado != null && fc.faturamentoPrevisto > 0
                    ? (fc.faturamentoRealizado / fc.faturamentoPrevisto) * 100 : null
                  return (
                    <tr key={fc.id} className={`border-b border-gray-800/50 ${fc.mesRef === mesAtual ? 'bg-emerald-500/5' : ''}`}>
                      <td className="py-2.5 text-gray-300 font-medium">
                        {formatMesRef(fc.mesRef)}
                        {fc.mesRef === mesAtual && <span className="ml-1.5 text-xs text-emerald-500">●</span>}
                      </td>
                      <td className="py-2.5 text-right text-sky-400">{formatTPV(fc.tpvPrevisto)}</td>
                      <td className="py-2.5 text-right text-sky-300">{fc.tpvRealizado != null ? formatTPV(fc.tpvRealizado) : <span className="text-gray-700">—</span>}</td>
                      <td className="py-2.5 text-right text-violet-400">{fc.qtdTransacoesPrevista.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 text-right text-violet-300">{fc.qtdTransacoesRealizadas != null ? fc.qtdTransacoesRealizadas.toLocaleString('pt-BR') : <span className="text-gray-700">—</span>}</td>
                      <td className="py-2.5 text-right text-emerald-400">{formatCurrency(fc.faturamentoPrevisto)}</td>
                      <td className="py-2.5 text-right text-emerald-300">{fc.faturamentoRealizado != null ? formatCurrency(fc.faturamentoRealizado) : <span className="text-gray-700">—</span>}</td>
                      <td className="py-2.5 text-right text-amber-400">{formatPercent(fc.margemPrevista, 2)}</td>
                      <td className="py-2.5 text-right text-amber-300">{fc.margemRealizada != null ? formatPercent(fc.margemRealizada, 2) : <span className="text-gray-700">—</span>}</td>
                      <td className={`py-2.5 text-right font-medium ${prec === null ? 'text-gray-700' : prec >= 90 ? 'text-emerald-400' : prec >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                        {prec !== null ? formatPercent(prec, 1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DashboardCharts chartData={chartData} mrrEvolution={mrrEvolution} />
    </div>
  )
}
