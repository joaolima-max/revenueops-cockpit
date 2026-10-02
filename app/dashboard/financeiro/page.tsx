export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { visaoGeralFinanceiro } from '@/lib/financeiro'
import { periodoAtual, ultimosPeriodos } from '@/lib/periodo'
import { formatMesRef } from '@/lib/utils'
import { figuraMoeda, figuraPercentual, moedaCheia } from '@/lib/format-financeiro'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Figure from '@/components/ui/Figure'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { Donut, EvolucaoFinanceira, type Fatia } from '@/components/financeiro/FinanceiroCharts'

/**
 * VISÃO GERAL FINANCEIRA — predominantemente visual.
 *
 * Os KPIs de contagem "BaaS ativos" e "White Labels ativos" saíram desta tela.
 * Eles continuam no Cockpit e no Conselho, de onde respondem à pergunta
 * "quantos parceiros temos"; aqui a pergunta é "quanto entra, quanto sai e de
 * onde" — e uma contagem de parceiros no meio dos números de caixa só
 * competia por atenção.
 *
 * Todo gráfico desta tela tem FONTE REAL: lançamentos financeiros, condições
 * comerciais vigentes e títulos a receber. Nenhum deles é uma projeção.
 */
export default async function FinanceiroVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const params = await searchParams
  const periodo = /^\d{4}-\d{2}$/.test(params.periodo ?? '') ? params.periodo! : periodoAtual()

  const visao = await visaoGeralFinanceiro(periodo, ultimosPeriodos(12))
  const {
    mrr, arr, resultado, inadimplencia, gastoPorCategoria,
    receitaPorBaas, receitaPorWhiteLabel, porNatureza, evolucao, contasAPagar,
  } = visao

  /**
   * As parcelas do MRR, abertas. A tela mostra de onde vem cada real porque
   * MRR é o número que mais gera dúvida em reunião — e a dúvida é sempre
   * "isso aí está contando o quê?".
   */
  const parcelasMrr = [
    { label: 'Sustentação BaaS', valor: mrr.sustentacaoBaas, fonte: 'Condições Comerciais · tipo BaaS' },
    { label: 'Sustentação White Label', valor: mrr.sustentacaoWhiteLabel, fonte: 'Condições Comerciais · tipo White Label' },
    { label: 'Mensalidades de API BaaS + WL', valor: mrr.apiMensalParceiros, fonte: 'Condições BaaS · API mensal' },
    { label: 'Mensalidades de API da carteira', valor: mrr.apiMensalCarteira, fonte: 'Clientes ativos · mensalidade de API' },
  ]

  /**
   * Fora do total, e dito em voz alta.
   *
   * Conta ativa saiu do MRR porque a quantidade de contas oscila com a
   * operação do parceiro: o recorrente subia e descia sem nenhum contrato ter
   * mudado. Omitir a linha faria o leitor somar as parcelas, achar diferença
   * e desconfiar do total — então ela aparece marcada como excluída.
   */
  const foraDoMrr = mrr.mensalidadeContaAtiva

  const paraFatia = (
    lista: Array<{ id: string; nomeFantasia: string; identificacao: string; total: number; lancamentos: number; lancado: number }>,
  ): Fatia[] =>
    lista.map((w) => ({
      id: w.id,
      nome: w.nomeFantasia,
      valor: w.total,
      nota: w.lancamentos > 0
        ? `${w.identificacao} · ${w.lancamentos} lançamento${w.lancamentos === 1 ? '' : 's'} (${figuraMoeda(w.lancado).completo})`
        : `${w.identificacao} · recorrente do cadastro`,
    }))

  const naturezas: Fatia[] = [
    { id: 'float', nome: 'Float', valor: porNatureza.FLOAT },
    { id: 'setup', nome: 'Setup', valor: porNatureza.SETUP },
    { id: 'sustentacao', nome: 'Sustentação', valor: porNatureza.SUSTENTACAO },
  ]
  const temNatureza = naturezas.some((n) => n.valor > 0)

  const vazio = mrr.total === 0 && resultado.receita === 0 && resultado.despesa === 0

  return (
    <div className="space-y-8">
      <PageHeader title="Financeiro" sub={`Visão geral · ${formatMesRef(periodo)}`} />

      {/* Recorrência: o que entra todo mês independentemente de operação. */}
      <HairlineGrid cols={2}>
        <StatTile label="MRR" figura={figuraMoeda(mrr.total)} primary
          note="Receita recorrente mensal · condições vigentes" />
        <StatTile label="ARR" figura={figuraMoeda(arr)} note="MRR × 12" />
      </HairlineGrid>

      {mrr.sustentacaoAguardandoInicio > 0 && (
        <Badge tone="warn">
          {figuraMoeda(mrr.sustentacaoAguardandoInicio).completo} de sustentação fora do MRR —
          a data de início ainda não chegou
        </Badge>
      )}

      {/* Caixa do mês: RECEITAS | DESPESAS | INADIMPLÊNCIA | RESULTADO.
          O Resultado fica à DIREITA porque é a conclusão da linha — as três
          parcelas que o explicam vêm antes dele, na ordem em que se leem. */}
      <HairlineGrid cols={4}>
        <StatTile label="Receitas" figura={figuraMoeda(resultado.receita)}
          note="Lançamentos do período, tarifas BaaS incluídas" />
        <StatTile label="Despesas" figura={figuraMoeda(resultado.despesa)}
          note="Lançamentos do período, sem repasse a BaaS" />
        <StatTile label="Inadimplência"
          figura={figuraMoeda(inadimplencia.valor)}
          note={
            inadimplencia.percentual === null
              ? `${inadimplencia.titulos} título${inadimplencia.titulos === 1 ? '' : 's'}`
              : `${figuraPercentual(inadimplencia.percentual, 1).completo} do faturado · ${inadimplencia.titulos} título${inadimplencia.titulos === 1 ? '' : 's'}`
          } />
        {/* A REGRA CONTÁBIL FICA ESCRITA, não implícita.
            O repasse ao parceiro existe como despesa em Contas a Pagar — é
            assim que ele é pago —, mas não reduz o Resultado: o saldo da
            conta do BaaS nunca foi receita nossa, e devolvê-lo não é custo.
            Sem a frase, quem somasse Contas a Pagar à mão encontraria uma
            diferença e concluiria que o painel está errado. */}
        <StatTile label="Resultado" figura={figuraMoeda(resultado.resultado)} primary
          note="Receitas − Despesas" />
      </HairlineGrid>

      <p className="t-sm text-subtle -mt-2">
        Pagamentos para os BaaS não são contabilizados como despesas.
        {resultado.repasseBaas > 0 && (
          <> No período, {moedaCheia(resultado.repasseBaas)} de repasse ficaram fora
          do Resultado — o valor continua em Contas a Pagar, para pagamento.</>
        )}
      </p>

      {/* Evolução temporal — a série que responde "como chegamos aqui". */}
      <Panel>
        <PanelHeader
          title="Evolução"
          sub="Receita, despesa e resultado nos últimos 12 meses. Mesma base da tela de Lançamentos."
        />
        <div className="mt-5">
          <EvolucaoFinanceira pontos={evolucao} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gasto por categoria — pizza/donut. */}
        <Panel>
          <PanelHeader title="Gasto por categoria" sub={formatMesRef(periodo)} />
          <div className="mt-5">
            <Donut
              rotuloTotal="Despesa"
              formatar={moedaCheia}
              fatias={gastoPorCategoria.map((g) => ({
                id: g.categoriaId, nome: g.nome, valor: g.total,
              }))}
            />
          </div>
        </Panel>

        {/* Float / Setup / Sustentação — a categoria do lançamento é a fonte. */}
        <Panel>
          <PanelHeader
            title="Float, Setup e Sustentação"
            sub="Receita lançada nestas três categorias no período."
          />
          <div className="mt-5">
            {temNatureza ? (
              <Donut rotuloTotal="Receita" formatar={moedaCheia} fatias={naturezas} />
            ) : (
              <div className="min-h-[13rem] flex items-center justify-center">
                <EmptyState compact
                  title="Nada lançado nestas categorias"
                  description="Classifique um lançamento de receita como Float, Setup ou Sustentação para a distribuição aparecer." />
              </div>
            )}
          </div>
        </Panel>

        {/* Receita por BaaS — circular, rastreável aos lançamentos. */}
        <Panel>
          <PanelHeader
            title="Receita por BaaS"
            sub="Lançamentos vinculados ao parceiro + mensalidades do cadastro não lançadas."
          />
          <div className="mt-5">
            {receitaPorBaas.length === 0 ? (
              <div className="min-h-[13rem] flex items-center justify-center">
                <EmptyState compact title="Nenhum BaaS ativo"
                  description="Cadastre em Condições BaaS." />
              </div>
            ) : (
              <Donut rotuloTotal="Receita BaaS" formatar={moedaCheia} fatias={paraFatia(receitaPorBaas)} />
            )}
          </div>
        </Panel>

        {/* Receita por White Label — mesmo tratamento. */}
        <Panel>
          <PanelHeader
            title="Receita por White Label"
            sub="Lançamentos vinculados ao parceiro + mensalidades do cadastro não lançadas."
          />
          <div className="mt-5">
            {receitaPorWhiteLabel.length === 0 ? (
              <div className="min-h-[13rem] flex items-center justify-center">
                <EmptyState compact title="Nenhum White Label ativo"
                  description="Cadastre em Condições BaaS." />
              </div>
            ) : (
              <Donut rotuloTotal="Receita WL" formatar={moedaCheia} fatias={paraFatia(receitaPorWhiteLabel)} />
            )}
          </div>
        </Panel>
      </div>

      {/* Composição do MRR. */}
      <section className="space-y-4">
        <PanelHeader
          title="Composição do MRR"
          sub="MRR = Mensalidades + Sustentação. É métrica de RECORRÊNCIA, não receita realizada: as mensalidades já estão embutidas na tarifa transacional e não se somam a ela."
        />
        <HairlineGrid cols={4}>
          {parcelasMrr.map((p) => (
            <HairlineCell key={p.label} className="gap-2.5">
              <p className="t-label text-subtle">{p.label}</p>
              <Figure figura={figuraMoeda(p.valor)} size="sm" />
              <p className="t-mono text-muted">
                {mrr.total > 0 ? `${((p.valor / mrr.total) * 100).toFixed(1)}% do MRR` : '—'}
              </p>
              <p className="t-label text-subtle/70">{p.fonte}</p>
            </HairlineCell>
          ))}
        </HairlineGrid>

        {/* A parcela que saiu, dita em voz alta — senão quem soma as quatro
            acima e compara com um MRR antigo acha que falta dinheiro. */}
        {foraDoMrr > 0 && (
          <p className="t-sm text-subtle">
            Fora do MRR: <span className="tabular-nums text-fg">{moedaCheia(foraDoMrr)}</span>{' '}
            de mensalidade de conta ativa. A quantidade de contas oscila com a operação do
            parceiro, então ela não entra no recorrente — o dado continua no cadastro em
            Condições BaaS.
          </p>
        )}

        {/* RECEITA REALIZADA × MRR são coisas diferentes, e confundi-las é o
            erro que esta nota existe para impedir: somar o MRR à receita do
            período contaria as mensalidades duas vezes, porque elas já estão
            dentro da tarifa transacional. */}
        <p className="t-sm text-subtle">
          <span className="text-fg">MRR não se soma à receita realizada.</span>{' '}
          As mensalidades de API são apuradas junto com a tarifa transacional, então
          já estão contadas em Receitas acima. O MRR mede a recorrência contratada —
          é referência, não uma segunda entrada de caixa.
        </p>
      </section>

      {/* Contas a Pagar — resumo, com a tela completa a um clique. */}
      <section className="space-y-4">
        <PanelHeader
          title="Contas a pagar do período"
          sub="Despesas vistas pela data de vencimento."
          actions={
            <Link href="/dashboard/financeiro/contas-pagar"
              className="t-sm text-accent-soft hover:underline">Abrir Contas a Pagar →</Link>
          }
        />
        <HairlineGrid cols={4}>
          <StatTile label="Total" figura={figuraMoeda(contasAPagar.total)} size="sm"
            note={`${contasAPagar.titulos} título${contasAPagar.titulos === 1 ? '' : 's'}`} />
          <StatTile label="Vencidas" figura={figuraMoeda(contasAPagar.vencidas)} size="sm"
            note="Pendentes com vencimento passado" />
          <StatTile label="A vencer" figura={figuraMoeda(contasAPagar.aVencer)} size="sm"
            note="Pendentes ainda no prazo" />
          <StatTile label="Pagas" figura={figuraMoeda(contasAPagar.pagas)} size="sm"
            note="Baixadas no período" />
        </HairlineGrid>
      </section>

      <Panel>
        <PanelHeader title="Onde cada número é lançado" sub="Uma fonte por informação." />
        <ul className="mt-4 space-y-2 t-sm text-muted">
          <li>
            <Link href="/dashboard/financeiro/lancamentos" className="text-accent-soft hover:underline">Lançamentos</Link>
            {' '}— receita, despesa, resultado, Float, Setup, Sustentação e o vínculo com BaaS/White Label.
          </li>
          <li>
            <Link href="/dashboard/financeiro/condicoes-baas" className="text-accent-soft hover:underline">Condições BaaS</Link>
            {' '}— sustentação, API mensal, mensalidade de conta ativa e data de início da sustentação.
          </li>
          <li>
            <Link href="/dashboard/carteira" className="text-accent-soft hover:underline">Carteira</Link>
            {' '}— mensalidade de API dos clientes.
          </li>
          <li>
            <Link href="/dashboard/financeiro/contas-receber" className="text-accent-soft hover:underline">Contas a Receber</Link>
            {' '}— inadimplência.
          </li>
          <li>
            <Link href="/dashboard/financeiro/contas-pagar" className="text-accent-soft hover:underline">Contas a Pagar</Link>
            {' '}— os mesmos lançamentos de despesa, pela data de vencimento.
          </li>
        </ul>
      </Panel>

      {vazio && (
        <Panel padded={false}>
          <EmptyState
            title="Financeiro ainda sem dados"
            description="Cadastre categorias, registre lançamentos e as condições comerciais de BaaS e White Label para os indicadores começarem a responder."
            action={
              <Link href="/dashboard/financeiro/categorias"
                className="inline-flex items-center gap-2 px-4 py-2.5 bp-btn-primary rounded-lg text-[0.875rem] font-medium">
                Começar pelas categorias
              </Link>
            }
          />
        </Panel>
      )}
    </div>
  )
}
