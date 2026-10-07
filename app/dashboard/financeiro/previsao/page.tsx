export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { formatMesRef } from '@/lib/utils'
import {
  visaoGeralPrevisao, opcoesDeFiltro, filtroDaPagina,
  JANELA_LABEL, type JanelaMeses,
} from '@/lib/previsao'
import { LIMIAR_ATENCAO } from '@/lib/previsao-calculo'
import {
  figuraMoeda, moedaCheia, percentual,
} from '@/lib/format-financeiro'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Badge from '@/components/ui/Badge'
import EmptyState, { Alert, NoData } from '@/components/ui/EmptyState'
import Figure from '@/components/ui/Figure'
import Button from '@/components/ui/Button'
import PrevisaoFiltros from '@/components/previsao/PrevisaoFiltros'
import VisaoGeralCharts from './VisaoGeralCharts'

/**
 * PREVISÃO › VISÃO GERAL — o painel de planejamento financeiro.
 *
 * ── AS PERGUNTAS QUE ESTA TELA RESPONDE, NA ORDEM EM QUE APARECEM ───────
 *
 *   1. quanto faturamos e gastamos no período, contra o que se esperava;
 *   2. qual o resultado, e quanto dele virou CAIXA;
 *   3. quanto falta do orçamento, e onde ele está apertando;
 *   4. qual a expectativa para os próximos meses.
 *
 * ── A HIERARQUIA DOS KPIs ───────────────────────────────────────────────
 *
 * Quatro na primeira linha, e só quatro. Doze indicadores lado a lado não são
 * um painel executivo: são uma tabela em forma de cartão, e o olho não
 * encontra onde começar. Os demais descem em níveis, cada um respondendo uma
 * pergunta do nível acima.
 *
 *   NÍVEL 1  o período       receita, despesa, resultado, caixa projetado
 *   NÍVEL 2  o plano         previsto de cada um, e o desvio do orçamento
 *   NÍVEL 3  o caixa         geração realizada × resultado contábil
 *   NÍVEL 4  o futuro        forecast de faturamento, despesa e caixa
 *
 * ── RESULTADO CONTÁBIL NÃO É GERAÇÃO DE CAIXA ───────────────────────────
 *
 * O nível 3 existe só para dizer isso em voz alta. Um mês pode ter resultado
 * positivo e caixa negativo — faturou e não recebeu, pagou o que devia do mês
 * anterior —, e a diferença entre os dois É o capital de giro do período. É a
 * pergunta que explica por que "demos lucro" e "não tem dinheiro na conta"
 * podem ser verdade ao mesmo tempo.
 */
export default async function PrevisaoVisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtro = filtroDaPagina(await searchParams)
  const [visao, opcoes] = await Promise.all([
    visaoGeralPrevisao(filtro),
    opcoesDeFiltro(),
  ])

  const { orcamento, caixa, forecast } = visao
  const janela = (visao.meses as JanelaMeses) ?? 1
  const rotuloJanela = JANELA_LABEL[janela] ?? 'Mês'

  /** O rótulo do intervalo: um mês, ou o primeiro ao último. */
  const intervalo = visao.periodos.length === 1
    ? formatMesRef(visao.periodos[0])
    : `${formatMesRef(visao.periodos[0])} – ${formatMesRef(visao.periodos[visao.periodos.length - 1])}`

  /** O último ponto da curva: o caixa que se espera ter no fim da janela. */
  const ultimoCaixa = caixa.pontos[caixa.pontos.length - 1] ?? null

  const receitaPrevista = visao.receita.reduce((a, r) => a + r.previsto, 0)
  const receitaRealizada = visao.receita.reduce((a, r) => a + r.realizado, 0)
  const despesaPrevista = visao.despesa.reduce((a, d) => a + d.previsto, 0)
  const despesaRealizada = visao.despesa.reduce((a, d) => a + d.realizado, 0)

  const resultadoRealizado = receitaRealizada - despesaRealizada
  const resultadoPrevisto = receitaPrevista - despesaPrevista

  /**
   * AS ÁREAS QUE EXIGEM ATENÇÃO — estouradas e perto do teto.
   *
   * Só DESPESA. Em receita, passar do orçado é bom, e alertar sobre isso
   * treinaria a pessoa a ignorar o bloco de alertas inteiro.
   */
  const alertas = orcamento.porCentroCusto
    .filter((l) => l.tipo === 'DESPESA'
      && (l.execucao.situacao === 'ESTOURADO' || l.execucao.situacao === 'ATENCAO'))
    .slice(0, 6)

  const semNada =
    receitaPrevista === 0 && receitaRealizada === 0
    && despesaPrevista === 0 && despesaRealizada === 0
    && orcamento.receita.orcado === 0 && orcamento.despesa.orcado === 0

  /* NÍVEL 1 — o período. Caixa projetado é o KPI primário: é a pergunta que
     o módulo existe para responder. */
  const nivel1 = [
    {
      label: 'Receita realizada',
      fig: figuraMoeda(receitaRealizada),
      note: receitaPrevista > 0
        ? `${percentual((receitaRealizada / receitaPrevista) * 100, 1)} do previsto`
        : 'Sem receita prevista no período',
    },
    {
      label: 'Despesa realizada',
      fig: figuraMoeda(despesaRealizada),
      note: despesaPrevista > 0
        ? `${percentual((despesaRealizada / despesaPrevista) * 100, 1)} do previsto`
        : 'Sem despesa prevista no período',
    },
    {
      label: 'Resultado realizado',
      fig: figuraMoeda(resultadoRealizado),
      note: 'Receita − despesa, por competência',
    },
    {
      label: 'Caixa projetado',
      fig: ultimoCaixa ? figuraMoeda(ultimoCaixa.saldoProjetado) : null,
      primary: true,
      note: ultimoCaixa ? `Esperado ao fim de ${intervalo}` : 'Sem movimento de caixa',
    },
  ]

  /* NÍVEL 2 — o plano. */
  const nivel2 = [
    { label: 'Receita prevista', fig: figuraMoeda(receitaPrevista), note: 'Previsão de faturamento' },
    { label: 'Despesa prevista', fig: figuraMoeda(despesaPrevista), note: 'Despesas futuras do período' },
    { label: 'Resultado previsto', fig: figuraMoeda(resultadoPrevisto), note: 'Receita − despesa previstas' },
    {
      label: 'Desvio de orçamento',
      fig: orcamento.despesa.orcado > 0 ? figuraMoeda(orcamento.despesa.desvio) : null,
      note: orcamento.despesa.utilizacao !== null
        ? `${percentual(orcamento.despesa.utilizacao, 1)} do orçado de despesa`
        : 'Nenhum orçamento de despesa aprovado',
    },
  ]

  /* NÍVEL 4 — o futuro. */
  const nivel4 = [
    {
      label: 'Forecast de faturamento',
      fig: forecast.receita ? figuraMoeda(forecast.receita.proximosMeses[0] ?? 0) : null,
      note: forecast.receita
        ? `Próximo mês · média de ${forecast.receita.mesesConsiderados} meses fechados`
        : forecast.motivo,
    },
    {
      label: 'Forecast de despesas',
      fig: forecast.despesa ? figuraMoeda(forecast.despesa.proximosMeses[0] ?? 0) : null,
      note: forecast.despesa ? 'Próximo mês' : forecast.motivo,
    },
    {
      label: 'Forecast de caixa',
      fig: forecast.caixa ? figuraMoeda(forecast.caixa.proximosMeses[0] ?? 0) : null,
      note: forecast.caixa ? 'Geração esperada no próximo mês' : forecast.motivo,
    },
  ]

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="t-sm text-subtle">Carregando filtros…</p>}>
        <PrevisaoFiltros opcoes={opcoes} />
      </Suspense>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="accent">{rotuloJanela}</Badge>
        <span className="t-sm text-subtle">{intervalo}</span>
      </div>

      {semNada ? (
        <Panel padded={false}>
          <EmptyState
            title="Nada previsto nem realizado neste período"
            description="A Previsão compara o que se espera com o que os lançamentos registram. Comece lançando um orçamento, uma receita prevista ou uma despesa futura."
            action={
              <span className="inline-flex gap-2 flex-wrap justify-center">
                <Link href="/dashboard/financeiro/previsao/orcamento">
                  <Button variant="primary">Lançar orçamento</Button>
                </Link>
                <Link href="/dashboard/financeiro/previsao/despesas">
                  <Button>Registrar despesa futura</Button>
                </Link>
              </span>
            }
          />
        </Panel>
      ) : (
        <>
          {/* ── NÍVEL 1 ─────────────────────────────────────────────────── */}
          <HairlineGrid cols={4}>
            {nivel1.map((c) => (
              <StatTile key={c.label} label={c.label} figura={c.fig}
                note={c.note} primary={c.primary} />
            ))}
          </HairlineGrid>

          {/* ── NÍVEL 2 ─────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <PanelHeader
              title="Previsto × orçado"
              sub="O previsto vem das previsões lançadas; o orçado, do teto aprovado. São coisas diferentes: a previsão é expectativa, o orçamento é decisão."
            />
            <HairlineGrid cols={4}>
              {nivel2.map((c) => (
                <StatTile key={c.label} label={c.label} figura={c.fig} note={c.note} size="sm" />
              ))}
            </HairlineGrid>
          </section>

          {/* ── NÍVEL 3 — a distinção que o painel precisa declarar ─────── */}
          <section className="space-y-4">
            <PanelHeader
              title="Resultado contábil × geração de caixa"
              sub="Não são a mesma coisa, e a diferença entre eles é o capital de giro do período."
            />
            <HairlineGrid cols={3}>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Resultado contábil</p>
                <Figure figura={figuraMoeda(caixa.contabilVsCaixa.resultadoContabil)} size="sm" />
                <p className="t-label text-subtle/70">
                  Competência — receita e despesa do período em que ocorreram
                </p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Geração de caixa</p>
                <Figure figura={figuraMoeda(caixa.contabilVsCaixa.geracaoCaixa)} size="sm" />
                <p className="t-label text-subtle/70">
                  Liquidação — o que entrou e o que saiu de fato
                </p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Diferença</p>
                <Figure figura={figuraMoeda(caixa.contabilVsCaixa.diferenca)} size="sm" />
                <p className="t-label text-subtle/70">
                  O que foi apurado e ainda não se moveu em caixa
                </p>
              </HairlineCell>
            </HairlineGrid>

            {(caixa.vencidoAReceber > 0 || caixa.vencidoAPagar > 0) && (
              <Alert tone="warn">
                Fora da projeção por não ter data esperada:{' '}
                {caixa.vencidoAReceber > 0 && (
                  <>{moedaCheia(caixa.vencidoAReceber)} a receber vencido</>
                )}
                {caixa.vencidoAReceber > 0 && caixa.vencidoAPagar > 0 && ' e '}
                {caixa.vencidoAPagar > 0 && (
                  <>{moedaCheia(caixa.vencidoAPagar)} a pagar vencido</>
                )}
                . Títulos vencidos não são atribuídos a nenhum mês futuro — o sistema
                não sabe quando serão liquidados, e inventar uma data produziria um
                caixa projetado que ninguém prometeu.
              </Alert>
            )}
          </section>

          {/* ── ALERTAS DE ORÇAMENTO ───────────────────────────────────── */}
          {alertas.length > 0 && (
            <section className="space-y-4">
              <PanelHeader
                title="Orçamento sob pressão"
                sub={`Centros de custo que passaram do teto ou chegaram a ${Math.round(LIMIAR_ATENCAO * 100)}% dele.`}
              />
              <div className="space-y-2">
                {alertas.map((l) => (
                  <Alert key={l.id} tone={l.execucao.situacao === 'ESTOURADO' ? 'error' : 'warn'}>
                    <span className="font-medium">{l.nome}</span>
                    {' — '}
                    {moedaCheia(l.execucao.realizado)} de {moedaCheia(l.execucao.orcado)}
                    {l.execucao.utilizacao !== null && (
                      <> ({percentual(l.execucao.utilizacao, 1)})</>
                    )}
                    {l.execucao.situacao === 'ESTOURADO'
                      ? <>. Estourou em {moedaCheia(l.execucao.desvio)}.</>
                      : <>. Restam {moedaCheia(l.execucao.saldo)}.</>}
                  </Alert>
                ))}
              </div>
            </section>
          )}

          {/* ── NÍVEL 4 ─────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <PanelHeader
              title="Forecast"
              sub={
                forecast.receita
                  ? `Média dos ${forecast.receita.mesesConsiderados} meses fechados com lançamento, mais a tendência. Projeção para ${forecast.mesesProjetados.map(formatMesRef).join(', ')}.`
                  : 'Projeção indisponível — ver o motivo em cada indicador.'
              }
            />
            <HairlineGrid cols={3}>
              {nivel4.map((c) => (
                <StatTile key={c.label} label={c.label} figura={c.fig} note={c.note} size="sm" />
              ))}
            </HairlineGrid>
          </section>

          {/* ── OS GRÁFICOS ────────────────────────────────────────────── */}
          <VisaoGeralCharts
            receita={visao.receita.map((r) => ({
              periodo: r.periodo, previsto: r.previsto,
              realizado: r.realizado, desvio: r.desvio,
            }))}
            despesa={visao.despesa.map((d) => ({
              periodo: d.periodo, previsto: d.previsto,
              realizado: d.realizado, desvio: d.desvio,
            }))}
            resultado={visao.periodos.map((p, i) => {
              const r = visao.receita[i]
              const d = visao.despesa[i]
              return {
                periodo: p,
                previsto: (r?.previsto ?? 0) - (d?.previsto ?? 0),
                realizado: (r?.realizado ?? 0) - (d?.realizado ?? 0),
                desvio: (r?.desvio ?? 0) - (d?.desvio ?? 0),
              }
            })}
            caixa={caixa.pontos.map((c) => ({
              periodo: c.periodo, fechado: c.fechado,
              saldoRealizado: c.saldoRealizado, saldoProjetado: c.saldoProjetado,
              geracaoRealizada: c.geracaoRealizada, geracaoProjetada: c.geracaoProjetada,
            }))}
            orcamentoPorCentro={orcamento.porCentroCusto
              .filter((l) => l.tipo === 'DESPESA')
              .map((l) => ({
                id: l.id, nome: l.nome,
                orcado: l.execucao.orcado, realizado: l.execucao.realizado,
              }))}
            despesaPorCategoria={visao.despesaPorCategoria.map((c) => ({
              id: c.id, nome: c.nome, valor: c.valor,
            }))}
            forecastReceita={serieForecast(
              visao.periodos, forecast.mesesProjetados,
              visao.receita.map((r) => r.realizado),
              forecast.receita?.proximosMeses ?? [],
            )}
            forecastCaixa={serieForecast(
              visao.periodos, forecast.mesesProjetados,
              caixa.pontos.map((c) => c.geracaoRealizada),
              forecast.caixa?.proximosMeses ?? [],
            )}
          />

          {/* O PERÍODO SEM ORÇAMENTO precisa ser declarado: sem a frase, o
              "0% utilizado" e o desvio vazio parecem defeito do painel. */}
          {orcamento.receita.orcado === 0 && orcamento.despesa.orcado === 0 && (
            <Panel>
              <p className="t-sm text-subtle">
                Nenhum orçamento <span className="text-fg">aprovado</span> para este
                período — os indicadores de orçado, saldo e % utilizado aparecem como{' '}
                <NoData />. Orçamento em rascunho não entra nos indicadores: um teto
                que ninguém aprovou não é um teto.{' '}
                <Link href="/dashboard/financeiro/previsao/orcamento"
                  className="text-accent-soft">Lançar orçamento</Link>.
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Costura o REALIZADO e o FORECAST numa linha do tempo só.
 *
 * Os meses históricos carregam `realizado` e `forecast: null`; os projetados, o
 * contrário. É o que faz a curva virar traço exatamente onde o dado acaba — e
 * esse ponto é a informação mais importante do gráfico (ver `ForecastChart`).
 */
function serieForecast(
  periodosHistoricos: string[],
  periodosProjetados: string[],
  realizados: number[],
  projetados: number[],
): Array<{ periodo: string; realizado: number | null; forecast: number | null }> {
  const historico = periodosHistoricos.map((p, i) => ({
    periodo: p,
    realizado: realizados[i] ?? 0,
    forecast: null,
  }))

  // A EMENDA: o último ponto histórico também recebe o valor de forecast, para
  // que a linha tracejada comece nele em vez de flutuar desconectada. Sem
  // isso, o traço aparece como um segmento solto à direita do gráfico.
  const ultimo = historico[historico.length - 1]
  if (ultimo && projetados.length > 0) {
    return [
      ...historico.slice(0, -1),
      { ...ultimo, forecast: ultimo.realizado },
      ...periodosProjetados.map((p, i) => ({
        periodo: p,
        realizado: null,
        forecast: projetados[i] ?? null,
      })),
    ]
  }

  return historico
}
