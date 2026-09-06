export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { formatCurrency, formatTPV, formatPercent } from '@/lib/utils'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, contagensClientes,
  volumetriaDoPeriodo, periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import DashboardCharts from '@/components/dashboard/DashboardCharts'

const ROTULO_META: Record<string, string> = {
  RECEITA_TARIFARIA: 'Receita Tarifária',
  TPV: 'TPV',
  SALDO_EM_CONTA: 'Saldo em Conta',
  TRANSACOES: 'Transações',
  MEDS: 'MEDs',
}

/** Valor ausente é mostrado como ausente. Nunca substituído por outra fonte. */
function Valor({ v, fmt, cor }: { v: number | null; fmt: (n: number) => string; cor?: string }) {
  if (v === null) return <span className="text-gray-700 text-sm font-normal">sem dados</span>
  return <span style={cor ? { color: cor } : undefined}>{fmt(v)}</span>
}

export default async function DashboardPage() {
  const session = await getSession()
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(12)

  const [kpis, receita, metas, clientes, volumetria, serie] = await Promise.all([
    kpisDoPeriodo(periodo),
    linhasReceita(periodo),
    metasDoPeriodo(periodo),
    contagensClientes(),
    volumetriaDoPeriodo(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  const cards = [
    { label: 'TPV', v: kpis.tpv, fmt: formatTPV, cor: '#2F6BFF',
      sub: kpis.qtdTransacoes !== null ? `${kpis.qtdTransacoes.toLocaleString('pt-BR')} transações` : '—' },
    { label: 'Receita Tarifária', v: kpis.receitaTarifaria, fmt: formatCurrency, cor: '#6B8CFF',
      sub: 'Lançamento diário' },
    { label: 'Float', v: kpis.float, fmt: formatCurrency, cor: '#1747C7',
      sub: 'Saldo que dorme × multiplicador' },
    { label: 'Take Rate', v: kpis.takeRate, fmt: (n: number) => formatPercent(n, 3), cor: '#E9ECF1',
      sub: 'Receita ÷ TPV' },
    { label: 'Saldo Médio', v: kpis.saldoMedio, fmt: formatCurrency, cor: '#A7ACB4',
      sub: 'Média do período' },
    { label: '% de MEDs', v: kpis.percentMed, fmt: (n: number) => formatPercent(n, 2), cor: '#A7ACB4',
      sub: kpis.qtdMed !== null ? `${kpis.qtdMed.toLocaleString('pt-BR')} MEDs` : '—' },
    { label: 'MRR', v: clientes.mrr, fmt: formatCurrency, cor: '#A7ACB4',
      sub: `${clientes.contasAtivas} contas ativas` },
    { label: 'Faturamento', v: receita ? receita.total : null, fmt: formatCurrency, cor: '#FFFFFF',
      sub: 'Soma das 5 linhas' },
  ]

  const chartData = periodos.map((p, i) => {
    const k: KpisPeriodo = serie[i]
    return {
      mes: p,
      receitaTarifaria: k.receitaTarifaria ?? 0,
      floating: k.float ?? 0,
      tpv: k.tpv ?? 0,
      faturamentoPrevisto: 0,
      faturamentoRealizado: k.temDados ? (k.receitaTarifaria ?? 0) + (k.float ?? 0) : null,
      tpvPrevisto: 0,
      tpvRealizado: k.tpv,
      takeRate: k.takeRate ?? 0,
      margemPrevista: null,
      margemRealizada: null,
    }
  })

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Cockpit Executivo</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Olá, {session?.name.split(' ')[0]} · {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </p>
      </div>

      {!kpis.temDados && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-white font-medium">Nenhum lançamento no mês corrente</p>
          <p className="text-gray-600 text-sm mt-1 mb-4">
            Os indicadores abaixo vêm do lançamento diário. Sem dados registrados, não há o que calcular.
          </p>
          <Link
            href="/dashboard/forecast"
            className="inline-block px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Ir para o Lançamento Diário
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-gray-900 border border-gray-800/60 rounded-xl p-4">
            <p className="text-xs text-gray-600 mb-1.5">{c.label}</p>
            <p className="text-xl font-bold leading-none mb-1.5 tabular-nums">
              <Valor v={c.v} fmt={c.fmt} cor={c.cor} />
            </p>
            <p className="text-[10px] text-gray-700">{c.sub}</p>
          </div>
        ))}
      </div>

      {receita && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Linhas de Receita</h3>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {([
              ['Tarifário', receita.tarifario], ['Float', receita.float],
              ['Sustentação', receita.sustentacao], ['Setup', receita.setup],
              ['Serviços', receita.servicos],
            ] as const).map(([label, valor]) => (
              <div key={label}>
                <p className="text-xs text-gray-600 mb-1">{label}</p>
                <p className="text-lg font-bold text-white tabular-nums">{formatCurrency(valor)}</p>
                <p className="text-[10px] text-gray-700 mt-0.5 tabular-nums">
                  {receita.total > 0 ? `${((valor / receita.total) * 100).toFixed(1)}% do faturamento` : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {metas.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Meta × Realizado</h3>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {metas.map((m) => {
              const pct = m.atingimento
              const cor = pct === null ? '#333942' : pct >= 100 ? '#07CF22' : pct >= 70 ? '#E0A62B' : '#FF7A80'
              return (
                <div key={m.tipo}>
                  <p className="text-xs text-gray-600 mb-1">{ROTULO_META[m.tipo] ?? m.tipo}</p>
                  <p className="text-base font-bold text-white tabular-nums">
                    {m.realizado === null ? <span className="text-gray-700 text-sm font-normal">sem dados</span>
                      : m.realizado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-[10px] text-gray-700 tabular-nums">
                    meta {m.meta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </p>
                  <div className="mt-1.5 h-1 bg-gray-800 rounded-full">
                    <div className="h-1 rounded-full transition-all"
                      style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: cor }} />
                  </div>
                  <p className="text-[10px] mt-1 tabular-nums" style={{ color: cor }}>
                    {pct === null ? '—' : `${pct.toFixed(0)}%`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {volumetria && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Volumetria Mínima Contratada</h3>
              <p className="text-xs text-gray-600 mt-0.5 tabular-nums">
                Mínimo {volumetria.qtdMinima.toLocaleString('pt-BR')} transações ·
                {' '}Realizado {volumetria.realizado?.toLocaleString('pt-BR') ?? '—'}
              </p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
              volumetria.status === 'ATINGIDO' ? 'bg-emerald-500/10 text-emerald-400'
                : volumetria.status === 'NAO_ATINGIDO' ? 'bg-red-500/10 text-red-400'
                : volumetria.status === 'EM_ACOMPANHAMENTO' ? 'bg-amber-400/10 text-amber-300'
                : 'bg-gray-800 text-gray-500'
            }`}>
              {volumetria.status === 'ATINGIDO' ? 'Atingido'
                : volumetria.status === 'NAO_ATINGIDO' ? 'Não atingido'
                : volumetria.status === 'EM_ACOMPANHAMENTO' ? 'Em acompanhamento' : 'Sem dados'}
            </span>
          </div>
        </div>
      )}

      <DashboardCharts chartData={chartData} mrrEvolution={periodos.map((p) => ({ mes: p, mrr: clientes.mrr }))} />
    </div>
  )
}
