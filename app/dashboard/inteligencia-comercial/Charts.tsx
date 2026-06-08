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

const COLORS = ['#10b981', '#0ea5e9', '#7c3aed', '#f59e0b', '#6366f1', '#9ca3af']

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

function barFormatter(
  value: number | string | undefined,
  name: string | number | undefined
): [string, string] {
  const label = String(name ?? '')
  if (label === 'Receita 12M') return [formatCurrency(Number(value ?? 0)), label]
  return [String(value ?? ''), label]
}

function pieFormatter(value: number | string | undefined): [string, string] {
  return [formatCurrency(Number(value ?? 0)), 'Receita 12M']
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
          tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
          width={56}
        />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip {...TOOLTIP_STYLE} formatter={barFormatter as any} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
        <Bar
          yAxisId="left"
          dataKey="clientes"
          name="Clientes"
          fill="#0ea5e9"
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        />
        <Bar
          yAxisId="right"
          dataKey="receita"
          name="Receita 12M"
          fill="#10b981"
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Use `any` to satisfy recharts' PieLabelRenderProps which has all optional fields
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props as {
    cx: number; cy: number; midAngle: number
    innerRadius: number; outerRadius: number; percent: number
  }
  if (!percent || percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = (innerRadius ?? 0) + ((outerRadius ?? 0) - (innerRadius ?? 0)) * 0.5
  const x = (cx ?? 0) + radius * Math.cos(-midAngle * RADIAN)
  const y = (cy ?? 0) + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x} y={y} fill="#fff"
      textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
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
          labelLine={false}
          label={PieLabel}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip {...TOOLTIP_STYLE} formatter={pieFormatter as any} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
          formatter={(value: string) => <span style={{ color: '#9ca3af' }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
