export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, metasDoPeriodo, indicadoresEstrutura, observacoesDiarias,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import { evolucaoParceiros } from '@/lib/financeiro'
import { velas as velasDe } from '@/lib/candle'
import { formatMesRef } from '@/lib/utils'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem, variacao,
} from '@/lib/format-financeiro'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import MetaAnalytics from '@/components/dashboard/MetaAnalytics'
import { avaliarCompleto } from '@/lib/metas'
import PageHeader from '@/components/dashboard/PageHeader'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Panel from '@/components/ui/Panel'
import { PanelHeader } from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'

export default async function DashboardPage() {
  const session = await getSession()
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(12)

  const [kpis, metas, estrutura, serie, parceiros, diarias] = await Promise.all([
    kpisDoPeriodo(periodo),
    metasDoPeriodo(periodo),
    indicadoresEstrutura(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
    // Série de BaaS e White Labels ativos, RECONSTRUÍDA do histórico de
    // `ativo` das condições comerciais — não é o número de hoje repetido.
    evolucaoParceiros(periodos),
    // Observações DIÁRIAS: o insumo das velas. A série mensal já agregada não
    // permite montar OHLC — abertura, máxima e mínima somem na média.
    observacoesDiarias(periodos),
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
      note: 'Condições BaaS' },
    { label: 'White Labels ativos', fig: figuraContagem(estrutura.whiteLabelsAtivos),
      note: 'Condições BaaS' },
  ]

  /**
   * Só séries com FONTE REAL, todas do mesmo lançamento diário. O Float saiu
   * do Cockpit, e "previsto" não existe em lugar nenhum do sistema — um
   * gráfico de previsto × realizado seria uma barra zerada ao lado da série
   * verdadeira.
   *
   * `clientesAtivos` é FOTOGRAFIA: o valor do último dia do mês que informou o
   * número, nunca a soma dos dias (ver `clientesAtivosDoMes`). Meses sem
   * informação entram como zero no gráfico porque a série precisa de um ponto;
   * `hasSeries` garante que um período inteiro sem dado não desenhe nada.
   */
  const chartData = periodos.map((p, i) => {
    const k: KpisPeriodo = serie[i]
    return {
      mes: p,
      receitaTarifaria: k.receitaTarifaria ?? 0,
      tpv: k.tpv ?? 0,
      takeRate: k.takeRate ?? 0,
      qtdTransacoes: k.qtdTransacoes ?? 0,
      saldoMedio: k.saldoMedio ?? 0,
      qtdMed: k.qtdMed ?? 0,
      percentMed: k.percentMed ?? 0,
      clientesAtivos: k.clientesAtivos ?? 0,
      baasAtivos: parceiros[i]?.baasAtivos ?? 0,
      whiteLabelsAtivos: parceiros[i]?.whiteLabelsAtivos ?? 0,
    }
  })

  /**
   * VELAS MENSAIS, agregadas AQUI e não no navegador.
   *
   * Cada vela é formada pelas observações diárias daquele mês: abertura é o
   * primeiro dia, fechamento o último, máxima e mínima os extremos. Todo
   * número é um valor que foi efetivamente lançado em algum dia — a agregação
   * não inventa OHLC, ela o encontra.
   *
   * Dia sem lançamento é descartado, nunca lido como zero.
   */
  const velas = {
    tpv: velasDe(diarias.map((d) => ({ data: d.data, valor: d.tpv }))),
    receita: velasDe(diarias.map((d) => ({ data: d.data, valor: d.receitaTarifaria }))),
    transacoes: velasDe(diarias.map((d) => ({ data: d.data, valor: d.qtdTransacoes }))),
  }

  /**
   * Avaliação completa de cada meta — comparação, gap, cumprimento, direção e
   * ritmo. Uma única função produz tudo (lib/metas.ts), e é a MESMA que a tela
   * de Metas usa: os dois lugares não têm como discordar.
   */
  const avaliacoes = metas.map((m) => avaliarCompleto({
    tipo: m.tipo,
    periodo,
    meta: m.meta,
    realizado: m.realizado,
    direcao: m.direcao,
    unidade: m.unidade,
  }))

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

      <DashboardCharts
        chartData={chartData}
        mrrEvolution={periodos.map((p) => ({ mes: p, mrr: estrutura.mrr.total }))}
        velas={velas}
      />

      {/* ACOMPANHAMENTO DE METAS — depois dos gráficos, de propósito.
          A leitura do Cockpit é: o que aconteceu (KPIs), como evoluiu
          (gráficos) e só então o quanto disso estava no plano. Metas no topo
          invertiam a ordem: julgavam o número antes de o executivo tê-lo lido.
          Toda a matemática vem de `avaliarCompleto`. */}
      <MetaAnalytics avaliacoes={avaliacoes} periodoLabel={formatMesRef(periodo)} />
    </div>
  )
}
