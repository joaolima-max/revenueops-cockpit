export const dynamic = 'force-dynamic'

import { formatCurrency, formatTPV, formatPercent, formatMesRef } from '@/lib/utils'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import EmptyState, { NoData } from '@/components/ui/EmptyState'
import {
  kpisDoPeriodo, linhasReceita, contagensClientes,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'

export default async function ConselhoPage() {
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(24)

  const [kpis, receita, clientes, serie] = await Promise.all([
    kpisDoPeriodo(periodo),
    linhasReceita(periodo),
    contagensClientes(),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  const comDados = serie.filter((k: KpisPeriodo) => k.temDados)
  const histTpv = comDados.reduce((a, k) => a + (k.tpv ?? 0), 0)
  const histTx = comDados.reduce((a, k) => a + (k.qtdTransacoes ?? 0), 0)
  const histFat = comDados.reduce((a, k) => a + (k.receitaTarifaria ?? 0) + (k.float ?? 0), 0)
  const temHistorico = comDados.length > 0

  const mensais = [
    { label: 'TPV', v: kpis.tpv, fmt: formatTPV },
    { label: 'Transações', v: kpis.qtdTransacoes, fmt: (n: number) => n.toLocaleString('pt-BR') },
    { label: 'Faturamento', v: receita ? receita.total : null, fmt: formatCurrency },
    { label: '% de MEDs', v: kpis.percentMed, fmt: (n: number) => formatPercent(n, 2) },
    { label: 'Take Rate', v: kpis.takeRate, fmt: (n: number) => formatPercent(n, 3) },
    { label: 'MRR', v: clientes.mrr, fmt: formatCurrency },
    { label: 'WL Ativos', v: clientes.wlAtivos, fmt: (n: number) => String(n) },
    { label: 'Contas Ativas', v: clientes.contasAtivas, fmt: (n: number) => String(n) },
    { label: 'BaaS Ativos', v: clientes.baasAtivos, fmt: (n: number) => String(n) },
  ]

  const linhas = receita ? ([
    ['Setup', receita.setup], ['Sustentação', receita.sustentacao],
    ['Tarifário', receita.tarifario], ['Float', receita.float], ['Serviços', receita.servicos],
  ] as const) : []

  return (
    <div className="space-y-10">
      <PageHeader
        title="Conselho Administrativo"
        sub={<>Indicadores consolidados · <span className="capitalize">{formatMesRef(periodo)}</span></>}
      />

      {/* Número herói: faixa da superfície, sem cara de card. */}
      <section className="bg-surface border border-line rounded-3xl px-6 py-10 sm:px-10 sm:py-14">
        <p className="t-label text-subtle">TPV acumulado</p>
        <p className="t-hero text-fg mt-4">
          {temHistorico ? formatTPV(histTpv) : <NoData />}
        </p>
        <div className="flex items-center gap-3 mt-6">
          <span className="bp-rule" aria-hidden />
          <p className="t-sm text-subtle">
            {temHistorico
              ? `Acumulado de ${comDados.length} ${comDados.length === 1 ? 'mês' : 'meses'} com lançamento`
              : 'Nenhum período lançado'}
          </p>
        </div>
      </section>

      <HairlineGrid cols={2}>
        {[
          { label: 'Faturamento acumulado', v: temHistorico ? histFat : null, fmt: formatCurrency },
          { label: 'Transações acumuladas', v: temHistorico ? histTx : null, fmt: (n: number) => n.toLocaleString('pt-BR') },
        ].map((h) => (
          <HairlineCell key={h.label} className="gap-4 py-8 sm:py-10 sm:px-8">
            <p className="t-label text-subtle">{h.label}</p>
            <p className="t-hero text-fg">{h.v === null ? <NoData /> : h.fmt(h.v)}</p>
          </HairlineCell>
        ))}
      </HairlineGrid>

      <section className="space-y-4">
        <PanelHeader title="Indicadores do mês" sub={`Período ${periodo}`} />
        <HairlineGrid cols={3}>
          {mensais.map((m) => (
            <HairlineCell key={m.label} className="gap-3">
              <p className="t-label text-subtle">{m.label}</p>
              <p className="t-figure text-fg">{m.v === null ? <NoData /> : m.fmt(m.v)}</p>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>

      <section className="space-y-4">
        <PanelHeader title="Linhas de Receita" sub="A soma corresponde ao faturamento do período." />
        {!receita ? (
          <Panel padded={false}>
            <EmptyState title="Sem dados no período" description="Nenhuma linha de receita apurada para este mês." />
          </Panel>
        ) : (
          <>
            <HairlineGrid cols={5}>
              {linhas.map(([label, valor]) => (
                <HairlineCell key={label} className="gap-2">
                  <p className="t-label text-subtle">{label}</p>
                  <p className="t-figure text-fg">{formatCurrency(valor)}</p>
                  <p className="t-mono text-muted">
                    {receita.total > 0 ? `${((valor / receita.total) * 100).toFixed(1)}%` : '—'}
                  </p>
                </HairlineCell>
              ))}
            </HairlineGrid>
            <Panel className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="t-label text-subtle">Faturamento total</span>
              <span className="t-figure text-fg">{formatCurrency(receita.total)}</span>
            </Panel>
          </>
        )}
      </section>
    </div>
  )
}
