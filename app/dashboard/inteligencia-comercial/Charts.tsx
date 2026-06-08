'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '8px',
    fontSize: 12,
  },
  labelStyle: { color: '#6b7280', marginBottom: 4 },
  itemStyle: { color: '#e5e7eb' },
}

const COLORS = ['#10b981', '#0ea5e9', '#7c3aed', '#f59e0b', '#6366f1']

export interface CanalData {
  canal: string
  clientes: number
  receita: number
}

export interface ConcentracaoData {
  nome: string
  receita: number
  percentual: number
}

export function CanaisChart({ data }: { data: CanalData[] }) {
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="canal"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          orientation="left"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
          width={56}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: number, name: string) =>
            name === 'Receita 12M' ? [formatCurrency(value), name] : [value, name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
        <Bar yAxisId="left" dataKey="clientes" name="Clientes" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={40} />
        <Bar yAxisId="right" dataKey="receita" name="Receita 12M" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ConcentracaoChart({ data }: { data: ConcentracaoData[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="receita"
          nameKey="nome"
          cx="50%"
          cy="50%"
          outerRadius={85}
          innerRadius={45}
          paddingAngle={2}
          label={({ percentual }: { percentual: number }) => `${percentual.toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: number) => [formatCurrency(value), 'Receita 12M']}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
          formatter={(value: string) => <span style={{ color: '#9ca3af' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
