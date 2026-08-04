export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatCurrency, formatTPV, formatPercent, getLast12Months, getCurrentMonth, formatMesRef } from '@/lib/utils'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import KpiEvolved from '@/components/dashboard/KpiEvolved'
import InsightsPanel from '@/components/dashboard/InsightsPanel'
async function getData() {
  const meses = getLast12Months()
  const mesAtual = getCurrentMonth()
  const anoAtual = new Date().getFullYear().toString()
  const [mesAno, mesNum] = mesAtual.split('-').map(Number)
  const inicioMes = new Date(mesAno, mesNum - 1, 1)
  const fimMes = new Date(mesAno, mesNum, 1)

  const [
    clientesAtivos, clientesEncerradosMes,
    procMes, proc12M, rec12M, mrrApiAgg, mrrWlAgg,
    metaRec, metaTPV, metaMRR,
    fg12M, fgMesAtual,
    setupsMes, setups12M,
    clientesAll,
    contaReceberMes,
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
      where: { mesRef: mesAtual, status: 'PAGO' },
      _sum: { valor: true },
    }),
    prisma.pedidoCobravel.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses }, status: 'PAGO' },
      _sum: { valor: true },
    }),
    prisma.cliente.findMany({
      where: { status: { in: ['ATIVO', 'ENCERRADO'] } },
      select: { mensalidadeApi: true, sustentacaoWhiteLabel: true, dataFechamento: true, dataEncerramento: true },
    }),
    prisma.contaReceber.aggregate({
      where: {
        status: 'PAGO',
        dataVenc: { gte: inicioMes, lt: fimMes },
        tipo: { notIn: ['Mensalidade API', 'Sustentação White Label'] },
      },
      _sum: { valor: true },
    }),
  ])

  const recMesAtual = rec12M.find(r => r.mesRef === mesAtual)
  const procTpv = procMes._sum.tpv || 0
  const tpv = procTpv > 0 ? procTpv : (fgMesAtual?.tpvRealizado || 0)
  const procReceita = procMes._sum.receitaTarifaria || 0
  const receita = procReceita > 0 ? procReceita : (recMesAtual?.receitaTarifaria || 0)
  const receitaTarifariaWlMes = fgMesAtual?.receitaTarifariaWl || 0
  const receitaTarifTotal = receita + receitaTarifariaWlMes
  const procFloating = procMes._sum.floating || 0
  const floating = procFloating > 0 ? procFloating : (recMesAtual?.floatingRealizado || 0)
  const qtdMedProc = procMes._sum.qtdMed || 0
  const qtdMedTotal = qtdMedProc > 0 ? qtdMedProc : (fgMesAtual?.qtdMedRealizada || 0)
  const qtdMed = qtdMedTotal
  const procQtdTx = procMes._sum.qtdTransacoes || 0
  const qtdTx = procQtdTx > 0 ? procQtdTx : (fgMesAtual?.qtdTransacoesRealizadas || 0)
  const mrrApi = mrrApiAgg._sum.mensalidadeApi || 0
  const mrrWl = mrrWlAgg._sum.sustentacaoWhiteLabel || 0
  const mrr = mrrApi + mrrWl
  const takeRate = tpv > 0 ? (receitaTarifTotal / tpv) * 100 : 0
  const pmp = qtdTx > 0 ? receitaTarifTotal / qtdTx : 0
  const med = qtdTx > 0 ? (qtdMed / qtdTx) * 100 : 0
  const custoPorPix = 0.055
  const margemTransacional = pmp > 0 ? ((pmp - custoPorPix) / pmp) * 100 : null
  const setupsMap = new Map(setups12M.map((s: { mesRef: string; _sum: { valor: number | null } }) => [s.mesRef, s._sum.valor || 0]))
  const setupsMesVal = setupsMes._sum.valor || 0
  const contaReceberMesVal = contaReceberMes._sum.valor || 0
  const procMap = new Map(proc12M.map(p => [p.mesRef, p._sum]))
  const recMap = new Map(rec12M.map(r => [r.mesRef, r]))
  const fgMap = new Map(fg12M.map(f => [f.mesRef, f]))

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

  const margemOp = fgMesAtual?.margemRealizada ?? fgMesAtual?.margemPrevista ?? null

  const chartData = meses.map(mes => {
    const p = procMap.get(mes), r = recMap.get(mes), fg = fgMap.get(mes)
    const t = p?.tpv || 0
    const rv = (p?.receitaTarifaria || 0) > 0 ? (p?.receitaTarifaria || 0) : (r?.receitaTarifaria || 0)
    const fl = (p?.floating || 0) > 0 ? (p?.floating || 0) : (r?.floatingRealizado || 0)
    const receitaReal = rv + fl
    const fatRealizado = fg?.faturamentoRealizado ?? (receitaReal > 0 ? receitaReal : null)
    const tpvReal = t > 0 ? t : (fg?.tpvRealizado ?? null)
    const tpvCombinado = tpvReal ?? 0
    return {
      mes, receitaTarifaria: rv, floating: fl, tpv: tpvCombinado,
      faturamentoPrevisto: fg?.faturamentoPrevisto || 0,
      faturamentoRealizado: fatRealizado,
      tpvPrevisto: fg?.tpvPrevisto || 0,
      tpvRealizado: tpvReal,
      takeRate: tpvCombinado > 0 ? (rv / tpvCombinado) * 100 : 0,
      margemPrevista: fg?.margemPrevista ?? null,
      margemRealizada: fg?.margemRealizada ?? null,
    }
  })

  const mrrEvolution = meses.map(mes => {
    const [y, m] = mes.split('-').map(Number)
    const mesDate = new Date(y, m - 1, 1)
    const mrrMes = (clientesAll as Array<{
      mensalidadeApi: number | null; sustentacaoWhiteLabel: number | null
      dataFechamento: Date | null; dataEncerramento: Date | null
    }>).reduce((sum, c) => {
      const inicio = c.dataFechamento ? new Date(c.dataFechamento) : null
      const fim = c.dataEncerramento ? new Date(c.dataEncerramento) : null
      const ativo = (!inicio || inicio <= mesDate) && (!fim || fim > mesDate)
      return ativo ? sum + (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0) : sum
    }, 0)
    return { mes, mrr: mrrMes }
  })

  const n = meses.length
  const prevIdx = Math.max(0, n - 2)

  const trends: KpiTrends = {
    faturamento: meses.map((mes, i) => {
      const cd = chartData[i]
      const fg = fgMap.get(mes)
      const mrrVal = mrrEvolution[i]?.mrr || 0
      const setupVal = setupsMap.get(mes) || 0
      return (cd?.receitaTarifaria || 0) + (cd?.floating || 0) + (fg?.receitaTarifariaWl || 0) + mrrVal + setupVal
    }),
    tpv: chartData.map(d => d.tpv),
    mrr: mrrEvolution.map(m => m.mrr),
    takeRate: chartData.map(d => d.takeRate),
    receita: meses.map((mes, i) => {
      const cd = chartData[i]
      const fg = fgMap.get(mes)
      return (cd?.receitaTarifaria || 0) + (fg?.receitaTarifariaWl || 0)
    }),
    floating: chartData.map(d => d.floating),
    margem: chartData.map(d => d.margemRealizada ?? d.margemPrevista ?? 0),
  }

  const prevCd = chartData[prevIdx]
  const prevFgEntry = fgMap.get(meses[prevIdx])
  const prevMrrVal = mrrEvolution[prevIdx]?.mrr || 0
  const prevSetupsVal = setupsMap.get(meses[prevIdx]) || 0

  const prevMonth: KpiPrevMonth = {
    faturamento: (prevCd?.receitaTarifaria || 0) + (prevCd?.floating || 0) +
      (prevFgEntry?.receitaTarifariaWl || 0) + prevMrrVal + prevSetupsVal,
    tpv: prevCd?.tpv || 0,
    mrr: prevMrrVal,
    takeRate: prevCd?.takeRate || 0,
    receita: (prevCd?.receitaTarifaria || 0) + (prevFgEntry?.receitaTarifariaWl || 0),
    floating: prevCd?.floating || 0,
    margemOp: prevCd?.margemRealizada ?? prevCd?.margemPrevista ?? 0,
    mes: meses[prevIdx] || '',
  }

  return {
    kpis: { clientesAtivos, mrr, mrrApi, mrrWl, tpv, receita, floating, takeRate, pmp, med, churn: clientesEncerradosMes, precisao, qtdTx, margemOp, setups: setupsMesVal + contaReceberMesVal, margemTransacional, custoPorPix, receitaTarifariaWlMes },
    metas: { receita: metaRec, tpv: metaTPV, mrr: metaMRR },
    chartData,
    mrrEvolution,
    mesAtual, fgMesAtual, fg12M,
    trends,
    prevMonth,
  }
}

export default async function DashboardPage() {
  const session = await getSession()
  const { kpis, metas, chartData, mrrEvolution, mesAtual, fgMesAtual, fg12M, trends, prevMonth } = await getData()

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

      <KpiEvolved
        kpis={kpis}
        metas={metas}
        trends={trends}
        prevMonth={prevMonth}
        mesAtual={mesAtual}
      />

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Receita Mensal — {formatMesRef(mesAtual)}</h3>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-600 mb-1">Receita Tarifária</p>
            <p className="text-xl font-bold text-indigo-400">{formatCurrency(kpis.receita + kpis.receitaTarifariaWlMes)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Processamento + WL</p>
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
            <p className="text-xs text-gray-600 mb-1">Serviços / Setups</p>
            <p className={`text-xl font-bold ${kpis.setups > 0 ? 'text-amber-400' : 'text-gray-700'}`}>{kpis.setups > 0 ? formatCurrency(kpis.setups) : '—'}</p>
            <p className="text-xs text-gray-700 mt-0.5">Financeiro + Pedidos</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Mensal</p>
            <p className="text-xl font-bold text-white">{formatCurrency(kpis.receita + kpis.receitaTarifariaWlMes + kpis.floating + kpis.mrr + kpis.setups)}</p>
            <p className="text-xs text-gray-700 mt-0.5">Tarifária + Floating + MRR + Setups</p>
          </div>
        </div>
      </div>

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
