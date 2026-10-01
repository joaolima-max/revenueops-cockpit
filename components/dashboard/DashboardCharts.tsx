'use client'

import { useState, useRef, useMemo, useSyncExternalStore } from 'react'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatMesRef, cn } from '@/lib/utils'
import {
  paleta, gridProps, axisProps, legendProps, cursorBarra, cursorLinha,
  BAR, LINE, hasSeries, isFlat,
} from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'
import { makeTooltip } from '@/components/ui/ChartTooltip'
import {
  eixoMoeda as fmtEixoMoeda, moedaCheia, quantidadeCompacta, percentual, variacao,
} from '@/lib/format-financeiro'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Delta } from '@/components/ui/Figure'

interface ChartPoint {
  mes: string
  receitaTarifaria: number
  tpv: number
  takeRate: number
  qtdTransacoes: number
  saldoMedio: number
  qtdMed: number
  percentMed: number
  clientesAtivos: number
}

interface MRRPoint { mes: string; mrr: number }

/** Contagens de parceiros. Não há histórico: são o estado de hoje. */
interface Parceiros { baasAtivos: number; whiteLabelsAtivos: number }

/**
 * Cada gráfico daqui tem FONTE REAL. Saíram nesta rodada:
 *
 *   * Margem Operacional — não é apurada a partir de nenhuma fonte do sistema;
 *   * Faturamento previsto × realizado e TPV previsto × liquidado — o
 *     "previsto" não existe em lugar nenhum do produto, então o gráfico era um
 *     par de barras zeradas ao lado da série real.
 *
 * O Float também saiu: continua sendo calculado e aparece como linha de
 * receita no Conselho, mas não é mais exibido no Cockpit.
 */
const CHART_DEFS = [
  { id: 'tpv', title: 'Evolução do TPV', sub: 'Volume total de pagamentos, por mês' },
  { id: 'receita', title: 'Evolução da Receita', sub: 'Receita tarifária do lançamento diário' },
  { id: 'transacoes', title: 'Evolução das Transações', sub: 'Quantidade de transações por mês' },
  { id: 'saldo', title: 'Evolução do Saldo', sub: 'Saldo médio em conta no período' },
  { id: 'med', title: 'Evolução dos MEDs', sub: 'Quantidade e proporção sobre as transações' },
  { id: 'clientes', title: 'Clientes Ativos', sub: 'Fotografia do último dia informado de cada mês' },
  { id: 'parceiros', title: 'BaaS e White Labels Ativos', sub: 'Parceiros ativos nas condições vigentes' },
  { id: 'takerate', title: 'Receita ÷ TPV', sub: 'Take rate — quanto da movimentação vira receita' },
  { id: 'atividade', title: 'Atividade Operacional', sub: 'Transações, MEDs e clientes ativos lado a lado' },
  { id: 'mrr', title: 'Evolução do MRR', sub: 'Receita recorrente mensal' },
]

const DEFAULT_ORDER = CHART_DEFS.map(c => c.id)
// Chave versionada: a lista de graficos mudou nesta rodada, e uma ordem
// salva com os ids antigos nao deve sobreviver silenciosamente.
const LS_KEY = 'dashboard_chart_order_v3'

const PADRAO_SERIALIZADO = JSON.stringify(DEFAULT_ORDER)
const EVENTO_ORDEM = 'bp-chart-order'

/**
 * A ordem dos gráficos é preferência LOCAL do usuário, guardada no navegador.
 *
 * Lida por `useSyncExternalStore` e não por efeito: o localStorage é um
 * sistema externo ao React, e ler dele com `setState` dentro de um efeito
 * causa uma renderização em cascata a cada montagem. O snapshot precisa ser a
 * STRING crua — devolver um array novo a cada chamada faria o store considerar
 * o valor sempre diferente e entrar em laço.
 */
function assinarOrdem(cb: () => void) {
  window.addEventListener(EVENTO_ORDEM, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENTO_ORDEM, cb)
    window.removeEventListener('storage', cb)
  }
}

function ordemGuardada(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? PADRAO_SERIALIZADO
  } catch {
    return PADRAO_SERIALIZADO
  }
}

/** Valida contra a lista atual: uma ordem salva com ids antigos é descartada. */
function interpretarOrdem(bruto: string): string[] {
  try {
    const parsed = JSON.parse(bruto) as string[]
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_ORDER.length &&
      DEFAULT_ORDER.every((id) => parsed.includes(id))
    ) return parsed
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

export default function DashboardCharts({ chartData, mrrEvolution, parceiros }: {
  chartData: ChartPoint[]
  mrrEvolution: MRRPoint[]
  parceiros: Parceiros
}) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const bruto = useSyncExternalStore(assinarOrdem, ordemGuardada, () => PADRAO_SERIALIZADO)
  const order = useMemo(() => interpretarOrdem(bruto), [bruto])

  const [reordering, setReordering] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOver = useRef<string | null>(null)

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    const next = [...order]
    next.splice(next.indexOf(targetId), 0, ...next.splice(next.indexOf(draggingId), 1))
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {}
    window.dispatchEvent(new Event(EVENTO_ORDEM))
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

  // Eixo sem centavos; tooltip e cards seguem com o valor cheio.
  const eixoMoeda = (v: number) => fmtEixoMoeda(v)
  const eixoQtd = (v: number) => quantidadeCompacta(v)
  const eixoPct = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)}%`

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)

  const charts: Record<string, React.ReactNode> = {
    receita: hasSeries(data, 'receitaTarifaria') ? (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes',
            [{ key: 'receitaTarifaria', nome: 'Tarifária', cor: p.s1 }], moedaCheia)} />
          <Bar dataKey="receitaTarifaria" name="Tarifária" fill={p.s1} {...BAR} />
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
              <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
              <Tooltip cursor={cursorLinha(p)} content={makeTooltip(mrr, 'mes',
                [{ key: 'mrr', nome: 'MRR', cor: p.s1 }], moedaCheia)} />
              <Area type="monotone" dataKey="mrr" stroke={p.s1} fill="url(#mrrG)" {...linha} />
            </AreaChart>
          </ResponsiveContainer>
        ),

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
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
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


    transacoes: hasSeries(data, 'qtdTransacoes') ? (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoQtd} width={88} allowDecimals={false} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes',
            [{ key: 'qtdTransacoes', nome: 'Transações', cor: p.s1 }], quantidadeCompacta)} />
          <Bar dataKey="qtdTransacoes" name="Transações" fill={p.s1} {...BAR} />
        </BarChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhuma transação lançada nos últimos 12 meses." />,

    saldo: hasSeries(data, 'saldoMedio') ? (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="saldoG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.s2} stopOpacity={0.20} />
              <stop offset="100%" stopColor={p.s2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
          <Tooltip cursor={cursorLinha(p)} content={makeTooltip(data, 'mes',
            [{ key: 'saldoMedio', nome: 'Saldo médio', cor: p.s2 }], moedaCheia)} />
          <Area type="monotone" dataKey="saldoMedio" stroke={p.s2} fill="url(#saldoG)" {...linha} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum saldo em conta lançado no período." />,

    /* MED em DUAS leituras no mesmo gráfico: a barra é a quantidade, a linha é
       a proporção sobre as transações. São o mesmo fato em unidades
       diferentes, e separá-los em dois gráficos obrigaria a alternar entre
       eles para responder "foram muitos?" e "foram muitos para o volume?". */
    med: hasSeries(data, 'qtdMed', 'percentMed') ? (
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis yAxisId="qtd" {...eixo} tickFormatter={eixoQtd} width={76} allowDecimals={false} />
          <YAxis yAxisId="pct" orientation="right" {...eixo} tickFormatter={eixoPct} width={56} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes', [
            { key: 'qtdMed', nome: 'MEDs', cor: p.s3 },
            { key: 'percentMed', nome: '% das transações', cor: p.s1 },
          ], (n) => (n < 100 && !Number.isInteger(n) ? percentual(n, 2) : quantidadeCompacta(n)))} />
          <Legend {...leg} />
          <Bar yAxisId="qtd" dataKey="qtdMed" name="MEDs" fill={p.s3} {...BAR} />
          <Line yAxisId="pct" type="monotone" dataKey="percentMed" name="% das transações"
            stroke={p.s1} {...linha} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum MED lançado no período." />,

    clientes: hasSeries(data, 'clientesAtivos') ? (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="cliG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
              <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis {...eixo} tickFormatter={eixoQtd} width={64} allowDecimals={false} />
          <Tooltip cursor={cursorLinha(p)} content={makeTooltip(data, 'mes',
            [{ key: 'clientesAtivos', nome: 'Clientes ativos', cor: p.s1 }], quantidadeCompacta)} />
          <Area type="monotone" dataKey="clientesAtivos" stroke={p.s1} fill="url(#cliG)" {...linha} />
        </AreaChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Nenhum dia do período informou clientes ativos no lançamento diário." />,

    /* BaaS e White Labels ativos vêm das condições comerciais VIGENTES: o
       sistema guarda o estado de hoje, não uma série mês a mês. Desenhar uma
       linha reta de 12 pontos iguais fingiria uma tendência que não existe —
       então mostramos o número corrente, que é o que de fato se sabe. */
    parceiros: (
      <div className="h-[200px] grid sm:grid-cols-2 gap-px bg-line rounded-xl overflow-hidden">
        {[
          { label: 'BaaS ativos', valor: parceiros.baasAtivos },
          { label: 'White Labels ativos', valor: parceiros.whiteLabelsAtivos },
        ].map((x) => (
          <div key={x.label} className="bg-surface flex flex-col items-center justify-center gap-2 p-5">
            <span className="t-label text-subtle">{x.label}</span>
            <span className="t-figure text-fg tabular-nums">{quantidadeCompacta(x.valor)}</span>
            <span className="t-label text-subtle/70 text-center">Condições BaaS · estado atual</span>
          </div>
        ))}
      </div>
    ),

    atividade: hasSeries(data, 'qtdTransacoes', 'qtdMed', 'clientesAtivos') ? (
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="mes" {...eixo} />
          <YAxis yAxisId="tx" {...eixo} tickFormatter={eixoQtd} width={88} allowDecimals={false} />
          <YAxis yAxisId="cli" orientation="right" {...eixo} tickFormatter={eixoQtd} width={56} allowDecimals={false} />
          <Tooltip cursor={cursorBarra(p)} content={makeTooltip(data, 'mes', [
            { key: 'qtdTransacoes', nome: 'Transações', cor: p.s1 },
            { key: 'qtdMed', nome: 'MEDs', cor: p.s3 },
            { key: 'clientesAtivos', nome: 'Clientes ativos', cor: p.s2 },
          ], quantidadeCompacta)} />
          <Legend {...leg} />
          <Bar yAxisId="tx" dataKey="qtdTransacoes" name="Transações" fill={p.s1} {...BAR} />
          <Bar yAxisId="tx" dataKey="qtdMed" name="MEDs" fill={p.s3} {...BAR} />
          <Line yAxisId="cli" type="monotone" dataKey="clientesAtivos" name="Clientes ativos"
            stroke={p.s2} {...linha} />
        </ComposedChart>
      </ResponsiveContainer>
    ) : <NoSeries what="Sem transações, MEDs e clientes ativos suficientes para compor a leitura." />,
  }

  const deltas: Record<string, React.ReactNode> = {
    receita: deltaDe('receitaTarifaria'),
    tpv: deltaDe('tpv'),
    takerate: deltaDe('takeRate'),
    transacoes: deltaDe('qtdTransacoes'),
    saldo: deltaDe('saldoMedio'),
    med: deltaDe('qtdMed'),
    clientes: deltaDe('clientesAtivos'),
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
