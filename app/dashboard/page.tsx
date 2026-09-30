export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, metasDoPeriodo, indicadoresEstrutura,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import { formatMesRef, META_TIPO_LABELS } from '@/lib/utils'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem, variacao,
} from '@/lib/format-financeiro'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import PageHeader from '@/components/dashboard/PageHeader'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile, { MetaBar } from '@/components/ui/StatTile'
import Panel from '@/components/ui/Panel'
import { PanelHeader } from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState, { NoData } from '@/components/ui/EmptyState'
import Figure from '@/components/ui/Figure'

/**
 * A meta é formatada pela sua UNIDADE, não pelo tipo: é o que permite uma meta
 * percentual (MED = 2%) conviver com uma monetária (TPV) na mesma faixa.
 */
function formatarMeta(unidade: 'VALOR' | 'QUANTIDADE' | 'PERCENTUAL', valor: number) {
  if (unidade === 'PERCENTUAL') return figuraPercentual(valor, 2)
  if (unidade === 'QUANTIDADE') return figuraQuantidade(valor)
  return figuraMoeda(valor)
}

export default async function DashboardPage() {
  const session = await getSession()
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(12)

  const [kpis, metas, estrutura, serie] = await Promise.all([
    kpisDoPeriodo(periodo),
    metasDoPeriodo(periodo),
    indicadoresEstrutura(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  /** Mês anterior com dado — base honesta para variação. Nada é extrapolado. */
  const anterior = [...serie].slice(0, -1).reverse().find((k) => k.temDados) ?? null
  const spark = (pick: (k: KpisPeriodo) => number | null) => serie.map((k) => pick(k) ?? 0)
  const varDe = (pick: (k: KpisPeriodo) => number | null) =>
    anterior ? variacao(pick(kpis), pick(anterior)) : null

  /**
   * NÍVEL 1 — o resultado do mês.
   *
   * O indicador de Float saiu do Cockpit: sobrou "Saldo médio em conta", que é
   * o número que a operação confere. O Float continua sendo calculado e segue
   * como linha de receita no Conselho — só não é mais um KPI aqui.
   */
  const principais = [
    { label: 'Receita', fig: kpis.receitaTarifaria === null ? null : figuraMoeda(kpis.receitaTarifaria),
      primary: true, delta: varDe((k) => k.receitaTarifaria), spark: spark((k) => k.receitaTarifaria),
      note: 'Receita tarifária do lançamento diário' },
    { label: 'TPV geral', fig: kpis.tpv === null ? null : figuraMoeda(kpis.tpv),
      delta: varDe((k) => k.tpv), spark: spark((k) => k.tpv), note: 'Lançamento diário' },
    { label: 'Transações', fig: kpis.qtdTransacoes === null ? null : figuraQuantidade(kpis.qtdTransacoes),
      delta: varDe((k) => k.qtdTransacoes), spark: spark((k) => k.qtdTransacoes),
      note: `Mês vigente · ${formatMesRef(periodo)}` },
    { label: 'Saldo médio em conta', fig: kpis.saldoMedio === null ? null : figuraMoeda(kpis.saldoMedio),
      delta: varDe((k) => k.saldoMedio), spark: spark((k) => k.saldoMedio), note: 'Média do período' },
  ]

  /**
   * NÍVEL 2 — qualificadores do mesmo dado.
   *
   * "Faturamento" e a composição da receita saíram do Cockpit: os dois
   * exibiam o Float, que não é mais mostrado aqui. Ambos continuam no
   * Conselho, onde o Float segue como linha de receita.
   */
  const qualificadores = [
    { label: 'MED', fig: kpis.qtdMed === null ? null : figuraQuantidade(kpis.qtdMed),
      delta: varDe((k) => k.qtdMed),
      note: kpis.percentMed === null ? undefined : `${figuraPercentual(kpis.percentMed, 2).completo} das transações` },
    { label: 'Take Rate', fig: kpis.takeRate === null ? null : figuraPercentual(kpis.takeRate, 3),
      delta: varDe((k) => k.takeRate), note: 'Receita ÷ TPV' },
  ]

  /**
   * NÍVEL 3 — estrutura do negócio. Cada um vem de onde é lançado:
   * clientes ativos do Lançamento Diário; BaaS e White Labels das Condições
   * Comerciais BaaS. É a mesma fonte usada pelo Conselho e pelo Financeiro.
   */
  const estruturais = [
    { label: 'Clientes ativos', fig: estrutura.clientesAtivos === null ? null : figuraContagem(estrutura.clientesAtivos),
      note: 'Lançamento diário · fotografia do último dia informado' },
    { label: 'BaaS ativos', fig: figuraContagem(estrutura.baasAtivos),
      note: 'Condições Comerciais BaaS' },
    { label: 'White Labels ativos', fig: figuraContagem(estrutura.whiteLabelsAtivos),
      note: 'Condições Comerciais BaaS' },
  ]

  // Só séries com FONTE REAL. O Float saiu do Cockpit, e "previsto" não existe
  // em lugar nenhum do sistema — um gráfico de previsto × realizado seria uma
  // barra zerada ao lado da série verdadeira.
  const chartData = periodos.map((p, i) => {
    const k: KpisPeriodo = serie[i]
    return {
      mes: p,
      receitaTarifaria: k.receitaTarifaria ?? 0,
      tpv: k.tpv ?? 0,
      takeRate: k.takeRate ?? 0,
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

      <HairlineGrid cols={4}>
        {principais.map((c) => (
          <StatTile key={c.label} label={c.label} figura={c.fig} delta={c.delta}
            note={c.note} primary={c.primary} spark={c.spark} />
        ))}
      </HairlineGrid>

      <HairlineGrid cols={2}>
        {qualificadores.map((c) => (
          <StatTile key={c.label} label={c.label} figura={c.fig} delta={c.delta} note={c.note} size="sm" />
        ))}
      </HairlineGrid>

      <section className="space-y-4">
        <PanelHeader
          title="Estrutura da carteira"
          sub="Clientes ativos vêm do lançamento diário; BaaS e White Labels, das condições comerciais."
        />
        <HairlineGrid cols={3}>
          {estruturais.map((c) => (
            <StatTile key={c.label} label={c.label} figura={c.fig} note={c.note} size="sm" />
          ))}
        </HairlineGrid>
      </section>

      {metas.length > 0 && (
        <section className="space-y-4">
          {/* A meta é o esperado; o realizado vem do lançamento diário. Nenhum
              dos dois é digitado nesta tela. */}
          <PanelHeader title="Meta × Realizado" sub={`${formatMesRef(periodo)} · realizado apurado do lançamento diário`} />
          <HairlineGrid cols={5}>
            {metas.map((m) => {
              const rotulo = META_TIPO_LABELS[m.tipo] ?? m.tipo
              return (
                <HairlineCell key={m.tipo} className="gap-2.5">
                  <p className="t-label text-subtle bp-truncate" title={rotulo}>{rotulo}</p>
                  {m.realizado === null
                    ? <NoData />
                    : <Figure figura={formatarMeta(m.unidade, m.realizado)} size="sm" />}
                  <p className="t-sm text-subtle">
                    meta {formatarMeta(m.unidade, m.meta).completo}
                    {m.direcao === 'MENOR_MELHOR' && <span className="text-subtle/70"> · menor é melhor</span>}
                  </p>
                  <div className="mt-auto pt-2 space-y-2">
                    {/* A barra mostra CUMPRIMENTO, que já respeita a direção da
                        meta: 100% é "no alvo" tanto para TPV quanto para MED. */}
                    <MetaBar pct={m.atingimento} />
                    <p className={
                      m.situacao === 'SEM_REALIZADO' ? 't-mono text-subtle'
                        : m.positivo ? 't-mono text-pos'
                        : (m.atingimento ?? 0) >= 70 ? 't-mono text-warn' : 't-mono text-neg'
                    }>
                      {m.atingimento === null ? '—' : `${m.atingimento.toFixed(0)}% de cumprimento`}
                    </p>
                  </div>
                </HairlineCell>
              )
            })}
          </HairlineGrid>
        </section>
      )}

      <DashboardCharts
        chartData={chartData}
        mrrEvolution={periodos.map((p) => ({ mes: p, mrr: estrutura.mrr.total }))}
      />
    </div>
  )
}
