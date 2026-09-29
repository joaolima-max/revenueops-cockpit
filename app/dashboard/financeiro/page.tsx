export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { visaoGeralFinanceiro } from '@/lib/financeiro'
import { periodoAtual } from '@/lib/periodo'
import { formatMesRef } from '@/lib/utils'
import { figuraMoeda, figuraPercentual, figuraContagem } from '@/lib/format-financeiro'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Figure from '@/components/ui/Figure'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'

export default async function FinanceiroVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const params = await searchParams
  const periodo = /^\d{4}-\d{2}$/.test(params.periodo ?? '') ? params.periodo! : periodoAtual()

  const visao = await visaoGeralFinanceiro(periodo)
  const { mrr, arr, resultado, inadimplencia, gastoPorCategoria, receitaPorWhiteLabel, parceiros } = visao

  /**
   * As quatro parcelas do MRR, abertas. A tela mostra de onde vem cada real
   * porque MRR é o número que mais gera dúvida em reunião — e a dúvida é
   * sempre "isso aí está contando o quê?".
   */
  const parcelasMrr = [
    { label: 'Sustentação BaaS', valor: mrr.sustentacaoBaas, fonte: 'Condições Comerciais BaaS · tipo BaaS' },
    { label: 'Sustentação White Label', valor: mrr.sustentacaoWhiteLabel, fonte: 'Condições Comerciais BaaS · tipo White Label' },
    { label: 'API mensal dos parceiros', valor: mrr.apiMensalParceiros, fonte: 'Condições Comerciais BaaS · API mensal' },
    { label: 'API mensal da carteira', valor: mrr.apiMensalCarteira, fonte: 'Clientes ativos · mensalidade de API' },
  ]

  const totalGasto = gastoPorCategoria.reduce((a, g) => a + g.total, 0)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Financeiro"
        sub={`Visão geral · ${formatMesRef(periodo)}`}
      />

      {/* Recorrência: o que entra todo mês independentemente de operação. */}
      <HairlineGrid cols={4}>
        <StatTile label="MRR" figura={figuraMoeda(mrr.total)} primary
          note="Receita recorrente mensal · condições vigentes" />
        <StatTile label="ARR" figura={figuraMoeda(arr)} note="MRR × 12" />
        <StatTile label="BaaS ativos" figura={figuraContagem(parceiros.baasAtivos)}
          note="Condições Comerciais BaaS" />
        <StatTile label="White Labels ativos" figura={figuraContagem(parceiros.whiteLabelsAtivos)}
          note="Condições Comerciais BaaS" />
      </HairlineGrid>

      {/* Caixa do mês. */}
      <HairlineGrid cols={4}>
        <StatTile label="Resultado"
          figura={figuraMoeda(resultado.resultado)}
          note="Receita − Despesa" />
        <StatTile label="Receita" figura={figuraMoeda(resultado.receita)} note="Lançamentos do período" />
        <StatTile label="Despesa" figura={figuraMoeda(resultado.despesa)} note="Lançamentos do período" />
        <StatTile label="Inadimplência"
          figura={figuraMoeda(inadimplencia.valor)}
          note={
            inadimplencia.percentual === null
              ? `${inadimplencia.titulos} título${inadimplencia.titulos === 1 ? '' : 's'}`
              : `${figuraPercentual(inadimplencia.percentual, 1).completo} do faturado · ${inadimplencia.titulos} título${inadimplencia.titulos === 1 ? '' : 's'}`
          } />
      </HairlineGrid>

      <section className="space-y-4">
        <PanelHeader
          title="Composição do MRR"
          sub="Cada parcela tem um campo de origem. Nenhuma mensalidade é contada duas vezes."
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
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel padded={false}>
          <div className="p-5 sm:p-6 pb-3">
            <PanelHeader title="Gasto por categoria" sub={formatMesRef(periodo)} />
          </div>
          {gastoPorCategoria.length === 0 ? (
            <EmptyState
              compact
              title="Nenhuma despesa no período"
              description="Lance despesas para ver a distribuição por categoria."
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {gastoPorCategoria.map((g) => (
                <li key={g.categoriaId} className="px-5 sm:px-6 py-3 flex items-center gap-4">
                  <span className="t-body text-fg flex-1 bp-truncate">{g.nome}</span>
                  <span className="t-mono text-subtle">
                    {totalGasto > 0 ? `${((g.total / totalGasto) * 100).toFixed(1)}%` : '—'}
                  </span>
                  <span className="t-body text-fg font-medium tabular-nums">
                    {figuraMoeda(g.total).completo}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel padded={false}>
          <div className="p-5 sm:p-6 pb-3">
            <PanelHeader
              title="Receita por White Label"
              sub="Sustentação + API mensal contratadas. Não existe TPV por parceiro."
            />
          </div>
          {receitaPorWhiteLabel.length === 0 ? (
            <EmptyState
              compact
              title="Nenhum White Label ativo"
              description="Cadastre em Condições Comerciais BaaS."
            />
          ) : (
            <TableShell className="border-0 rounded-none">
              <Table>
                <THead>
                  <HeadRow>
                    <Th className="pl-5">White Label</Th>
                    <Th align="right">Sustentação</Th>
                    <Th align="right">API mensal</Th>
                    <Th align="right">Total</Th>
                  </HeadRow>
                </THead>
                <tbody>
                  {receitaPorWhiteLabel.map((w) => (
                    <Row key={w.id}>
                      <Td className="pl-5">
                        <span className="block t-body text-fg">{w.nomeFantasia}</span>
                        <span className="block t-mono text-subtle mt-1">{w.identificacao}</span>
                      </Td>
                      <Td align="right" numeric>{figuraMoeda(w.sustentacao).completo}</Td>
                      <Td align="right" numeric>{figuraMoeda(w.apiMensal).completo}</Td>
                      <Td align="right" numeric className="text-fg font-medium">
                        {figuraMoeda(w.total).completo}
                      </Td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableShell>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Onde cada número é lançado" sub="Uma fonte por informação." />
        <ul className="mt-4 space-y-2 t-sm text-muted">
          <li>
            <Link href="/dashboard/financeiro/lancamentos" className="text-accent-soft hover:underline">Lançamentos</Link>
            {' '}— receita, despesa e resultado do período.
          </li>
          <li>
            <Link href="/dashboard/financeiro/condicoes-baas" className="text-accent-soft hover:underline">Condições Comerciais BaaS</Link>
            {' '}— sustentação, API mensal, BaaS e White Labels ativos.
          </li>
          <li>
            <Link href="/dashboard/carteira" className="text-accent-soft hover:underline">Carteira</Link>
            {' '}— mensalidade de API dos clientes.
          </li>
          <li>
            <Link href="/dashboard/financeiro/contas-receber" className="text-accent-soft hover:underline">Contas a Receber</Link>
            {' '}— inadimplência.
          </li>
        </ul>
      </Panel>

      {mrr.total === 0 && resultado.receita === 0 && resultado.despesa === 0 && (
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
