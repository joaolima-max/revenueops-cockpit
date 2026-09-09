'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from 'recharts'
import { formatMesRef, cn } from '@/lib/utils'
import {
  paleta, gridProps, axisProps, legendProps, cursorBarra, cursorLinha,
  BAR, LINE, hasSeries, isFlat,
} from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'
import { makeTooltip } from '@/components/ui/ChartTooltip'
import { moedaCompacta, moedaCheia, quantidadeCompacta, percentual, variacao } from '@/lib/format-financeiro'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Delta } from '@/components/ui/Figure'

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
  { id: 'receita', title: 'Receita Mensal', sub: 'Tarifária + Float' },
  { id: 'mrr', title: 'Evolução do MRR', sub: 'Receita recorrente mensal' },
  { id: 'fat_forecast', title: 'Faturamento', sub: 'Previsto vs. realizado' },
  { id: 'tpv_forecast', title: 'TPV', sub: 'Previsto vs. liquidado' },
  { id: 'tpv', title: 'TPV Mensal', sub: 'Volume total de pagamentos' },
  { id: 'takerate', title: 'Take Rate', sub: 'Receita tarifária ÷ TPV' },
  { id: 'margem', title: 'Margem Operacional', sub: 'Previsto vs. realizado' },
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

/**
 * Cabeçalho do gráfico: título, subtítulo e — quando a série permite — a
 * variação do último ponto contra o anterior. É a leitura imediata que
 * dispensa passar o mouse.
 */
function ChartCard({
  title, sub, delta, children, dragging, onDragStart, onDragOver, onDrop, reordering,
}: {
  title: string; sub: string; delta?: React.ReactNode; children: React.ReactNode
  dragging: boolean; reordering: boolean
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void
}) {
  return (
    <section
      draggable={reordering}
      onDragStart={reordering ? onDragStart : undefined}
      onDragOver={reordering ? e => { e.preventDefault(); onDragOver(e) } : undefined}
      onDrop={reordering ? onDrop : undefined}
      className={cn(
        'bg-surface border rounded-2xl p-5 sm:p-6 flex flex-col',
        'transition-[border-color,box-shadow,opacity] duration-[380ms] ease-bp',
        dragging ? 'border-accent opacity-50' : 'border-line hover:border-line-2',
        reordering && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h3 className="t-h2 text-fg">{title}</h3>
          <p className="t-sm text-subtle mt-1">{sub}</p>
        </div>
        <div className="flex items-center gap-3 flex-none">
          {delta}
          {reordering && <span className="text-subtle text-lg leading-none select-none" aria-hidden>⠿</span>}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function NoSeries({ what }: { what: string }) {
  return (
    <div className="h-[190px] flex items-center justify-center">
      <EmptyState compact title="Sem série para o período" description={what} />
    </div>
  )
}

export default function DashboardCharts({ chartData, mrrEvolution }: { chartData: ChartPoint[]; mrrEvolution: MRRPoint[] }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [reordering, setReordering] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOver = useRef<string | null>(null)

  useEffect(() => { setOrder(loadOrder()) }, [])

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    const next = [...order]
    next.splice(next.indexOf(targetId), 0, ...next.splice(next.indexOf(draggingId), 1))
    setOrder(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
    setDraggingId(null)
  }

  const data = useMemo(() => chartData.map(d => ({ ...d, mes: formatMesRef(d.mes) })), [chartData])
  const mrr = useMemo(() => mrrEvolution.map(d => ({ ...d, mes: formatMesRef(d.mes) })), [mrrEvolution])

  /** Variação do último ponto com dado contra o penúltimo — leitura imediata. */
  function deltaDe(key: keyof ChartPoint) {
    const vals = chartData.map(d => d[key]).filter((v): v is number => typeof v === 'number' && v !== 0)
    if (vals.length < 2) return null
    return <Delta v={variacao(vals[vals.length - 1], vals[vals.length - 2])} sufixo="no mês" />
  }

  const eixoMoeda = (v: number) => moedaCompacta(v)
  const eixoQtd = (v: number) => quantidadeCompacta(v)
  const eixoPct = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)}%`

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)

  const charts: Record<string, React.ReactNode> = {
    receita: hasSeries(data, 'receitaTarifaria', 'floating') ? (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={64} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes',
            [{ key: 'receitaTarifaria', nome: 'Tarifária', cor: p.s1 }, { key: 'floating', nome: 'Float', cor: p.s2 }],
            moedaCheia)} />
          <Legend {...leg} />
          <Bar dataKey="receitaTarifaria" name="Tarifária" fill={p.s1} {...BAR} />
          <Bar dataKey="floating" name="Float" fill={p.s2} {...BAR} />
        </BarChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum lançamento diário nos últimos 12 meses." />,

    mrr: !hasSeries(mrr, 'mrr')
      ? <NoSeries what="Nenhum cliente ativo com mensalidade contratada." />
      : isFlat(mrr, 'mrr')
        // Honestidade: um valor repetido 12× não é evolução. Mostramos o valor
        // corrente, não uma linha reta fingindo tendência.
        ? <div className="h-[200px] flex items-center justify-center">
            <EmptyState compact
              title="Sem série histórica de MRR"
              description={`O MRR é apurado sobre a carteira ativa de hoje (${moedaCheia(mrr[0]?.mrr ?? 0)}). Não há histórico mês a mês para desenhar evolução.`} />
          </div>
        : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={mrr} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
                  <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...grid} />
              <XAxis dataKey="mes" {...eixo} />
              <YAxis {...eixo} tickFormatter={eixoMoeda} width={64} />
              <Tooltip cursor={cursorLinha(p)} content={makeTooltip(mrr, 'mes',
                [{ key: 'mrr', nome: 'MRR', cor: p.s1 }], moedaCheia)} />
              <Area type="monotone" dataKey="mrr" stroke={p.s1} fill="url(#mrrG)" {...linha} />
            </AreaChart>
          </ResponsiveContainer>
        ),

    fat_forecast: hasSeries(data, 'faturamentoPrevisto', 'faturamentoRealizado') ? (
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={64} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes',
            [{ key: 'faturamentoPrevisto', nome: 'Previsto', cor: p.s3 },
             { key: 'faturamentoRealizado', nome: 'Realizado', cor: p.s1 }], moedaCheia)} />
          <Legend {...leg} />
          <Bar dataKey="faturamentoPrevisto" name="Previsto" fill={p.s3} {...BAR} />
          <Line type="monotone" dataKey="faturamentoRealizado" name="Realizado" stroke={p.s1} connectNulls={false} {...linha} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Não há faturamento previsto cadastrado para comparar." />,

    tpv_forecast: hasSeries(data, 'tpvPrevisto', 'tpvRealizado') ? (
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={64} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes',
            [{ key: 'tpvPrevisto', nome: 'Previsto', cor: p.s3 },
             { key: 'tpvRealizado', nome: 'Liquidado', cor: p.s1 }], moedaCheia)} />
          <Legend {...leg} />
          <Bar dataKey="tpvPrevisto" name="Previsto" fill={p.s3} {...BAR} />
          <Line type="monotone" dataKey="tpvRealizado" name="Liquidado" stroke={p.s1} connectNulls={false} {...linha} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Não há TPV previsto cadastrado para comparar." />,

    tpv: hasSeries(data, 'tpv') ? (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="tpvG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
              <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={64} />
          <Tooltip cursor={cursorLinha(p)} content={makeTooltip(data, 'mes',
            [{ key: 'tpv', nome: 'TPV', cor: p.s1 }], moedaCheia)} />
          <Area type="monotone" dataKey="tpv" stroke={p.s1} fill="url(#tpvG)" {...linha} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum TPV lançado no período." />,

    takerate: hasSeries(data, 'takeRate') ? (
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="trG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.s2} stopOpacity={0.18} />
              <stop offset="100%" stopColor={p.s2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoPct} width={56} />
          <Tooltip cursor={cursorLinha(p)} content={makeTooltip(data, 'mes',
            [{ key: 'takeRate', nome: 'Take Rate', cor: p.s2 }], (n) => percentual(n, 3))} />
          <Area type="monotone" dataKey="takeRate" stroke={p.s2} fill="url(#trG)" {...linha}
            activeDot={{ r: 4, strokeWidth: 3, stroke: p.tipBg, fill: p.s2 }} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Take rate depende de TPV e receita lançados." />,

    margem: hasSeries(data, 'margemPrevista', 'margemRealizada') ? (
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoPct} width={56} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes',
            [{ key: 'margemPrevista', nome: 'Prevista', cor: p.s3 },
             { key: 'margemRealizada', nome: 'Realizada', cor: p.s1 }], (n) => percentual(n, 2))} />
          <Legend {...leg} />
          <Bar dataKey="margemPrevista" name="Prevista" fill={p.s3} {...BAR} />
          <Line type="monotone" dataKey="margemRealizada" name="Realizada" stroke={p.s1} connectNulls={false} {...linha} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Margem não é apurada a partir do lançamento diário." />,
  }

  const deltas: Record<string, React.ReactNode> = {
    receita: deltaDe('receitaTarifaria'),
    tpv: deltaDe('tpv'),
    takerate: deltaDe('takeRate'),
  }

  const pares = order.reduce<string[][]>((rows, id, i) => {
    if (i % 2 === 0) rows.push([id]); else rows[rows.length - 1].push(id)
    return rows
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-h2 text-fg">Séries históricas</h2>
        <Button size="sm" variant={reordering ? 'primary' : 'subtle'} onClick={() => setReordering(r => !r)}>
          {reordering ? 'Concluir' : 'Reordenar'}
        </Button>
      </div>
      <div className="space-y-4">
        {pares.map((par, ri) => (
          <div key={ri} className={cn('grid gap-4', par.length === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
            {par.map(id => {
              const def = CHART_DEFS.find(c => c.id === id)!
              return (
                <ChartCard key={id} title={def.title} sub={def.sub} delta={deltas[id]}
                  dragging={draggingId === id} reordering={reordering}
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
