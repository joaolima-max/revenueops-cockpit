'use client'

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from 'recharts'
import { formatCurrency, formatTPV, formatMesRef } from '@/lib/utils'

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

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-gray-600 mb-4 mt-0.5">{sub}</p>
      {children}
    </div>
  )
}

export default function DashboardCharts({ chartData, mrrEvolution }: { chartData: ChartPoint[]; mrrEvolution: MRRPoint[] }) {
  const data = chartData.map(d => ({ ...d, mes: formatMesRef(d.mes) }))
  const mrr = mrrEvolution.map(d => ({ ...d, mes: formatMesRef(d.mes) }))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card title="Receita Mensal" sub="Tarifária + Floating (R$)">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
            <Tooltip {...tip} formatter={(v) => [formatCurrency(Number(v))]} />
            <Bar dataKey="receitaTarifaria" name="Tarifária" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="floating" name="Floating" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Evolução MRR" sub="Receita Recorrente Mensal (R$)">
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
            <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `R$${(v / 1000).toFixed(0)}K`} />
            <Tooltip {...tip} formatter={(v) => [formatCurrency(Number(v)), 'MRR']} />
            <Area type="monotone" dataKey="mrr" stroke="#6366f1" fill="url(#mrrG)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Forecast — Faturamento Previsto vs Realizado" sub="Previsão geral da carteira vs realizado (R$)">
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
            <Tooltip {...tip} formatter={(v) => [Number(v) ? formatCurrency(Number(v)) : '—']} />
            <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="faturamentoPrevisto" name="Fat. Previsto" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.7} />
            <Line type="monotone" dataKey="faturamentoRealizado" name="Fat. Realizado" stroke="#10b981" strokeWidth={2}
              dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Forecast — TPV Previsto vs Processado" sub="TPV previsto no forecast vs TPV processado real (R$)">
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} />
            <Tooltip {...tip} formatter={(v) => [Number(v) ? formatTPV(Number(v)) : '—']} />
            <Legend wrapperStyle={{ color: '#6b7280', fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="tpvPrevisto" name="TPV Previsto" fill="#0369a1" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.7} />
            <Line type="monotone" dataKey="tpv" name="TPV Processado" stroke="#0ea5e9" strokeWidth={2}
              dot={{ fill: '#0ea5e9', r: 3, strokeWidth: 0 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="TPV Mensal" sub="Volume Total de Pagamentos (R$)">
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
            <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} />
            <Tooltip {...tip} formatter={(v) => [formatTPV(Number(v)), 'TPV']} />
            <Area type="monotone" dataKey="tpv" stroke="#0ea5e9" fill="url(#tpvG)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="xl:col-span-2">
        <Card title="Take Rate Mensal" sub="Receita Tarifária ÷ TPV (%)">
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
              <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v.toFixed(2)}%`} />
              <Tooltip {...tip} formatter={(v) => [`${Number(v).toFixed(3)}%`, 'Take Rate']} />
              <Area type="monotone" dataKey="takeRate" stroke="#f59e0b" fill="url(#trG)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}
