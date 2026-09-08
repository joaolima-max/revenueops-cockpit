export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { formatCurrency, formatTPV, formatPercent } from '@/lib/utils'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, contagensClientes,
  volumetriaDoPeriodo, periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import PageHeader from '@/components/dashboard/PageHeader'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile, { MetaBar } from '@/components/ui/StatTile'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState, { NoData } from '@/components/ui/EmptyState'

const ROTULO_META: Record<string, string> = {
  RECEITA_TARIFARIA: 'Receita Tarifária',
  TPV: 'TPV',
  SALDO_EM_CONTA: 'Saldo em Conta',
  TRANSACOES: 'Transações',
  MEDS: 'MEDs',
}

const VOLUMETRIA: Record<string, { label: string; tone: BadgeTone }> = {
  ATINGIDO: { label: 'Atingido', tone: 'pos' },
  NAO_ATINGIDO: { label: 'Não atingido', tone: 'neg' },
  EM_ACOMPANHAMENTO: { label: 'Em acompanhamento', tone: 'warn' },
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

  /** Sparkline dos últimos 12 meses — derivado da série já carregada. */
  const spark = (pick: (k: KpisPeriodo) => number | null) =>
    serie.map((k) => pick(k) ?? 0)

  const cards = [
    { label: 'TPV', v: kpis.tpv, fmt: formatTPV, primary: true,
      note: kpis.qtdTransacoes !== null ? `${kpis.qtdTransacoes.toLocaleString('pt-BR')} transações` : undefined,
      spark: spark((k) => k.tpv) },
    { label: 'Receita Tarifária', v: kpis.receitaTarifaria, fmt: formatCurrency,
      note: 'Lançamento diário', spark: spark((k) => k.receitaTarifaria) },
    { label: 'Float', v: kpis.float, fmt: formatCurrency,
      note: 'Saldo que dorme × multiplicador', spark: spark((k) => k.float) },
    { label: 'Take Rate', v: kpis.takeRate, fmt: (n: number) => formatPercent(n, 3),
      note: 'Receita ÷ TPV', spark: spark((k) => k.takeRate) },
    { label: 'Saldo Médio', v: kpis.saldoMedio, fmt: formatCurrency,
      note: 'Média do período', spark: spark((k) => k.saldoMedio) },
    { label: '% de MEDs', v: kpis.percentMed, fmt: (n: number) => formatPercent(n, 2),
      note: kpis.qtdMed !== null ? `${kpis.qtdMed.toLocaleString('pt-BR')} MEDs` : undefined,
      spark: spark((k) => k.percentMed) },
    { label: 'MRR', v: clientes.mrr, fmt: formatCurrency,
      note: `${clientes.contasAtivas} contas ativas` },
    { label: 'Faturamento', v: receita ? receita.total : null, fmt: formatCurrency,
      note: 'Soma das 5 linhas' },
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

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cockpit Executivo"
        sub={<>Olá, {session?.name.split(' ')[0]} · <span className="capitalize">{hoje}</span></>}
      />

      {!kpis.temDados && (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum lançamento no mês corrente"
            description="Os indicadores abaixo vêm do lançamento diário. Sem dados registrados, não há o que calcular."
            action={
              <Link
                href="/dashboard/forecast"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-white text-[0.875rem] font-medium transition-colors duration-[180ms]"
              >
                Ir para o Lançamento Diário
              </Link>
            }
          />
        </Panel>
      )}

      <HairlineGrid cols={4}>
        {cards.map((c) => (
          <StatTile
            key={c.label}
            label={c.label}
            value={c.v}
            format={c.fmt}
            note={c.note}
            primary={c.primary}
            spark={c.spark}
          />
        ))}
      </HairlineGrid>

      {receita && (
        <section className="space-y-4">
          <PanelHeader title="Linhas de Receita" sub="Cada linha tem origem única. A soma é o faturamento do período." />
          <HairlineGrid cols={5}>
            {([
              ['Tarifário', receita.tarifario], ['Float', receita.float],
              ['Sustentação', receita.sustentacao], ['Setup', receita.setup],
              ['Serviços', receita.servicos],
            ] as const).map(([label, valor]) => (
              <HairlineCell key={label} className="gap-2">
                <p className="t-label text-subtle">{label}</p>
                <p className="t-figure text-fg">{formatCurrency(valor)}</p>
                <p className="t-sm text-subtle tabular-nums">
                  {receita.total > 0 ? `${((valor / receita.total) * 100).toFixed(1)}% do faturamento` : '—'}
                </p>
              </HairlineCell>
            ))}
          </HairlineGrid>
        </section>
      )}

      {metas.length > 0 && (
        <section className="space-y-4">
          <PanelHeader title="Meta × Realizado" sub={`Período ${periodo}`} />
          <HairlineGrid cols={5}>
            {metas.map((m) => (
              <HairlineCell key={m.tipo} className="gap-3">
                <p className="t-label text-subtle">{ROTULO_META[m.tipo] ?? m.tipo}</p>
                <p className="t-figure text-fg">
                  {m.realizado === null
                    ? <NoData />
                    : m.realizado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </p>
                <p className="t-sm text-subtle tabular-nums">
                  meta {m.meta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </p>
                <div className="mt-auto pt-2 space-y-2">
                  <MetaBar pct={m.atingimento} />
                  <p className="t-mono text-muted">
                    {m.atingimento === null ? '—' : `${m.atingimento.toFixed(0)}%`}
                  </p>
                </div>
              </HairlineCell>
            ))}
          </HairlineGrid>
        </section>
      )}

      {volumetria && (
        <Panel className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg">Volumetria Mínima Contratada</h2>
            <p className="t-sm text-muted mt-1 tabular-nums">
              Mínimo {volumetria.qtdMinima.toLocaleString('pt-BR')} transações ·{' '}
              Realizado {volumetria.realizado?.toLocaleString('pt-BR') ?? 'sem dados'}
            </p>
          </div>
          <Badge tone={VOLUMETRIA[volumetria.status]?.tone ?? 'neutral'}>
            {VOLUMETRIA[volumetria.status]?.label ?? 'Sem dados'}
          </Badge>
        </Panel>
      )}

      <DashboardCharts
        chartData={chartData}
        mrrEvolution={periodos.map((p) => ({ mes: p, mrr: clientes.mrr }))}
      />
    </div>
  )
}
