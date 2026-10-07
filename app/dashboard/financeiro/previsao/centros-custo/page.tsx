export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { formatMesRef } from '@/lib/utils'
import {
  detalhePorCentroCusto, opcoesDeFiltro, filtroDaPagina, periodosDaJanela,
} from '@/lib/previsao'
import { LIMIAR_ATENCAO } from '@/lib/previsao-calculo'
import { figuraMoeda, moedaCheia, percentual } from '@/lib/format-financeiro'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState, { NoData } from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'
import PrevisaoFiltros from '@/components/previsao/PrevisaoFiltros'
import CentrosCustoGrafico from './CentrosCustoGrafico'

/**
 * PREVISÃO › CENTROS DE CUSTO — a visão detalhada por área.
 *
 * ── ESTA TELA NÃO CADASTRA ──────────────────────────────────────────────
 *
 * O CADASTRO de centro de custo mora em Cadastros Financeiros, ao lado de
 * Categorias e Fornecedores — ele é insumo dos LANÇAMENTOS também, não só do
 * orçamento, e um cadastro escondido dentro do módulo de planejamento ficaria
 * longe de quem classifica a despesa do dia.
 *
 * Aqui é a ANÁLISE: orçado, realizado, desvio, % utilizado e forecast de cada
 * área. Duas telas, duas perguntas — "como se chama essa área?" e "quanto ela
 * está consumindo?".
 *
 * ── O FORECAST É POR ÁREA, NÃO RATEADO ──────────────────────────────────
 *
 * O forecast de cada centro de custo é a média dos meses fechados DELE. Ratear
 * o forecast global pelas áreas inventaria uma distribuição que ninguém
 * observou — e numa empresa real as áreas não crescem na mesma proporção.
 *
 * Área sem três meses fechados de histórico aparece com forecast vazio, não
 * com um número derivado do total.
 */
export default async function CentrosCustoPrevisaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtro = filtroDaPagina(await searchParams)
  const periodos = periodosDaJanela(filtro.periodo ?? mesCorrente(), filtro.meses ?? 1)

  const [detalhes, opcoes] = await Promise.all([
    detalhePorCentroCusto(filtro),
    opcoesDeFiltro(),
  ])

  const intervalo = periodos.length === 1
    ? formatMesRef(periodos[0])
    : `${formatMesRef(periodos[0])} – ${formatMesRef(periodos[periodos.length - 1])}`

  /** Só as áreas com algum movimento no período: uma área sem nada é ruído. */
  const comMovimento = detalhes.filter(
    (d) => d.despesa.orcado > 0 || d.despesa.realizado > 0
      || d.receita.orcado > 0 || d.receita.realizado > 0,
  )

  const orcadoTotal = comMovimento.reduce((a, d) => a + d.despesa.orcado, 0)
  const realizadoTotal = comMovimento.reduce((a, d) => a + d.despesa.realizado, 0)
  const utilizacaoTotal = orcadoTotal > 0 ? (realizadoTotal / orcadoTotal) * 100 : null

  /** A área que mais consome. Responde "quem está gastando" sem somar à mão. */
  const maior = [...comMovimento].sort(
    (a, b) => b.despesa.realizado - a.despesa.realizado,
  )[0] ?? null

  const tomDe = (situacao: string): BadgeTone =>
    situacao === 'ESTOURADO' ? 'neg'
      : situacao === 'ATENCAO' ? 'warn'
      : situacao === 'SEM_ORCAMENTO' ? 'neutral'
      : 'pos'

  const rotuloDe = (situacao: string): string =>
    situacao === 'ESTOURADO' ? 'Estourado'
      : situacao === 'ATENCAO' ? 'Atenção'
      : situacao === 'SEM_ORCAMENTO' ? 'Sem orçamento'
      : 'Dentro'

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="t-sm text-subtle">Carregando filtros…</p>}>
        <PrevisaoFiltros
          opcoes={opcoes}
          // SEM filtro de centro de custo: esta tela os LISTA todos, e filtrar
          // por um deixaria a tabela com uma linha.
          usa={['periodo', 'janela', 'categoria']}
        />
      </Suspense>

      <section className="space-y-4">
        <PanelHeader
          title="Consumo por área"
          sub={`${intervalo} · orçado, realizado e forecast de cada centro de custo.`}
        />
        <HairlineGrid cols={4}>
          <StatTile label="Orçado · despesa" figura={figuraMoeda(orcadoTotal)}
            note="Soma dos tetos aprovados das áreas" />
          <StatTile label="Realizado · despesa" figura={figuraMoeda(realizadoTotal)}
            note="Lançamentos atribuídos a um centro de custo" />
          <StatTile label="Utilização" primary
            figura={utilizacaoTotal === null ? null : {
              valor: utilizacaoTotal.toLocaleString('pt-BR', {
                minimumFractionDigits: 1, maximumFractionDigits: 1,
              }),
              unidade: '%', prefixo: '', completo: percentual(utilizacaoTotal, 1),
            }}
            note={orcadoTotal > 0 ? 'Realizado ÷ orçado' : 'Nenhum orçamento aprovado'} />
          <StatTile label="Maior consumo"
            valorTexto={maior ? maior.nome : undefined}
            figura={maior ? null : null}
            note={maior ? moedaCheia(maior.despesa.realizado) : 'Nenhuma despesa atribuída'} />
        </HairlineGrid>
      </section>

      {comMovimento.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhuma área com movimento no período"
            description="Centros de custo aparecem aqui quando têm orçamento aprovado ou lançamentos atribuídos. Um lançamento sem centro de custo continua somando no total do Financeiro, mas não é atribuído a nenhuma área."
            action={
              <Link href="/dashboard/financeiro/cadastros?aba=centros-custo">
                <Button>Ver os centros de custo cadastrados</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <>
          <Panel>
            <PanelHeader
              title="Orçado × realizado por área"
              sub="Vermelho marca o que passou do teto."
            />
            <div className="mt-5">
              <CentrosCustoGrafico
                barras={comMovimento.map((d) => ({
                  id: d.id, nome: d.nome,
                  orcado: d.despesa.orcado, realizado: d.despesa.realizado,
                }))}
              />
            </div>
          </Panel>

          <TableShell>
            <Table>
              <THead>
                <HeadRow>
                  <Th className="pl-5">Centro de custo</Th>
                  <Th align="right">Orçado</Th>
                  <Th align="right">Realizado</Th>
                  <Th align="right">Saldo</Th>
                  <Th align="right">Desvio</Th>
                  <Th align="right">Utilização</Th>
                  <Th align="right">Forecast mensal</Th>
                  <Th>Situação</Th>
                </HeadRow>
              </THead>
              <tbody>
                {comMovimento.map((d) => (
                  <Row key={d.id}>
                    <Td className="pl-5">
                      <span className={`block t-body font-medium ${d.ativo ? 'text-fg' : 'text-subtle'}`}>
                        {d.nome}
                      </span>
                      <span className="t-label text-subtle">
                        {d.codigo ?? ''}
                        {!d.ativo && (d.codigo ? ' · inativo' : 'inativo')}
                      </span>
                    </Td>
                    <Td align="right" numeric>{moedaCheia(d.despesa.orcado)}</Td>
                    <Td align="right" numeric>{moedaCheia(d.despesa.realizado)}</Td>
                    <Td align="right" numeric
                      className={d.despesa.saldo < 0 ? 'text-neg font-medium' : undefined}>
                      {moedaCheia(d.despesa.saldo)}
                    </Td>
                    <Td align="right" numeric className="text-muted">
                      {moedaCheia(d.despesa.desvio)}
                    </Td>
                    <Td align="right" numeric>
                      {d.despesa.utilizacao === null
                        ? <NoData label="—" />
                        : (
                          <span className={
                            d.despesa.situacao === 'ESTOURADO' ? 'text-neg font-medium'
                              : d.despesa.situacao === 'ATENCAO' ? 'text-warn font-medium'
                              : undefined
                          }>
                            {percentual(d.despesa.utilizacao, 1)}
                          </span>
                        )}
                    </Td>
                    {/* FORECAST POR ÁREA, nunca rateado do total. Vazio quando
                        a área não tem três meses fechados de histórico. */}
                    <Td align="right" numeric className="text-muted">
                      {d.forecastDespesa === null
                        ? <NoData label="sem histórico" />
                        : moedaCheia(d.forecastDespesa)}
                    </Td>
                    <Td>
                      <Badge tone={tomDe(d.despesa.situacao)}>
                        {rotuloDe(d.despesa.situacao)}
                      </Badge>
                    </Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableShell>

          <Panel>
            <p className="t-sm text-subtle">
              A situação fica em <span className="text-warn">atenção</span> a partir de{' '}
              {Math.round(LIMIAR_ATENCAO * 100)}% do orçado e{' '}
              <span className="text-neg">estourado</span> acima de 100%. O{' '}
              <span className="text-fg">forecast mensal</span> de cada área é a média dos
              meses fechados dela — não um rateio do forecast global, que inventaria uma
              distribuição que ninguém observou. Área com menos de três meses fechados
              aparece sem forecast.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}

function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}
