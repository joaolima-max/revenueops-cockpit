export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, contagensClientes,
  volumetriaDoPeriodo, periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import { formatMesRef } from '@/lib/utils'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem,
  variacao, moedaCheia,
} from '@/lib/format-financeiro'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import PageHeader from '@/components/dashboard/PageHeader'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile, { MetaBar } from '@/components/ui/StatTile'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState, { NoData } from '@/components/ui/EmptyState'
import Figure, { Delta, Contexto } from '@/components/ui/Figure'

const ROTULO_META: Record<string, string> = {
  RECEITA_TARIFARIA: 'Receita Tarifária', TPV: 'TPV', SALDO_EM_CONTA: 'Saldo em Conta',
  TRANSACOES: 'Transações', MEDS: 'MEDs',
  RECEITA: 'Receita (legado)', MRR: 'MRR (legado)', CLIENTES_ATIVOS: 'Clientes ativos (legado)',
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

  /** Mês anterior com dado — base honesta para variação. Nada é extrapolado. */
  const anterior = [...serie].slice(0, -1).reverse().find((k) => k.temDados) ?? null
  const spark = (pick: (k: KpisPeriodo) => number | null) => serie.map((k) => pick(k) ?? 0)
  const varDe = (pick: (k: KpisPeriodo) => number | null) =>
    anterior ? variacao(pick(kpis), pick(anterior)) : null

  const principais = [
    { label: 'TPV', fig: kpis.tpv === null ? null : figuraMoeda(kpis.tpv), primary: true,
      delta: varDe((k) => k.tpv), spark: spark((k) => k.tpv),
      note: kpis.qtdTransacoes !== null ? `${figuraQuantidade(kpis.qtdTransacoes).valor}${figuraQuantidade(kpis.qtdTransacoes).unidade ? ' ' + figuraQuantidade(kpis.qtdTransacoes).unidade : ''} transações` : undefined },
    { label: 'Receita Tarifária', fig: kpis.receitaTarifaria === null ? null : figuraMoeda(kpis.receitaTarifaria),
      delta: varDe((k) => k.receitaTarifaria), spark: spark((k) => k.receitaTarifaria), note: 'Lançamento diário' },
    { label: 'Float', fig: kpis.float === null ? null : figuraMoeda(kpis.float),
      delta: varDe((k) => k.float), spark: spark((k) => k.float), note: 'Saldo que dorme × multiplicador' },
    { label: 'Faturamento', fig: receita ? figuraMoeda(receita.total) : null, note: 'Soma das 5 linhas' },
  ]

  const secundarios = [
    { label: 'Take Rate', fig: kpis.takeRate === null ? null : figuraPercentual(kpis.takeRate, 3),
      delta: varDe((k) => k.takeRate), note: 'Receita ÷ TPV' },
    { label: 'Saldo Médio', fig: kpis.saldoMedio === null ? null : figuraMoeda(kpis.saldoMedio),
      delta: varDe((k) => k.saldoMedio), note: 'Média do período' },
    { label: '% de MEDs', fig: kpis.percentMed === null ? null : figuraPercentual(kpis.percentMed, 2),
      delta: varDe((k) => k.percentMed),
      note: kpis.qtdMed !== null ? `${figuraQuantidade(kpis.qtdMed).valor} MEDs` : undefined },
    { label: 'MRR', fig: figuraMoeda(clientes.mrr), note: `${clientes.contasAtivas} contas ativas` },
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

  /** Atenção: metas abaixo de 70% e volumetria não atingida. Só o que já existe. */
  const alertas = [
    ...metas
      .filter((m) => m.atingimento !== null && m.atingimento < 70)
      .map((m) => ({
        tone: (m.atingimento! < 40 ? 'neg' : 'warn') as BadgeTone,
        titulo: `${ROTULO_META[m.tipo] ?? m.tipo} em ${m.atingimento!.toFixed(0)}% da meta`,
        href: '/dashboard/metas',
      })),
    ...(volumetria?.status === 'NAO_ATINGIDO'
      ? [{ tone: 'neg' as BadgeTone, titulo: 'Volumetria mínima contratada não atingida', href: '/dashboard/volumetria' }]
      : []),
    ...(!kpis.temDados
      ? [{ tone: 'warn' as BadgeTone, titulo: 'Nenhum lançamento diário no mês corrente', href: '/dashboard/forecast' }]
      : []),
  ]

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cockpit Executivo"
        sub={<>Olá, {session?.name.split(' ')[0]} · <span className="capitalize">{hoje}</span></>}
        actions={
          <Badge tone={kpis.temDados ? 'accent' : 'warn'}>
            {kpis.diasLancados} {kpis.diasLancados === 1 ? 'dia lançado' : 'dias lançados'}
          </Badge>
        }
      />

      {!kpis.temDados && (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum lançamento no mês corrente"
            description="Os indicadores vêm do lançamento diário. Sem dados registrados, não há o que calcular."
            action={
              <Link href="/dashboard/forecast"
                className="inline-flex items-center gap-2 px-4 py-2.5 bp-btn-primary rounded-lg text-[0.875rem] font-medium">
                Ir para o Lançamento Diário
              </Link>
            }
          />
        </Panel>
      )}

      {/* NÍVEL 1 — os quatro números que respondem "como estamos". */}
      <HairlineGrid cols={4}>
        {principais.map((c) => (
          <StatTile key={c.label} label={c.label} figura={c.fig} delta={c.delta}
            note={c.note} primary={c.primary} spark={c.spark} />
        ))}
      </HairlineGrid>

      {/* NÍVEL 2 — qualificadores. Mesma grade, sem sparkline: menos ruído. */}
      <HairlineGrid cols={4}>
        {secundarios.map((c) => (
          <StatTile key={c.label} label={c.label} figura={c.fig} delta={c.delta} note={c.note} size="sm" />
        ))}
      </HairlineGrid>

      {/* Painel largo: atenção + volumetria juntas, em vez de dois cards soltos. */}
      {(alertas.length > 0 || volumetria) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2" padded={false}>
            <div className="p-5 sm:p-6 pb-3">
              <PanelHeader title="Requer atenção" sub="Derivado das metas e da volumetria do período." />
            </div>
            {alertas.length === 0 ? (
              <EmptyState compact title="Nada em alerta" description="Metas e volumetria dentro do esperado." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {alertas.map((a) => (
                  <li key={a.titulo}>
                    <Link href={a.href}
                      className="group flex items-center gap-3 px-5 sm:px-6 py-3.5 transition-colors duration-[180ms] hover:bg-surface-2">
                      <Badge tone={a.tone}>{a.tone === 'neg' ? 'Crítico' : 'Atenção'}</Badge>
                      <span className="t-body text-fg bp-truncate flex-1">{a.titulo}</span>
                      <span aria-hidden className="t-sm text-subtle transition-transform duration-[180ms] group-hover:translate-x-0.5">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {volumetria && (
            <Panel className="flex flex-col justify-between gap-4">
              <PanelHeader title="Volumetria mínima" sub={`Contratada · ${formatMesRef(periodo)}`} />
              <div>
                <Figure figura={volumetria.realizado === null ? null : figuraQuantidade(volumetria.realizado)} />
                <Contexto className="block mt-2">
                  de {figuraQuantidade(volumetria.qtdMinima).completo} transações mínimas
                </Contexto>
              </div>
              <div className="space-y-2.5">
                <MetaBar pct={volumetria.realizado === null ? null : (volumetria.realizado / volumetria.qtdMinima) * 100} />
                <Badge tone={VOLUMETRIA[volumetria.status]?.tone ?? 'neutral'}>
                  {VOLUMETRIA[volumetria.status]?.label ?? 'Sem dados'}
                </Badge>
              </div>
            </Panel>
          )}
        </div>
      )}

      {receita && (
        <section className="space-y-4">
          <PanelHeader title="Composição da receita" sub="Cada linha tem origem única. A soma é o faturamento do período." />
          <HairlineGrid cols={5}>
            {([
              ['Tarifário', receita.tarifario], ['Float', receita.float],
              ['Sustentação', receita.sustentacao], ['Setup', receita.setup],
              ['Serviços', receita.servicos],
            ] as const).map(([label, valor]) => (
              <HairlineCell key={label} className="gap-2.5">
                <p className="t-label text-subtle">{label}</p>
                <Figure figura={figuraMoeda(valor)} size="sm" />
                <p className="t-mono text-muted">
                  {receita.total > 0 ? `${((valor / receita.total) * 100).toFixed(1)}% do total` : '—'}
                </p>
              </HairlineCell>
            ))}
          </HairlineGrid>
        </section>
      )}

      {metas.length > 0 && (
        <section className="space-y-4">
          <PanelHeader title="Meta × Realizado" sub={formatMesRef(periodo)} />
          <HairlineGrid cols={5}>
            {metas.map((m) => (
              <HairlineCell key={m.tipo} className="gap-2.5">
                <p className="t-label text-subtle bp-truncate" title={ROTULO_META[m.tipo] ?? m.tipo}>
                  {ROTULO_META[m.tipo] ?? m.tipo}
                </p>
                {m.realizado === null
                  ? <NoData />
                  : <Figure figura={figuraQuantidade(m.realizado)} size="sm" />}
                <p className="t-sm text-subtle" title={moedaCheia(m.meta)}>
                  meta {figuraQuantidade(m.meta).valor}{figuraQuantidade(m.meta).unidade && ` ${figuraQuantidade(m.meta).unidade}`}
                </p>
                <div className="mt-auto pt-2 space-y-2">
                  <MetaBar pct={m.atingimento} />
                  <p className={
                    m.atingimento === null ? 't-mono text-subtle'
                      : m.atingimento >= 100 ? 't-mono text-pos'
                      : m.atingimento >= 70 ? 't-mono text-warn' : 't-mono text-neg'
                  }>
                    {m.atingimento === null ? '—' : `${m.atingimento.toFixed(0)}% da meta`}
                  </p>
                </div>
              </HairlineCell>
            ))}
          </HairlineGrid>
        </section>
      )}

      <DashboardCharts
        chartData={chartData}
        mrrEvolution={periodos.map((p) => ({ mes: p, mrr: clientes.mrr }))}
      />
    </div>
  )
}
