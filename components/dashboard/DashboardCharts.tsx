'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from 'recharts'
import { formatCurrency, formatTPV, formatMesRef } from '@/lib/utils'
import {
  SERIES, axisProps, gridProps, tooltipProps, legendProps, BAR, LINE, hasSeries,
} from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'

interface ChartPoint {
  mes: string
  receitaTarifaria: number
  floating: number
  tpv: number
  faturamentoPrevisto: number
  faturamentoRealizado: number | null
  tpvPrevisto: number
  tpvRealizado: number | null
  takeRate: number
  margemPrevista: number | null
  margemRealizada: number | null
}

interface MRRPoint { mes: string; mrr: number }

const CHART_DEFS = [
  { id: 'receita', title: 'Receita Mensal', sub: 'Tarifária + Float (R$)' },
  { id: 'mrr', title: 'Evolução do MRR', sub: 'Receita recorrente mensal (R$)' },
  { id: 'fat_forecast', title: 'Faturamento — previsto vs realizado', sub: 'Previsão da carteira contra o realizado (R$)' },
  { id: 'tpv_forecast', title: 'TPV — previsto vs realizado', sub: 'Volume previsto contra o volume liquidado (R$)' },
  { id: 'tpv', title: 'TPV Mensal', sub: 'Volume total de pagamentos (R$)' },
  { id: 'takerate', title: 'Take Rate Mensal', sub: 'Receita tarifária ÷ TPV (%)' },
  { id: 'margem', title: 'Margem Operacional', sub: 'Previsto vs realizado (%)' },
]

const DEFAULT_ORDER = CHART_DEFS.map(c => c.id)
const LS_KEY = 'dashboard_chart_order'

function loadOrder(): string[] {
  if (typeof window === 'undefined') return DEFAULT_ORDER
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as string[]
      if (parsed.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every(id => parsed.includes(id))) return parsed
    }
  } catch {}
  return DEFAULT_ORDER
}

function ChartCard({ title, sub, children, dragging, onDragStart, onDragOver, onDrop, reordering }:
  { title: string; sub: string; children: React.ReactNode; dragging: boolean; reordering: boolean; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void }) {
  return (
    <section
      draggable={reordering}
      onDragStart={reordering ? onDragStart : undefined}
      onDragOver={reordering ? e => { e.preventDefault(); onDragOver(e) } : undefined}
      onDrop={reordering ? onDrop : undefined}
      className={cn(
        'bg-surface border rounded-2xl p-5 sm:p-6 transition-[border-color,box-shadow,opacity] duration-[380ms] ease-bp',
        dragging ? 'border-accent opacity-50' : 'border-line hover:border-line-2',
        reordering && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h3 className="t-h2 text-fg">{title}</h3>
          <p className="t-sm text-subtle mt-1">{sub}</p>
        </div>
        {reordering && (
          <span className="text-subtle text-lg leading-none select-none flex-none" aria-hidden>⠿</span>
        )}
      </div>
      {children}
    </section>
  )
}

/** Série sem nenhum dado não desenha eixos vazios — declara a ausência. */
function NoSeries({ what }: { what: string }) {
  return (
    <div className="h-[190px] flex items-center justify-center">
      <EmptyState compact title="Sem série para o período" description={what} />
    </div>
  )
}

export default function DashboardCharts({ chartData, mrrEvolution }: { chartData: ChartPoint[]; mrrEvolution: MRRPoint[] }) {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [reordering, setReordering] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOver = useRef<string | null>(null)

  useEffect(() => { setOrder(loadOrder()) }, [])

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    const next = [...order]
    const from = next.indexOf(draggingId)
    const to = next.indexOf(targetId)
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    setOrder(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
    setDraggingId(null)
  }

  const data = chartData.map(d => ({ ...d, mes: formatMesRef(d.mes) }))
  const mrr = mrrEvolution.map(d => ({ ...d, mes: formatMesRef(d.mes) }))

  const brl = (v: number) => `${(v / 1_000_000).toFixed(1)}M`
  const brlK = (v: number) => `R$${(v / 1000).toFixed(0)}K`

  const charts: Record<string, React.ReactNode> = {
    receita: hasSeries(data, 'receitaTarifaria', 'floating') ? (
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={brl} />
          <Tooltip {...tooltipProps} formatter={(v) => [formatCurrency(Number(v))]} />
          <Legend {...legendProps} />
          <Bar dataKey="receitaTarifaria" name="Tarifária" fill={SERIES.primary} {...BAR} />
          <Bar dataKey="floating" name="Float" fill={SERIES.secondary} {...BAR} />
        </BarChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum lançamento diário registrado nos últimos 12 meses." />,

    mrr: hasSeries(mrr, 'mrr') ? (
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={mrr} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={brlK} />
          <Tooltip {...tooltipProps} formatter={(v) => [formatCurrency(Number(v)), 'MRR']} />
          <Area type="monotone" dataKey="mrr" stroke={SERIES.primary} fill="url(#mrrG)" {...LINE} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum cliente ativo com mensalidade contratada." />,

    fat_forecast: hasSeries(data, 'faturamentoPrevisto', 'faturamentoRealizado') ? (
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={brl} />
          <Tooltip {...tooltipProps} formatter={(v) => [Number(v) ? formatCurrency(Number(v)) : 'sem dados']} />
          <Legend {...legendProps} />
          <Bar dataKey="faturamentoPrevisto" name="Previsto" fill={SERIES.support} {...BAR} />
          <Line type="monotone" dataKey="faturamentoRealizado" name="Realizado" stroke={SERIES.primary} connectNulls={false} {...LINE} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Não há faturamento previsto cadastrado para comparar." />,

    tpv_forecast: hasSeries(data, 'tpvPrevisto', 'tpvRealizado') ? (
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={brl} />
          <Tooltip {...tooltipProps} formatter={(v) => [Number(v) ? formatTPV(Number(v)) : 'sem dados']} />
          <Legend {...legendProps} />
          <Bar dataKey="tpvPrevisto" name="Previsto" fill={SERIES.support} {...BAR} />
          <Line type="monotone" dataKey="tpvRealizado" name="Realizado" stroke={SERIES.primary} connectNulls={false} {...LINE} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Não há TPV previsto cadastrado para comparar." />,

    tpv: hasSeries(data, 'tpv') ? (
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tpvG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
          <Tooltip {...tooltipProps} formatter={(v) => [formatTPV(Number(v)), 'TPV']} />
          <Area type="monotone" dataKey="tpv" stroke={SERIES.primary} fill="url(#tpvG)" {...LINE} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum TPV lançado no período." />,

    takerate: hasSeries(data, 'takeRate') ? (
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.secondary} stopOpacity={0.20} />
              <stop offset="100%" stopColor={SERIES.secondary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => `${v.toFixed(2)}%`} />
          <Tooltip {...tooltipProps} formatter={(v) => [`${Number(v).toFixed(3)}%`, 'Take Rate']} />
          <Area type="monotone" dataKey="takeRate" stroke={SERIES.secondary} fill="url(#trG)" {...LINE} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Take rate depende de TPV e receita lançados." />,

    margem: hasSeries(data, 'margemPrevista', 'margemRealizada') ? (
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mes" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => `${v.toFixed(1)}%`} />
          <Tooltip {...tooltipProps} formatter={(v) => [v != null ? `${Number(v).toFixed(2)}%` : 'sem dados']} />
          <Legend {...legendProps} />
          <Bar dataKey="margemPrevista" name="Prevista" fill={SERIES.support} {...BAR} />
          <Line type="monotone" dataKey="margemRealizada" name="Realizada" stroke={SERIES.primary} connectNulls={false} {...LINE} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Margem não é apurada a partir do lançamento diário." />,
  }

  const pairsOrder = order.reduce<string[][]>((rows, id, i) => {
    if (i % 2 === 0) rows.push([id])
    else rows[rows.length - 1].push(id)
    return rows
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant={reordering ? 'primary' : 'subtle'}
          onClick={() => setReordering(r => !r)}
        >
          {reordering ? 'Concluir' : 'Reordenar gráficos'}
        </Button>
      </div>
      <div className="space-y-4">
        {pairsOrder.map((pair, ri) => (
          <div key={ri} className={cn('grid gap-4', pair.length === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
            {pair.map(id => {
              const def = CHART_DEFS.find(c => c.id === id)!
              return (
                <ChartCard key={id} title={def.title} sub={def.sub} dragging={draggingId === id} reordering={reordering}
                  onDragStart={() => setDraggingId(id)}
                  onDragOver={() => { dragOver.current = id }}
                  onDrop={() => handleDrop(id)}
                >
                  {charts[id]}
                </ChartCard>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
