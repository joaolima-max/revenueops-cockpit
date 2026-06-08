export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  formatCurrency,
  formatPercent,
  getLast12Months,
} from '@/lib/utils'
import CacEditor from './CacEditor'
import { CanaisChart, ConcentracaoChart } from './Charts'
import type { CanalData, ConcentracaoData } from './Charts'

// ─── Data types ────────────────────────────────────────────────────────────────

interface ClienteRow {
  id: string
  nome: string
  status: string
  modeloOperacional: string
  dataFechamento: Date | null
  dataEncerramento: Date | null
  mensalidadeApi: number | null
  sustentacaoWhiteLabel: number | null
  canal?: string | null
}

interface ProcRow {
  clienteId: string
  _sum: { receitaTarifaria: number | null; floating: number | null }
  _count: { mesRef: number }
}

interface CoorteData {
  quarter: string
  count: number
  avgLtv: number
  avgMrr: number
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function getData() {
  const meses12 = getLast12Months()
  const now = new Date()
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Fetch in parallel
  const [clientes, proc12M, encerradosProc, cacParam] = await Promise.all([
    prisma.cliente.findMany({
      where: { status: { in: ['ATIVO', 'ENCERRADO'] } },
      select: {
        id: true,
        nome: true,
        status: true,
        modeloOperacional: true,
        dataFechamento: true,
        dataEncerramento: true,
        mensalidadeApi: true,
        sustentacaoWhiteLabel: true,
        // canal is not in schema — skip
      },
    }) as Promise<ClienteRow[]>,

    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: { mesRef: { in: meses12 } },
      _sum: { receitaTarifaria: true, floating: true },
      _count: { mesRef: true },
    }) as Promise<ProcRow[]>,

    // For ENCERRADO clients: all-time revenue
    prisma.processamento.groupBy({
      by: ['clienteId'],
      _sum: { receitaTarifaria: true, floating: true },
      _count: { mesRef: true },
    }) as Promise<ProcRow[]>,

    prisma.parametro.findFirst({
      where: { chave: 'CAC_ESTIMADO' },
    }),
  ])

  // ── CAC ────────────────────────────────────────────────────────────────────
  const cacAtual = cacParam ? parseFloat(cacParam.valor) || 0 : 0

  // ── Maps ───────────────────────────────────────────────────────────────────
  const proc12Map = new Map(proc12M.map(p => [p.clienteId, p]))
  const allTimeMap = new Map(encerradosProc.map(p => [p.clienteId, p]))

  const ativos = clientes.filter(c => c.status === 'ATIVO')
  const encerrados = clientes.filter(c => c.status === 'ENCERRADO')

  // ── LTV calculation ────────────────────────────────────────────────────────
  // ATIVO: (avg monthly processamento revenue over 12M) × 24
  // ENCERRADO: total all-time revenue
  const ltvPorCliente: number[] = []

  for (const c of ativos) {
    const p = proc12Map.get(c.id)
    if (p && p._count.mesRef > 0) {
      const totalRev = (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0)
      const avgMonthly = totalRev / p._count.mesRef
      ltvPorCliente.push(avgMonthly * 24)
    } else {
      // No processamentos — use MRR as proxy × 24
      const mrr = (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0)
      if (mrr > 0) ltvPorCliente.push(mrr * 24)
    }
  }

  for (const c of encerrados) {
    const p = allTimeMap.get(c.id)
    if (p) {
      const total = (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0)
      if (total > 0) ltvPorCliente.push(total)
    }
  }

  const ltvMedio =
    ltvPorCliente.length > 0
      ? ltvPorCliente.reduce((a, b) => a + b, 0) / ltvPorCliente.length
      : 0

  // ── LTV/CAC ────────────────────────────────────────────────────────────────
  const ltvCacRatio = cacAtual > 0 ? ltvMedio / cacAtual : null

  // ── Churn rate ─────────────────────────────────────────────────────────────
  const encerrados90d = clientes.filter(
    c =>
      c.status === 'ENCERRADO' &&
      c.dataEncerramento &&
      new Date(c.dataEncerramento) >= d90
  ).length
  const churnRate =
    clientes.length > 0 ? (encerrados90d / clientes.length) * 100 : 0

  // ── Ticket médio ───────────────────────────────────────────────────────────
  const receitaTotal12M = proc12M.reduce(
    (s, p) => s + (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0),
    0
  )
  const clientesComReceita = proc12M.filter(
    p => (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0) > 0
  ).length
  const ticketMedio =
    clientesComReceita > 0 ? receitaTotal12M / clientesComReceita : 0

  // ── Receita por modelo ─────────────────────────────────────────────────────
  let receitaApi = 0
  let receitaWL = 0
  for (const c of clientes) {
    const p = proc12Map.get(c.id)
    const rev = (p?._sum.receitaTarifaria || 0) + (p?._sum.floating || 0)
    if (c.modeloOperacional === 'API') receitaApi += rev
    else receitaWL += rev
  }

  // ── Canais de aquisição — canal not in schema, show placeholder ────────────
  const canalData: CanalData[] = []
  const hasCanal = false // canal field does not exist in Prisma schema

  // ── Coortes por trimestre ──────────────────────────────────────────────────
  const coorteMap = new Map<string, { clienteIds: string[]; mrrTotal: number }>()

  for (const c of ativos) {
    if (!c.dataFechamento) continue
    const dt = new Date(c.dataFechamento)
    const q = Math.floor(dt.getMonth() / 3) + 1
    const key = `${dt.getFullYear()}-Q${q}`
    if (!coorteMap.has(key)) coorteMap.set(key, { clienteIds: [], mrrTotal: 0 })
    const entry = coorteMap.get(key)!
    entry.clienteIds.push(c.id)
    entry.mrrTotal += (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0)
  }

  const coortes: CoorteData[] = [...coorteMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, { clienteIds, mrrTotal }]) => {
      const ltvs = clienteIds
        .map(id => {
          const p = proc12Map.get(id)
          if (p && p._count.mesRef > 0) {
            const total = (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0)
            return (total / p._count.mesRef) * 24
          }
          return 0
        })
        .filter(v => v > 0)
      const avgLtv = ltvs.length > 0 ? ltvs.reduce((a, b) => a + b, 0) / ltvs.length : 0
      const avgMrr = clienteIds.length > 0 ? mrrTotal / clienteIds.length : 0
      return { quarter, count: clienteIds.length, avgLtv, avgMrr }
    })

  // ── Concentração de receita — top 5 clientes ──────────────────────────────
  const receitaListRaw = clientes
    .map(c => {
      const p = proc12Map.get(c.id)
      return {
        id: c.id,
        nome: c.nome,
        receita: (p?._sum.receitaTarifaria || 0) + (p?._sum.floating || 0),
      }
    })
    .filter(r => r.receita > 0)
    .sort((a, b) => b.receita - a.receita)

  const receitaTotalAll = receitaListRaw.reduce((s, r) => s + r.receita, 0)

  const top5: ConcentracaoData[] = receitaListRaw.slice(0, 5).map(r => ({
    nome: r.nome.length > 18 ? r.nome.slice(0, 16) + '…' : r.nome,
    receita: r.receita,
    percentual: receitaTotalAll > 0 ? (r.receita / receitaTotalAll) * 100 : 0,
  }))

  // Add "Outros" bucket if more than 5
  if (receitaListRaw.length > 5) {
    const outrosTotal = receitaListRaw
      .slice(5)
      .reduce((s, r) => s + r.receita, 0)
    top5.push({
      nome: 'Outros',
      receita: outrosTotal,
      percentual: receitaTotalAll > 0 ? (outrosTotal / receitaTotalAll) * 100 : 0,
    })
  }

  const maiorCliente = receitaListRaw[0]
  const maiorPct =
    maiorCliente && receitaTotalAll > 0
      ? (maiorCliente.receita / receitaTotalAll) * 100
      : 0

  return {
    // KPIs
    ltvMedio,
    cacAtual,
    cacParamId: cacParam?.id ?? null,
    ltvCacRatio,
    churnRate,
    encerrados90d,
    ticketMedio,
    receitaApi,
    receitaWL,
    receitaTotal12M,
    totalClientes: clientes.length,
    ativosCount: ativos.length,
    // Canais
    hasCanal,
    canalData,
    // Coortes
    coortes,
    // Concentração
    top5,
    maiorPct,
    maiorClienteNome: maiorCliente?.nome ?? null,
  }
}

// ─── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color = 'text-white',
  bg = 'bg-gray-900',
}: {
  label: string
  value: string
  sub?: string
  color?: string
  bg?: string
}) {
  return (
    <div className={`${bg} border border-gray-800 rounded-xl p-5`}>
      <p className="text-gray-500 text-xs mb-1.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
    </div>
  )
}

// ─── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-1 h-5 rounded-full flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
      />
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function InteligenciaComercialPage() {
  const [session, data] = await Promise.all([getSession(), getData()])

  const isAdmin = session?.role === 'ADMIN'

  const receitaTotalModelo = data.receitaApi + data.receitaWL

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-white">Inteligência Comercial</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Análise de LTV, CAC, coortes e concentração de receita
        </p>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading title="Indicadores Chave" sub="Baseado nos últimos 12 meses de processamento" />
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          <KpiCard
            label="LTV Médio"
            value={formatCurrency(data.ltvMedio)}
            sub={`${data.ativosCount} clientes ativos + ${data.totalClientes - data.ativosCount} encerrados`}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
          />
          <KpiCard
            label="CAC Estimado"
            value={formatCurrency(data.cacAtual)}
            sub="Custo de Aquisição por Cliente"
            color="text-amber-400"
            bg="bg-amber-500/10"
          />
          <KpiCard
            label="LTV / CAC"
            value={
              data.ltvCacRatio !== null
                ? `${data.ltvCacRatio.toFixed(1)}×`
                : data.cacAtual === 0
                ? 'CAC não definido'
                : '—'
            }
            sub={
              data.ltvCacRatio !== null
                ? data.ltvCacRatio >= 3
                  ? 'Saudável (≥ 3×)'
                  : data.ltvCacRatio >= 1
                  ? 'Abaixo do ideal (< 3×)'
                  : 'Crítico (< 1×)'
                : undefined
            }
            color={
              data.ltvCacRatio === null
                ? 'text-gray-500'
                : data.ltvCacRatio >= 3
                ? 'text-emerald-400'
                : data.ltvCacRatio >= 1
                ? 'text-amber-400'
                : 'text-red-400'
            }
          />
          <KpiCard
            label="Churn (últimos 90 dias)"
            value={formatPercent(data.churnRate, 1)}
            sub={`${data.encerrados90d} encerramento${data.encerrados90d !== 1 ? 's' : ''} / ${data.totalClientes} clientes`}
            color={data.churnRate > 5 ? 'text-red-400' : data.churnRate > 2 ? 'text-amber-400' : 'text-emerald-400'}
            bg={data.churnRate > 5 ? 'bg-red-500/10' : 'bg-gray-900'}
          />
          <KpiCard
            label="Ticket Médio (12M)"
            value={formatCurrency(data.ticketMedio)}
            sub={`Receita total ${formatCurrency(data.receitaTotal12M)}`}
            color="text-sky-400"
          />
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-xs mb-3">Receita por Modelo (12M)</p>
            <div className="space-y-3">
              {[
                { label: 'API', value: data.receitaApi, color: 'bg-sky-500' },
                { label: 'White Label', value: data.receitaWL, color: 'bg-violet-500' },
              ].map(row => {
                const pct =
                  receitaTotalModelo > 0
                    ? (row.value / receitaTotalModelo) * 100
                    : 0
                return (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-400">{row.label}</span>
                      <span className="text-xs font-semibold text-white">
                        {formatCurrency(row.value)}{' '}
                        <span className="text-gray-600 font-normal">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div
                        className={`h-1.5 ${row.color} rounded-full`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Canais de Aquisição ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading
          title="Canais de Aquisição"
          sub="Distribuição de clientes e receita por canal"
        />
        {hasCanal(data.hasCanal, data.canalData) ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
            <CanaisChart data={data.canalData} />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Canal', 'Clientes', 'Receita 12M', '% Receita'].map(h => (
                    <th
                      key={h}
                      className="text-xs font-medium text-gray-600 text-left py-2 px-3 first:pl-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.canalData.map(row => {
                  const pct =
                    data.receitaTotal12M > 0
                      ? (row.receita / data.receitaTotal12M) * 100
                      : 0
                  return (
                    <tr
                      key={row.canal}
                      className="border-b border-gray-800/40 hover:bg-gray-800/20"
                    >
                      <td className="py-2.5 px-3 pl-0 text-white font-medium">{row.canal}</td>
                      <td className="py-2.5 px-3 text-sky-400 font-semibold">{row.clientes}</td>
                      <td className="py-2.5 px-3 text-emerald-400 font-semibold">
                        {formatCurrency(row.receita)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400">{formatPercent(pct, 1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">
              Cadastre o canal de aquisição nos clientes para visualizar esta análise.
            </p>
            <p className="text-gray-700 text-xs mt-1">
              O campo <code className="font-mono bg-gray-800 px-1 py-0.5 rounded">canal</code>{' '}
              não está disponível no modelo de dados atual.
            </p>
          </div>
        )}
      </section>

      {/* ── Coortes ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading
          title="Coortes de Clientes"
          sub="Agrupamento por trimestre de fechamento (clientes ativos)"
        />
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {data.coortes.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-sm">
                Nenhum cliente ativo com data de fechamento registrada.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/30">
                  {['Coorte', 'Clientes', 'LTV Médio (projetado)', 'MRR Médio'].map(h => (
                    <th
                      key={h}
                      className="text-xs font-medium text-gray-500 text-left px-5 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.coortes.map((row, i) => (
                  <tr
                    key={row.quarter}
                    className={`border-b border-gray-800/40 hover:bg-gray-800/20 ${
                      i === data.coortes.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span className="text-white font-medium">{row.quarter}</span>
                    </td>
                    <td className="px-5 py-3 text-sky-400 font-semibold">{row.count}</td>
                    <td className="px-5 py-3 text-emerald-400 font-semibold">
                      {row.avgLtv > 0 ? formatCurrency(row.avgLtv) : '—'}
                    </td>
                    <td className="px-5 py-3 text-violet-400 font-semibold">
                      {row.avgMrr > 0 ? formatCurrency(row.avgMrr) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Concentração de Receita ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading
          title="Concentração de Receita"
          sub="Top 5 clientes por receita nos últimos 12 meses"
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            {data.top5.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-gray-500 text-sm">Nenhum dado de processamento disponível.</p>
              </div>
            ) : (
              <ConcentracaoChart data={data.top5} />
            )}
          </div>

          {/* Table + risk */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            {data.maiorPct >= 30 && data.maiorClienteNome && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                <p className="text-red-400 text-xs font-semibold mb-0.5">Risco de concentração</p>
                <p className="text-red-300 text-xs">
                  <strong>{data.maiorClienteNome}</strong> representa{' '}
                  {formatPercent(data.maiorPct, 1)} da receita — qualquer churn impacta
                  significativamente o faturamento.
                </p>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['#', 'Cliente', 'Receita 12M', '%'].map(h => (
                    <th
                      key={h}
                      className="text-xs font-medium text-gray-600 text-left py-2 px-2 first:pl-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.top5.map((row, i) => (
                  <tr
                    key={row.nome}
                    className="border-b border-gray-800/40 hover:bg-gray-800/20 last:border-b-0"
                  >
                    <td className="py-2.5 px-2 pl-0 text-gray-600 text-xs w-6">{i + 1}</td>
                    <td className="py-2.5 px-2 text-white font-medium max-w-[140px] truncate">
                      {row.nome}
                    </td>
                    <td className="py-2.5 px-2 text-emerald-400 font-semibold whitespace-nowrap">
                      {formatCurrency(row.receita)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`text-xs font-semibold ${
                          row.percentual >= 30
                            ? 'text-red-400'
                            : row.percentual >= 15
                            ? 'text-amber-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {formatPercent(row.percentual, 1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Gestão de CAC ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading
          title="Gestão de CAC"
          sub="Custo de Aquisição por Cliente — parâmetro configurável"
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Editor */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <CacEditor
              parametroId={data.cacParamId}
              cacAtual={data.cacAtual}
              isAdmin={isAdmin}
            />
          </div>

          {/* Explanation */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">O que é o CAC?</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              O <strong className="text-gray-300">Custo de Aquisição por Cliente (CAC)</strong>{' '}
              representa o investimento médio necessário para converter um prospect em cliente
              pagante — somando gastos com marketing, vendas, comissões e onboarding.
            </p>
            <div className="space-y-2">
              {[
                {
                  label: 'LTV / CAC ≥ 3×',
                  desc: 'Negócio saudável — retorno supera bem o custo de aquisição.',
                  ok: true,
                },
                {
                  label: 'LTV / CAC entre 1× e 3×',
                  desc: 'Alerta — revise canais e processos de vendas.',
                  ok: null,
                },
                {
                  label: 'LTV / CAC < 1×',
                  desc: 'Crítico — cada cliente custa mais do que gera de retorno.',
                  ok: false,
                },
              ].map(item => (
                <div
                  key={item.label}
                  className={`flex gap-3 items-start px-3 py-2.5 rounded-lg ${
                    item.ok === true
                      ? 'bg-emerald-500/10'
                      : item.ok === false
                      ? 'bg-red-500/10'
                      : 'bg-amber-500/10'
                  }`}
                >
                  <span
                    className={`text-xs font-bold mt-0.5 flex-shrink-0 ${
                      item.ok === true
                        ? 'text-emerald-400'
                        : item.ok === false
                        ? 'text-red-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="text-xs text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
            {data.ltvCacRatio !== null && (
              <div className="pt-2 border-t border-gray-800">
                <p className="text-xs text-gray-600">
                  Sua relação atual:{' '}
                  <span
                    className={`font-bold ${
                      data.ltvCacRatio >= 3
                        ? 'text-emerald-400'
                        : data.ltvCacRatio >= 1
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {data.ltvCacRatio.toFixed(2)}×
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// Helper — keeps TypeScript happy when canal is not in schema
function hasCanal(flag: boolean, data: CanalData[]): data is CanalData[] {
  return flag && data.length > 0
}
