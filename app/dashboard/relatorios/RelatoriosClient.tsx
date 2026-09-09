'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, AreaChart, Area, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  formatCurrency, formatTPV, formatPercent, formatMesRef,
  SEGMENTO_LABELS, CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS,
  MODELO_OPERACIONAL_LABELS, SEGMENTO_COLORS, SCORE_RISCO_COLORS,
} from '@/lib/utils'
import {
  paleta, gridProps, axisProps, legendProps, cursorBarra, cursorLinha, BAR, LINE,
} from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'
import { moedaCompacta, percentual } from '@/lib/format-financeiro'

const SEGMENTOS = ['', 'IGAMING', 'ECOMMERCE', 'SAAS', 'ERP', 'TELECOM', 'CRIPTOMOEDAS', 'VAREJO', 'OUTROS']
const MODELOS = ['', 'API', 'WHITE_LABEL']
const STATUSES = ['', 'ATIVO', 'INATIVO', 'PROSPECCAO', 'ENCERRADO']

interface RelData {
  periodo: { inicio: string; fim: string; meses: string[] }
  summary: {
    receitaTotal: number; tpvTotal: number; receitaTarifaria: number
    floating: number; takeRateMedio: number; precisaoForecast: number; margemOpMedia: number | null
    qtdTransacoesTotal: number
  }
  proc12M: { mes: string; tpv: number; receitaTarifaria: number; floating: number; total: number; qtdTransacoes: number; qtdMed: number; takeRate: number }[]
  clientesByStatus: { status: string; _count: number }[]
  clientesByModelo: { modeloOperacional: string; _count: number }[]
  clientesBySegmento: { segmento: string | null; _count: number }[]
  topClientes: { clienteId: string; nome?: string; modeloOperacional?: string; segmento?: string | null; receita: number; _sum: { tpv: number | null } }[]
  fg12M: { mesRef: string; tpvPrevisto: number; faturamentoPrevisto: number; faturamentoRealizado: number | null; margemPrevista: number; margemRealizada: number | null }[]
}

function downloadCSV(data: RelData) {
  const rows = [
    ['Mês', 'TPV', 'Rec. Tarifária', 'Floating', 'Total', 'Qtd. Transações', 'Qtd. MED', 'Take Rate'],
    ...data.proc12M.map(r => [
      formatMesRef(r.mes), r.tpv, r.receitaTarifaria, r.floating, r.total, r.qtdTransacoes, r.qtdMed, `${r.takeRate.toFixed(3)}%`,
    ]),
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `relatorio-${data.periodo.inicio}-${data.periodo.fim}.csv`
  a.click(); URL.revokeObjectURL(url)
}

export default function RelatoriosClient() {
  const { theme } = useTheme()
  const p = paleta(theme)
  /* Mesma casca visual do tooltip dos demais gráficos, resolvida por tema. */
  const tip = {
    contentStyle: {
      backgroundColor: p.tipBg, border: `1px solid ${p.tipBorder}`,
      borderRadius: '0.75rem', fontSize: 12,
    },
    labelStyle: { color: p.muted, marginBottom: 4 },
    itemStyle: { color: p.fg },
  }

  const [data, setData] = useState<RelData | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const now = new Date()
  const defaultFim = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const d11 = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const defaultInicio = `${d11.getFullYear()}-${String(d11.getMonth() + 1).padStart(2, '0')}`

  const [inicio, setInicio] = useState(defaultInicio)
  const [fim, setFim] = useState(defaultFim)
  const [segmento, setSegmento] = useState('')
  const [modelo, setModelo] = useState('')
  const [status, setStatus] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ inicio, fim })
    if (segmento) p.set('segmento', segmento)
    if (modelo) p.set('modelo', modelo)
    if (status) p.set('status', status)
    const res = await fetch(`/api/relatorios?${p}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [inicio, fim, segmento, modelo, status])

  useEffect(() => { fetchData() }, [fetchData])

  const fmtMes = (mes: string) => {
    const [y, m] = mes.split('-')
    return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]}/${y.slice(2)}`
  }

  if (loading && !data) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-subtle">Carregando relatório...</p>
    </div>
  )

  const s = data?.summary
  const totalClientes = data ? data.clientesByStatus.reduce((sum, g) => sum + g._count, 0) : 0
  const chartData = data?.proc12M.map(r => ({ ...r, mes: fmtMes(r.mes) })) || []
  const fgChart = data?.fg12M.map(f => ({ ...f, mes: fmtMes(f.mesRef) })) || []

  return (
    <div className="space-y-8 print:bg-white print:text-black">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="t-h1 text-fg print:text-black">Relatórios Executivos</h1>
          <p className="text-subtle text-sm mt-0.5">Visão consolidada para conselho de administração</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => data && downloadCSV(data)}
            className="px-3 py-2 bg-surface-2 hover:bg-surface-2 text-muted text-sm rounded-lg border border-line-2 flex items-center gap-1.5">
            ↓ CSV
          </button>
          <button onClick={() => window.print()}
            className="px-3 py-2 bg-surface-2 hover:bg-surface-2 text-muted text-sm rounded-lg border border-line-2 flex items-center gap-1.5">
            🖨 Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-surface border border-line rounded-xl p-4 print:hidden">
        <p className="text-xs text-subtle font-semibold tracking-wider mb-3">FILTROS</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="bp-field-label">De</label>
            <input type="month" value={inicio} onChange={e => setInicio(e.target.value)}
              className="bp-field text-sm" />
          </div>
          <div>
            <label className="bp-field-label">Até</label>
            <input type="month" value={fim} onChange={e => setFim(e.target.value)}
              className="bp-field text-sm" />
          </div>
          <div>
            <label className="bp-field-label">Segmento</label>
            <select value={segmento} onChange={e => setSegmento(e.target.value)}
              className="bp-field text-sm">
              {SEGMENTOS.map(s => <option key={s} value={s}>{s ? SEGMENTO_LABELS[s] : 'Todos os segmentos'}</option>)}
            </select>
          </div>
          <div>
            <label className="bp-field-label">Modelo</label>
            <select value={modelo} onChange={e => setModelo(e.target.value)}
              className="bp-field text-sm">
              {MODELOS.map(m => <option key={m} value={m}>{m ? MODELO_OPERACIONAL_LABELS[m] : 'Todos os modelos'}</option>)}
            </select>
          </div>
          <div>
            <label className="bp-field-label">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="bp-field text-sm">
              {STATUSES.map(s => <option key={s} value={s}>{s ? CLIENTE_STATUS_LABELS[s] : 'Todos os status'}</option>)}
            </select>
          </div>
          {(segmento || modelo || status) && (
            <button onClick={() => { setSegmento(''); setModelo(''); setStatus('') }}
              className="px-3 py-2 text-subtle hover:text-muted text-sm border border-line-2 rounded-lg">
              Limpar
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-subtle text-sm">Atualizando...</p>}

      {s && (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { l: 'Receita Total', v: formatCurrency(s.receitaTotal), c: 'text-fg', sub: 'Tarifária + Floating' },
              { l: 'TPV Total', v: formatTPV(s.tpvTotal), c: 'text-accent-soft', sub: 'Volume processado' },
              { l: 'Receita Tarifária', v: formatCurrency(s.receitaTarifaria), c: 'text-accent-soft', sub: 'Tarifas de transação' },
              { l: 'Floating', v: formatCurrency(s.floating), c: 'text-pos', sub: 'Rendimento em trânsito' },
            ].map(k => (
              <div key={k.l} className="bg-surface border border-line rounded-xl p-5">
                <p className="text-subtle text-xs mb-1.5">{k.l}</p>
                <p className={`text-xl font-bold tnum ${k.c}`}>{k.v}</p>
                <p className="text-xs text-subtle mt-1">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* KPIs secundários */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { l: 'Take Rate Médio', v: formatPercent(s.takeRateMedio, 3), c: s.takeRateMedio > 0 ? 'text-warn' : 'text-subtle' },
              { l: 'Margem Operacional', v: s.margemOpMedia != null ? formatPercent(s.margemOpMedia, 2) : '—', c: s.margemOpMedia != null && s.margemOpMedia >= 30 ? 'text-pos' : 'text-warn' },
              { l: 'Precisão Forecast', v: s.precisaoForecast > 0 ? formatPercent(s.precisaoForecast, 1) : '—', c: s.precisaoForecast >= 90 ? 'text-pos' : s.precisaoForecast > 0 ? 'text-warn' : 'text-subtle' },
              { l: 'Clientes na Base', v: String(totalClientes), c: 'text-accent-soft' },
            ].map(k => (
              <div key={k.l} className="bg-surface border border-line rounded-xl p-5">
                <p className="text-subtle text-xs mb-1.5">{k.l}</p>
                <p className={`text-xl font-bold tnum ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>

          {/* TPV Total + Qtd. Transações — linha de destaque */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 divide-y xl:divide-y-0 xl:divide-x divide-line">
              <div className="text-center pb-6 xl:pb-0 xl:pr-8">
                <p className="text-subtle text-xs font-semibold tracking-wider mb-3">TPV TOTAL DO PERÍODO</p>
                <p className="t-hero text-fg">{formatTPV(s.tpvTotal)}</p>
                <p className="text-xs text-subtle mt-2">Volume Total de Pagamentos · {data.periodo.inicio} → {data.periodo.fim}</p>
              </div>
              <div className="text-center pt-6 xl:pt-0 xl:pl-8">
                <p className="text-subtle text-xs font-semibold tracking-wider mb-3">QUANTIDADE DE TRANSAÇÕES TOTAL</p>
                <p className="t-hero text-accent-soft">{s.qtdTransacoesTotal.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-subtle mt-2">Total de transações processadas · {data.periodo.inicio} → {data.periodo.fim}</p>
              </div>
            </div>
          </div>

          {/* Gráficos — linha 1 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-1">Receita Mensal</p>
              <p className="text-xs text-subtle mb-4">Tarifária + Floating (R$)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps(p)} />
                  <XAxis dataKey="mes" {...axisProps(p)} />
                  <YAxis {...axisProps(p)} tickFormatter={moedaCompacta} width={68} />
                  <Tooltip {...tip} cursor={cursorBarra(p)} formatter={(v) => [formatCurrency(Number(v))]} />
                  <Legend {...legendProps(p)} />
                  <Bar dataKey="receitaTarifaria" name="Tarifária" fill={p.s1} {...BAR} />
                  <Bar dataKey="floating" name="Floating" fill={p.s2} {...BAR} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-1">TPV Mensal</p>
              <p className="text-xs text-subtle mb-4">Volume Total de Pagamentos (R$)</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="tpvRG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={p.s1} stopOpacity={0.25} /><stop offset="95%" stopColor={p.s1} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps(p)} />
                  <XAxis dataKey="mes" {...axisProps(p)} />
                  <YAxis {...axisProps(p)} tickFormatter={moedaCompacta} width={68} />
                  <Tooltip {...tip} cursor={cursorLinha(p)} formatter={(v) => [formatTPV(Number(v)), 'TPV']} />
                  <Area type="monotone" dataKey="tpv" stroke={p.s1} fill="url(#tpvRG)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráficos — linha 2 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-1">Forecast — Faturamento Previsto vs Realizado</p>
              <p className="text-xs text-subtle mb-4">Previsão da carteira vs realizado (R$)</p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={fgChart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps(p)} />
                  <XAxis dataKey="mes" {...axisProps(p)} />
                  <YAxis {...axisProps(p)} tickFormatter={moedaCompacta} width={68} />
                  <Tooltip {...tip} cursor={cursorBarra(p)} formatter={(v) => [Number(v) ? formatCurrency(Number(v)) : '—']} />
                  <Legend {...legendProps(p)} />
                  <Bar dataKey="faturamentoPrevisto" name="Previsto" fill={p.s3} {...BAR} />
                  <Line type="monotone" dataKey="faturamentoRealizado" name="Realizado" stroke={p.s1} {...LINE(p)} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-1">Margem Operacional</p>
              <p className="text-xs text-subtle mb-4">Prevista vs Realizada (%)</p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={fgChart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps(p)} />
                  <XAxis dataKey="mes" {...axisProps(p)} />
                  <YAxis {...axisProps(p)} tickFormatter={(v: number) => percentual(v, 0)} width={52} />
                  <Tooltip {...tip} cursor={cursorBarra(p)} formatter={(v) => [Number(v) ? formatPercent(Number(v), 2) : '—']} />
                  <Legend {...legendProps(p)} />
                  <Bar dataKey="margemPrevista" name="Prevista" fill={p.s3} {...BAR} />
                  <Line type="monotone" dataKey="margemRealizada" name="Realizada" stroke={p.s1} {...LINE(p)} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Carteira por distribuição */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-4">Carteira por Status</p>
              <div className="space-y-3">
                {data.clientesByStatus.map(g => {
                  const pct = totalClientes > 0 ? (g._count / totalClientes) * 100 : 0
                  return (
                    <div key={g.status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLIENTE_STATUS_COLORS[g.status]}`}>{CLIENTE_STATUS_LABELS[g.status]}</span>
                        <span className="text-sm font-semibold text-fg">{g._count} <span className="text-subtle text-xs">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-surface-2 rounded-full"><div className="h-1.5 bg-accent rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-4">Carteira por Modelo</p>
              <div className="space-y-3">
                {data.clientesByModelo.map(g => {
                  const pct = totalClientes > 0 ? (g._count / totalClientes) * 100 : 0
                  return (
                    <div key={g.modeloOperacional}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted">{MODELO_OPERACIONAL_LABELS[g.modeloOperacional]}</span>
                        <span className="text-sm font-semibold text-fg">{g._count} <span className="text-subtle text-xs">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-surface-2 rounded-full"><div className="h-1.5 bg-accent rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-4">Carteira por Segmento</p>
              <div className="space-y-2.5">
                {data.clientesBySegmento.filter(g => g.segmento).map(g => {
                  const pct = totalClientes > 0 ? (g._count / totalClientes) * 100 : 0
                  return (
                    <div key={g.segmento}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.segmento ? SEGMENTO_COLORS[g.segmento] : ''}`}>{g.segmento ? SEGMENTO_LABELS[g.segmento] : 'Outros'}</span>
                        <span className="text-xs font-semibold text-fg">{g._count} <span className="text-subtle">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1 bg-surface-2 rounded-full"><div className="h-1 bg-accent rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tabela de receita mensal */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-fg">Receita por Mês — Detalhado</p>
              <span className="text-xs text-subtle">{data.periodo.inicio} → {data.periodo.fim}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    {['Mês', 'TPV', 'Rec. Tarifária', 'Floating', 'Total Receita', 'Qtd. Tx', 'Qtd. MED', 'Take Rate'].map(h => (
                      <th key={h} className={`t-label text-subtle pb-2 ${h === 'Mês' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.proc12M.map(r => (
                    <tr key={r.mes} className="border-b border-line">
                      <td className="py-2.5 text-muted font-medium">{fmtMes(r.mes)}</td>
                      <td className="py-2.5 text-right text-accent-soft">{r.tpv > 0 ? formatTPV(r.tpv) : <span className="text-subtle">—</span>}</td>
                      <td className="py-2.5 text-right text-accent-soft">{r.receitaTarifaria > 0 ? formatCurrency(r.receitaTarifaria) : <span className="text-subtle">—</span>}</td>
                      <td className="py-2.5 text-right text-pos">{r.floating > 0 ? formatCurrency(r.floating) : <span className="text-subtle">—</span>}</td>
                      <td className="py-2.5 text-right text-fg font-medium">{r.total > 0 ? formatCurrency(r.total) : <span className="text-subtle">—</span>}</td>
                      <td className="py-2.5 text-right text-muted">{r.qtdTransacoes > 0 ? r.qtdTransacoes.toLocaleString('pt-BR') : <span className="text-subtle">—</span>}</td>
                      <td className="py-2.5 text-right text-muted">{r.qtdMed > 0 ? r.qtdMed.toLocaleString('pt-BR') : <span className="text-subtle">—</span>}</td>
                      <td className="py-2.5 text-right text-warn">{r.takeRate > 0 ? formatPercent(r.takeRate, 3) : <span className="text-subtle">—</span>}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line-2 bg-[var(--bp-hover)]">
                    <td className="py-2.5 text-subtle font-semibold text-xs">TOTAL</td>
                    <td className="py-2.5 text-right text-accent-soft font-semibold">{formatTPV(s.tpvTotal)}</td>
                    <td className="py-2.5 text-right text-accent-soft font-semibold">{formatCurrency(s.receitaTarifaria)}</td>
                    <td className="py-2.5 text-right text-pos font-semibold">{formatCurrency(s.floating)}</td>
                    <td className="py-2.5 text-right text-fg font-semibold">{formatCurrency(s.receitaTotal)}</td>
                    <td className="py-2.5 text-right text-muted font-semibold">{data.proc12M.reduce((a, r) => a + r.qtdTransacoes, 0).toLocaleString('pt-BR')}</td>
                    <td className="py-2.5 text-right text-muted font-semibold">{data.proc12M.reduce((a, r) => a + r.qtdMed, 0).toLocaleString('pt-BR')}</td>
                    <td className="py-2.5 text-right text-warn font-semibold">{formatPercent(s.takeRateMedio, 3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Clientes */}
          {data.topClientes.length > 0 && (
            <div className="bg-surface border border-line rounded-xl p-5">
              <p className="text-sm font-semibold text-fg mb-4">Top Clientes por Receita</p>
              <div className="space-y-3">
                {data.topClientes.map((t, i) => {
                  const pct = s.receitaTotal > 0 ? (t.receita / s.receitaTotal) * 100 : 0
                  return (
                    <div key={t.clienteId} className="flex items-center gap-4">
                      <span className="text-subtle text-xs w-5 text-right">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-fg font-medium">{t.nome || '—'}</span>
                            {t.segmento && <span className={`text-xs px-1.5 py-0.5 rounded-full ${SEGMENTO_COLORS[t.segmento]}`}>{SEGMENTO_LABELS[t.segmento]}</span>}
                            {t.modeloOperacional && <span className="text-xs text-subtle">{MODELO_OPERACIONAL_LABELS[t.modeloOperacional]}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-subtle">{formatTPV(t._sum.tpv || 0)} TPV</span>
                            <span className="text-sm font-semibold text-accent-soft">{formatCurrency(t.receita)}</span>
                            <span className="text-xs text-subtle">{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-surface-2 rounded-full">
                          <div className="h-1.5 bg-accent rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
