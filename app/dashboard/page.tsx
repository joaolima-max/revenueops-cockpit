export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, indicadoresEstrutura, seriesCockpit,
  comparacaoMensal, rotuloComparacao,
  periodoAtual, ultimosPeriodos, type KpisPeriodo,
} from '@/lib/kpi'
import { formatMesRef } from '@/lib/utils'
import {
  figuraMoeda, figuraQuantidade, figuraPercentual, figuraContagem, variacao,
} from '@/lib/format-financeiro'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
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

  /**
   * METAS SAÍRAM DO COCKPIT.
   *
   * `metasDoPeriodo` não é mais consultada aqui, e com ela saíram o
   * acompanhamento, o pacing e o projetado × realizado. Metas vivem em
   * Metas — um painel dedicado, onde se cria, edita e acompanha. Tê-las
   * também no Cockpit significava duas telas respondendo à mesma pergunta e
   * um executivo conferindo de memória se os dois números batiam.
   *
   * O Cockpit voltou a ser o que ele é: o que aconteceu, e como evoluiu.
   */
  const [estrutura, serie, series] = await Promise.all([
    indicadoresEstrutura(periodo),
    // Os 12 meses alimentam as SPARKLINES dos KPIs e a base comparável. Não
    // alimentam mais os gráficos: eles têm janela própria (ver `series`).
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
    /**
     * AS SÉRIES DOS GRÁFICOS, na janela PADRÃO.
     *
     * Renderizadas no servidor para que a primeira pintura já tenha dado — sem
     * isto, os doze gráficos abririam vazios e preencheriam depois, o que no
     * Cockpit lê como "o sistema não tem dado".
     *
     * A troca de janela acontece no cliente, por `/api/dashboard/series`, que
     * chama ESTA MESMA função. Duas montagens do payload é como a tela passa a
     * mostrar um número diferente depois do clique.
     */
    seriesCockpit(),
  ])

  /**
   * COMPARAÇÃO EQUIVALENTE — a correção das setas.
   *
   * O mês corrente está sempre pela metade, e comparar o seu acumulado parcial
   * com o mês anterior INTEIRO fazia toda seta ficar vermelha no começo de
   * cada mês: no dia 7, 7 dias eram medidos contra 30. Agora os dois lados
   * usam a MESMA janela de dias — 01–07 contra 01–07 —, e `kpis` é a apuração
   * truncada nessa janela.
   *
   * A regra mora em `comparacaoMensal` (lib/kpi), e o Conselho chama a mesma
   * função: duas telas calculando a própria base comparável é como elas
   * passam a discordar.
   */
  const comparacao = await comparacaoMensal(periodo, serie)
  const kpis = comparacao.atual
  const anterior = comparacao.anterior

  /**
   * A SPARKLINE usa a série de meses INTEIROS, de propósito.
   *
   * Ela é a trajetória histórica, e truncar cada mês no dia de hoje
   * reescreveria doze meses fechados para caber numa janela que só se aplica
   * ao corrente. A última barra fica mais baixa que as outras porque o mês
   * ainda não acabou — e isso é verdade, não distorção.
   */
  const spark = (pick: (k: KpisPeriodo) => number | null) => serie.map((k) => pick(k) ?? 0)
  const varDe = (pick: (k: KpisPeriodo) => number | null) =>
    anterior ? variacao(pick(kpis), pick(anterior)) : null

  /** O que a comparação está medindo, escrito. */
  const notaComparacao = rotuloComparacao(comparacao)

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
      note: comparacao.emCurso && comparacao.ateDia !== null
        ? `${formatMesRef(periodo)} · até o dia ${String(comparacao.ateDia).padStart(2, '0')}`
        : `Mês vigente · ${formatMesRef(periodo)}` },
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

      {/* A JANELA DA COMPARAÇÃO, DECLARADA.
          As setas comparam janelas EQUIVALENTES — 01–07 contra 01–07 do mês
          anterior —, e não o mês parcial contra o mês anterior inteiro, que
          era o que fazia toda seta ficar vermelha no começo do mês. Sem esta
          linha, "+33,3%" é um número sem referência, e foi justamente a
          ausência de referência que deixou o defeito anterior invisível. */}
      {anterior && (
        <p className="t-sm text-subtle -mt-2">
          Variações comparam {notaComparacao}
          {comparacao.ateDia !== null && (
            <> — o mês corrente está em curso, e a janela é a mesma nos dois lados</>
          )}.
        </p>
      )}

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

      {/* OS GRÁFICOS TÊM JANELA PRÓPRIA, de 7, 30 ou 90 dias, cada um a sua.
          O payload inicial é a janela padrão, já apurada no servidor; a troca
          busca em `/api/dashboard/series`, que usa a mesma função. */}
      <DashboardCharts series={series} />
    </div>
  )
}
