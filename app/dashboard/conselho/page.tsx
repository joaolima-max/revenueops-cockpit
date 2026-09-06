export const dynamic = 'force-dynamic'

import { formatCurrency, formatTPV, formatPercent, formatMesRef } from '@/lib/utils'
import {
  kpisDoPeriodo, linhasReceita, contagensClientes,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'

function Ausente() {
  return <span className="text-gray-700 text-base font-normal">sem dados</span>
}

export default async function ConselhoPage() {
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(24)

  const [kpis, receita, clientes, serie] = await Promise.all([
    kpisDoPeriodo(periodo),
    linhasReceita(periodo),
    contagensClientes(),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  const comDados = serie.filter((k: KpisPeriodo) => k.temDados)
  const histTpv = comDados.reduce((a, k) => a + (k.tpv ?? 0), 0)
  const histTx = comDados.reduce((a, k) => a + (k.qtdTransacoes ?? 0), 0)
  const histFat = comDados.reduce((a, k) => a + (k.receitaTarifaria ?? 0) + (k.float ?? 0), 0)
  const temHistorico = comDados.length > 0

  const mensais = [
    { label: 'TPV', v: kpis.tpv, fmt: formatTPV },
    { label: 'Transações', v: kpis.qtdTransacoes, fmt: (n: number) => n.toLocaleString('pt-BR') },
    { label: 'Faturamento', v: receita ? receita.total : null, fmt: formatCurrency },
    { label: '% de MEDs', v: kpis.percentMed, fmt: (n: number) => formatPercent(n, 2) },
    { label: 'Take Rate', v: kpis.takeRate, fmt: (n: number) => formatPercent(n, 3) },
    { label: 'MRR', v: clientes.mrr, fmt: formatCurrency },
    { label: 'WL Ativos', v: clientes.wlAtivos, fmt: (n: number) => String(n) },
    { label: 'Contas Ativas', v: clientes.contasAtivas, fmt: (n: number) => String(n) },
    { label: 'BaaS Ativos', v: clientes.baasAtivos, fmt: (n: number) => String(n) },
  ]

  const linhas = receita ? ([
    ['Setup', receita.setup], ['Sustentação', receita.sustentacao],
    ['Tarifário', receita.tarifario], ['Float', receita.float], ['Serviços', receita.servicos],
  ] as const) : []

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Conselho Administrativo</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Indicadores consolidados · {formatMesRef(periodo)}
        </p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {mensais.map((m) => (
          <div key={m.label} className="bg-gray-900 border border-gray-800/60 rounded-xl p-4">
            <p className="text-xs text-gray-600 mb-1.5">{m.label}</p>
            <p className="text-2xl font-bold text-white leading-none tabular-nums">
              {m.v === null ? <Ausente /> : m.fmt(m.v)}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <p className="text-xs text-gray-600 mb-2 tracking-widest uppercase">TPV at History</p>
        <p className="text-5xl font-bold text-white leading-none tabular-nums">
          {temHistorico ? formatTPV(histTpv) : <Ausente />}
        </p>
        <p className="text-xs text-gray-700 mt-2">
          {temHistorico ? `Acumulado de ${comDados.length} ${comDados.length === 1 ? 'mês' : 'meses'} com lançamento` : 'Nenhum período lançado'}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {[
          { label: 'Faturamento at History', v: temHistorico ? histFat : null, fmt: formatCurrency },
          { label: 'Number of Transactions at History', v: temHistorico ? histTx : null, fmt: (n: number) => n.toLocaleString('pt-BR') },
        ].map((h) => (
          <div key={h.label} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-xs text-gray-600 mb-2 tracking-widest uppercase">{h.label}</p>
            <p className="text-4xl font-bold text-white leading-none tabular-nums">
              {h.v === null ? <Ausente /> : h.fmt(h.v)}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Linhas de Receita</h3>
        <p className="text-xs text-gray-600 mb-4">A soma corresponde ao faturamento do período.</p>
        {!receita ? (
          <p className="text-gray-700 text-sm py-6 text-center">Sem dados no período.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              {linhas.map(([label, valor]) => (
                <div key={label}>
                  <p className="text-xs text-gray-600 mb-1">{label}</p>
                  <p className="text-lg font-bold text-white tabular-nums">{formatCurrency(valor)}</p>
                  <p className="text-[10px] text-gray-700 mt-0.5 tabular-nums">
                    {receita.total > 0 ? `${((valor / receita.total) * 100).toFixed(1)}%` : '—'}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-800 flex justify-between items-baseline">
              <span className="text-xs text-gray-600">Faturamento total</span>
              <span className="text-xl font-bold text-white tabular-nums">{formatCurrency(receita.total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
