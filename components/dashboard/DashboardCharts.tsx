'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from 'recharts'
import { formatCurrency, formatTPV, formatPercent, formatMesRef } from '@/lib/utils'

interface ChartPoint {
  mes: string
  receitaTarifaria: number
  floating: number
  tpv: number
  faturamentoPrevisto: number
  faturamentoRealizado: number
  tpvPrevisto: number
  tpvRealizado: number
  takeRate: number
}

interface MRRPoint { mes: string; mrr: number }

const tip = {
  contentStyle: { backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', fontSize: 12 },
  labelStyle: { color: '#6b7280', marginBottom: 4 },
  itemStyle: { color: '#e5e7eb' },
}

const CHART_DEFS = [
  { id: 'receita', title: 'Receita Mensal', sub: 'Tarifária + Floating (R$)' },
  { id: 'mrr', title: 'Evolução MRR', sub: 'Receita Recorrente Mensal (R$)' },
  { id: 'fat_forecast', title: 'Forecast — Faturamento Previsto vs Realizado', sub: 'Previsão geral da carteira vs realizado (R$)' },
  { id: 'tpv_forecast', title: 'Forecast — TPV Previsto vs Realizado', sub: 'TPV previsto vs TPV realizado (ForecastGeral) (R$)' },
  { id: 'tpv', title: 'TPV Mensal', sub: 'Volume Total de Pagamentos (R$)' },
  { id: 'takerate', title: 'Take Rate Mensal', sub: 'Receita Tarifária ÷ TPV (%)' },
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
    <div
      draggable={reordering}
      onDragStart={reordering ? onDragStart : undefined}
      onDragOver={reordering ? e => { e.preventDefault(); onDragOver(e) } : undefined}
      onDrop={reordering ? onDrop : undefined}
      className={`bg-gray-900 border rounded-xl p-5 transition-all ${dragging ? 'border-emerald-500/50 opacity-50' : 'border-gray-800'} ${reordering ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-gray-600 mb-4 mt-0.5">{sub}</p>
        </div>
        {reordering && <span className="text-gray-700 text-lg leading-none select-none mt-0.5">⠿</span>}
      </div>
      {children}
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

  const charts: Record<string, React.ReactNode> = {
    receita: (
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
          <Tooltip {...tip} formatter={(v) => [formatCurrency(Number(v))]} />
          <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="receitaTarifaria" name="Tarifária" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} />
          <Bar dataKey="floating" name="Floating" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    ),
    mrr: (
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={mrr} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}K`} />
          <Tooltip {...tip} formatter={(v) => [formatCurrency(Number(v)), 'MRR']} />
          <Area type="monotone" dataKey="mrr" stroke="#6366f1" fill="url(#mrrG)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    ),
    fat_forecast: (
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
          <Tooltip {...tip} formatter={(v) => [Number(v) ? formatCurrency(Number(v)) : '—']} />
          <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="faturamentoPrevisto" name="Fat. Previsto" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.7} />
          <Line type="monotone" dataKey="faturamentoRealizado" name="Fat. Realizado" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    ),
    tpv_forecast: (
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} />
          <Tooltip {...tip} formatter={(v) => [Number(v) ? formatTPV(Number(v)) : '—']} />
          <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="tpvPrevisto" name="TPV Previsto" fill="#0369a1" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.7} />
          <Line type="monotone" dataKey="tpvRealizado" name="TPV Realizado" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 3, strokeWidth: 0 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    ),
    tpv: (
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tpvG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} />
          <Tooltip {...tip} formatter={(v) => [formatTPV(Number(v)), 'TPV']} />
          <Area type="monotone" dataKey="tpv" stroke="#0ea5e9" fill="url(#tpvG)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    ),
    takerate: (
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(2)}%`} />
          <Tooltip {...tip} formatter={(v) => [`${Number(v).toFixed(3)}%`, 'Take Rate']} />
          <Area type="monotone" dataKey="takeRate" stroke="#f59e0b" fill="url(#trG)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    ),
  }

  const pairsOrder = order.reduce<string[][]>((rows, id, i) => {
    if (i % 2 === 0) rows.push([id])
    else rows[rows.length - 1].push(id)
    return rows
  }, [])

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setReordering(r => !r)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${reordering ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-gray-700 text-gray-600 hover:text-gray-400'}`}>
          {reordering ? '✓ Concluir' : '⠿ Reordenar gráficos'}
        </button>
      </div>
      <div className="space-y-5">
        {pairsOrder.map((pair, ri) => (
          <div key={ri} className={`grid gap-5 ${pair.length === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
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
