export const dynamic = 'force-dynamic'

import { formatMesRef } from '@/lib/utils'
import {
  kpisDoPeriodo, linhasReceita, contagensClientes,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem,
  variacao, moedaCheia,
} from '@/lib/format-financeiro'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import EmptyState, { NoData } from '@/components/ui/EmptyState'
import Figure, { Delta, Contexto } from '@/components/ui/Figure'
import ConselhoEvolucao from '@/components/dashboard/ConselhoEvolucao'

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

  /** Mês anterior COM DADO. Sem ele, nenhuma variação é exibida. */
  const anterior = [...serie].slice(0, -1).reverse().find((k) => k.temDados) ?? null
  const varDe = (pick: (k: KpisPeriodo) => number | null) =>
    anterior ? variacao(pick(kpis), pick(anterior)) : null

  /* NÍVEL 2 — os números estratégicos. */
  const estrategicos = [
    { label: 'TPV do mês', fig: kpis.tpv === null ? null : figuraMoeda(kpis.tpv), delta: varDe(k => k.tpv) },
    { label: 'Faturamento', fig: receita ? figuraMoeda(receita.total) : null },
    { label: 'Take Rate', fig: kpis.takeRate === null ? null : figuraPercentual(kpis.takeRate, 3), delta: varDe(k => k.takeRate) },
    { label: 'MRR', fig: figuraMoeda(clientes.mrr) },
    { label: 'Transações', fig: kpis.qtdTransacoes === null ? null : figuraQuantidade(kpis.qtdTransacoes), delta: varDe(k => k.qtdTransacoes) },
    { label: '% de MEDs', fig: kpis.percentMed === null ? null : figuraPercentual(kpis.percentMed, 2), delta: varDe(k => k.percentMed) },
  ]

  /* NÍVEL 5 — a carteira em números inteiros. */
  const carteira = [
    { label: 'Contas ativas', v: clientes.contasAtivas },
    { label: 'White Label ativos', v: clientes.wlAtivos },
    { label: 'BaaS ativos', v: clientes.baasAtivos },
  ]

  const linhas = receita ? ([
    ['Tarifário', receita.tarifario], ['Float', receita.float],
    ['Sustentação', receita.sustentacao], ['Setup', receita.setup], ['Serviços', receita.servicos],
  ] as const) : []

  /** Maior linha de receita — responde "onde está a receita" sem o executivo somar. */
  const maiorLinha = receita && receita.total > 0
    ? [...linhas].sort((a, b) => b[1] - a[1])[0]
    : null

  const evolucao = periodos.map((p, i) => ({
    mes: formatMesRef(p),
    tpv: serie[i].tpv ?? 0,
    faturamento: serie[i].temDados ? (serie[i].receitaTarifaria ?? 0) + (serie[i].float ?? 0) : 0,
  }))

  return (
    <div className="space-y-10">
      <PageHeader
        title="Conselho Administrativo"
        sub={<>Indicadores consolidados · <span className="capitalize">{formatMesRef(periodo)}</span></>}
      />

      {/* ── NÍVEL 1 · HEADLINE ────────────────────────────────────────────
          Uma faixa, três números acumulados. É a resposta a "o que aconteceu". */}
      <section className="rounded-3xl border border-line bg-surface overflow-hidden">
        <div className="px-6 sm:px-10 pt-9 sm:pt-12 pb-8">
          <p className="t-label text-subtle">TPV acumulado</p>
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <Figure figura={temHistorico ? figuraMoeda(histTpv) : null} size="hero" />
            {temHistorico && <Delta v={varDe(k => k.tpv)} sufixo="no mês corrente" className="pb-2" />}
          </div>
          <div className="flex items-center gap-3 mt-6">
            <span className="bp-rule" aria-hidden />
            <Contexto>
              {temHistorico
                ? `Acumulado de ${comDados.length} ${comDados.length === 1 ? 'mês' : 'meses'} com lançamento`
                : 'Nenhum período lançado'}
            </Contexto>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-px bg-line border-t border-line">
          {[
            { label: 'Faturamento acumulado', fig: temHistorico ? figuraMoeda(histFat) : null },
            { label: 'Transações acumuladas', fig: temHistorico ? figuraQuantidade(histTx) : null },
          ].map((h) => (
            <div key={h.label} className="bg-surface px-6 sm:px-10 py-7 transition-colors duration-[380ms] hover:bg-surface-2">
              <p className="t-label text-subtle mb-3">{h.label}</p>
              <Figure figura={h.fig} />
            </div>
          ))}
        </div>
      </section>

      {/* ── NÍVEL 2 · NÚMEROS ESTRATÉGICOS ───────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader title="Como estamos" sub={`Desempenho de ${formatMesRef(periodo)} contra o último mês com lançamento.`} />
        <HairlineGrid cols={3}>
          {estrategicos.map((m) => (
            <HairlineCell key={m.label} className="gap-3">
              <p className="t-label text-subtle">{m.label}</p>
              <Figure figura={m.fig} />
              <div className="min-h-[1.125rem]">{m.delta && <Delta v={m.delta} sufixo="vs. mês anterior" />}</div>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>

      {/* ── NÍVEL 3 · TENDÊNCIA ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader title="Qual a evolução" sub="TPV e faturamento nos períodos com lançamento." />
        <Panel>
          {temHistorico
            ? <ConselhoEvolucao dados={evolucao} />
            : <EmptyState title="Sem série histórica"
                description="A evolução aparece assim que houver ao menos dois meses com lançamento diário." />}
        </Panel>
      </section>

      {/* ── NÍVEL 4 · COMPOSIÇÃO ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader
          title="Onde está a receita"
          sub={maiorLinha
            ? `${maiorLinha[0]} concentra ${((maiorLinha[1] / receita!.total) * 100).toFixed(1)}% do faturamento do período.`
            : 'A soma das cinco linhas é o faturamento do período.'}
        />
        {!receita ? (
          <Panel padded={false}>
            <EmptyState title="Sem dados no período" description="Nenhuma linha de receita apurada para este mês." />
          </Panel>
        ) : (
          <>
            {/* Barra de composição: proporção antes do detalhe. */}
            {receita.total > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden gap-px bg-line" role="img"
                aria-label="Composição proporcional da receita">
                {linhas.map(([label, valor], i) => (
                  <span key={label} title={`${label}: ${moedaCheia(valor)}`}
                    className="transition-opacity duration-[380ms] hover:opacity-80"
                    style={{
                      width: `${Math.max((valor / receita.total) * 100, 0)}%`,
                      background: `color-mix(in srgb, var(--color-accent) ${100 - i * 17}%, transparent)`,
                    }} />
                ))}
              </div>
            )}
            <HairlineGrid cols={5}>
              {linhas.map(([label, valor]) => (
                <HairlineCell key={label} className="gap-2.5">
                  <p className="t-label text-subtle">{label}</p>
                  <Figure figura={figuraMoeda(valor)} size="sm" />
                  <p className="t-mono text-muted">
                    {receita.total > 0 ? `${((valor / receita.total) * 100).toFixed(1)}%` : '—'}
                  </p>
                </HairlineCell>
              ))}
            </HairlineGrid>
            <Panel className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="t-label text-subtle">Faturamento total do período</span>
              <Figure figura={figuraMoeda(receita.total)} />
            </Panel>
          </>
        )}
      </section>

      {/* ── NÍVEL 5 · DETALHE DA CARTEIRA ────────────────────────────────── */}
      <section className="space-y-4">
        <PanelHeader title="Carteira" sub="Contas ativas por modelo operacional." />
        <HairlineGrid cols={3}>
          {carteira.map((c) => (
            <HairlineCell key={c.label} className="gap-2.5">
              <p className="t-label text-subtle">{c.label}</p>
              <Figure figura={figuraContagem(c.v)} size="sm" />
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>
    </div>
  )
}
