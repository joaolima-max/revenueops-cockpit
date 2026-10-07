export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { formatMesRef } from '@/lib/utils'
import {
  forecastPrevisao, realizadoPorPeriodo, opcoesDeFiltro, filtroDaPagina,
} from '@/lib/previsao'
import { MINIMO_MESES_FORECAST, type Forecast } from '@/lib/previsao-calculo'
import { figuraMoeda, moedaCheia, percentual } from '@/lib/format-financeiro'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Figure from '@/components/ui/Figure'
import Badge from '@/components/ui/Badge'
import EmptyState, { Alert, NoData } from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import PrevisaoFiltros from '@/components/previsao/PrevisaoFiltros'
import ForecastGraficos from './ForecastGraficos'

/**
 * PREVISÃO › FORECAST.
 *
 * ── O MODELO, E POR QUE É SIMPLES ───────────────────────────────────────
 *
 * Média dos meses FECHADOS mais uma tendência linear. Nada de sazonalidade,
 * amortecimento exponencial ou intervalo de confiança.
 *
 * A razão é de produto, não de preguiça: a prioridade é previsibilidade
 * operacional clara. Um modelo que ninguém do financeiro consegue reproduzir
 * numa planilha é um modelo cujo número ninguém defende numa reunião — e aí o
 * forecast deixa de ser usado. Esta conta se explica em duas frases e se
 * confere à mão: é `MÉDIA()` mais `INCLINAÇÃO()`.
 *
 * ── SÓ MESES FECHADOS ENTRAM NA BASE ────────────────────────────────────
 *
 * O mês em curso está pela metade e puxaria a média para baixo por construção
 * — o mesmo defeito que a comparação de KPI desta rodada corrige, e aqui seria
 * pior: contaminaria também a tendência e a projeção dos meses seguintes.
 *
 * A PROJEÇÃO do mês em curso é calculada à parte, pelo ritmo até agora, e
 * aparece como informação própria.
 *
 * ── SEM HISTÓRICO, SEM FORECAST ─────────────────────────────────────────
 *
 * Menos de três meses fechados com lançamento e a tela diz que falta
 * histórico. Projetar a partir de um ou dois pontos produziria um número com
 * cara de previsão e nenhum conteúdo — dois pontos definem uma reta perfeita e
 * não dizem nada sobre tendência.
 */
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtro = filtroDaPagina(await searchParams)

  /** Horizonte de 6 meses: o suficiente para um semestre de planejamento. */
  const HORIZONTE = 6
  const HISTORICO = 12

  const [forecast, opcoes] = await Promise.all([
    forecastPrevisao(filtro, HORIZONTE, HISTORICO),
    opcoesDeFiltro(),
  ])

  const serieHistorica = forecast.mesesBase.length > 0
    ? await realizadoPorPeriodo(forecast.mesesBase, filtro)
    : []

  const temForecast = !!forecast.receita

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="t-sm text-subtle">Carregando filtros…</p>}>
        <PrevisaoFiltros
          opcoes={opcoes}
          // SEM janela: o forecast tem a sua própria (12 meses de histórico, 6
          // de projeção). Oferecer "mês/trimestre/ano" aqui sugeriria que a
          // base muda, quando o que ela precisa é ser longa.
          usa={['centroCusto', 'categoria', 'parceiro']}
        />
      </Suspense>

      {!temForecast ? (
        <Panel padded={false}>
          <EmptyState
            title="Histórico insuficiente para projetar"
            description={
              `${forecast.motivo} São necessários pelo menos ${MINIMO_MESES_FORECAST} meses `
              + 'fechados com lançamento: dois pontos definem uma reta perfeita e não dizem '
              + 'nada sobre tendência. Projetar a partir deles produziria um número com cara '
              + 'de previsão e nenhum conteúdo.'
            }
            action={
              <Link href="/dashboard/financeiro/cp-cr/lancamentos">
                <Button>Ver os lançamentos</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <>
          <section className="space-y-4">
            <PanelHeader
              title="Projeção do próximo mês"
              sub={
                `Base: ${forecast.mesesBase.length} meses fechados `
                + `(${formatMesRef(forecast.mesesBase[0])} – `
                + `${formatMesRef(forecast.mesesBase[forecast.mesesBase.length - 1])}). `
                + `Projeção para ${formatMesRef(forecast.mesesProjetados[0])}.`
              }
            />
            <HairlineGrid cols={4}>
              <StatTile label="Forecast de faturamento"
                figura={figuraMoeda(forecast.receita!.proximosMeses[0] ?? 0)}
                note={`Média de ${moedaCheia(forecast.receita!.mediaHistorica)} + tendência`} />
              <StatTile label="Forecast de despesas"
                figura={forecast.despesa
                  ? figuraMoeda(forecast.despesa.proximosMeses[0] ?? 0) : null}
                note={forecast.despesa
                  ? `Média de ${moedaCheia(forecast.despesa.mediaHistorica)} + tendência`
                  : 'Sem histórico de despesa'} />
              <StatTile label="Forecast de resultado"
                figura={forecast.resultado
                  ? figuraMoeda(forecast.resultado.proximosMeses[0] ?? 0) : null}
                note="Receita projetada − despesa projetada" />
              <StatTile label="Forecast de caixa" primary
                figura={forecast.caixa
                  ? figuraMoeda(forecast.caixa.proximosMeses[0] ?? 0) : null}
                note="Geração esperada no próximo mês" />
            </HairlineGrid>
          </section>

          {/* ── A PROJEÇÃO DO MÊS EM CURSO ─────────────────────────────── */}
          {forecast.receita!.projecaoPeriodoAtual !== null && (
            <section className="space-y-4">
              <PanelHeader
                title="Mês em curso, pelo ritmo até agora"
                sub="O realizado parcial estendido ao mês inteiro. Não entra na base do forecast — um mês pela metade puxaria a média para baixo por construção."
              />
              <HairlineGrid cols={3}>
                <HairlineCell className="gap-2">
                  <p className="t-label text-subtle">Receita projetada</p>
                  <Figure figura={figuraMoeda(forecast.receita!.projecaoPeriodoAtual)} size="sm" />
                  <p className="t-label text-subtle/70">Realizado ÷ fração do mês decorrida</p>
                </HairlineCell>
                <HairlineCell className="gap-2">
                  <p className="t-label text-subtle">Despesa projetada</p>
                  <Figure
                    figura={forecast.despesa?.projecaoPeriodoAtual != null
                      ? figuraMoeda(forecast.despesa.projecaoPeriodoAtual) : null}
                    size="sm" />
                  <p className="t-label text-subtle/70">Mesmo ritmo</p>
                </HairlineCell>
                <HairlineCell className="gap-2">
                  <p className="t-label text-subtle">Resultado projetado</p>
                  <Figure
                    figura={forecast.resultado?.projecaoPeriodoAtual != null
                      ? figuraMoeda(forecast.resultado.projecaoPeriodoAtual) : null}
                    size="sm" />
                  <p className="t-label text-subtle/70">A diferença das duas projeções</p>
                </HairlineCell>
              </HairlineGrid>
            </section>
          )}

          {/* ── A TENDÊNCIA, DECLARADA ─────────────────────────────────── */}
          <section className="space-y-4">
            <PanelHeader
              title="Tendência"
              sub="Variação média por mês, pela reta que melhor passa pelos meses fechados."
            />
            <HairlineGrid cols={3}>
              {([
                ['Receita', forecast.receita],
                ['Despesa', forecast.despesa],
                ['Resultado', forecast.resultado],
              ] as Array<[string, Forecast | null]>).map(([nome, f]) => (
                <HairlineCell key={nome} className="gap-2">
                  <p className="t-label text-subtle">{nome}</p>
                  {f?.tendencia ? (
                    <>
                      <Figure figura={figuraMoeda(f.tendencia.porMes)} size="sm" />
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={
                          f.tendencia.direcao === 'alta' ? 'pos'
                            : f.tendencia.direcao === 'baixa' ? 'neg'
                            : 'neutral'
                        }>
                          {f.tendencia.direcao === 'alta' ? 'Em alta'
                            : f.tendencia.direcao === 'baixa' ? 'Em baixa'
                            : 'Estável'}
                        </Badge>
                        {f.tendencia.percentual !== null && (
                          <span className="t-label text-subtle">
                            {percentual(f.tendencia.percentual, 1)} da média/mês
                          </span>
                        )}
                      </span>
                    </>
                  ) : <NoData label="sem tendência apurável" />}
                </HairlineCell>
              ))}
            </HairlineGrid>

            <Alert tone="info">
              A tendência é a inclinação da reta de mínimos quadrados sobre os meses
              fechados — todos os pontos entram, então um mês fora da curva desloca o
              resultado em vez de determiná-lo. &quot;Último menos primeiro&quot; seria
              mais simples e deixaria um único mês atípico nas pontas definir a tendência
              inteira. Abaixo de 0,5% da média, a inclinação é tratada como{' '}
              <span className="font-medium">estável</span>: ali ela é ruído de
              arredondamento.
            </Alert>
          </section>

          <ForecastGraficos
            receita={montarSerie(
              forecast.mesesBase, forecast.mesesProjetados,
              serieHistorica.map((s) => s.receita),
              forecast.receita?.proximosMeses ?? [],
            )}
            despesa={montarSerie(
              forecast.mesesBase, forecast.mesesProjetados,
              serieHistorica.map((s) => s.despesa),
              forecast.despesa?.proximosMeses ?? [],
            )}
            resultado={montarSerie(
              forecast.mesesBase, forecast.mesesProjetados,
              serieHistorica.map((s) => s.resultado),
              forecast.resultado?.proximosMeses ?? [],
            )}
            caixa={montarSerie(
              forecast.mesesBase, forecast.mesesProjetados,
              serieHistorica.map((s) => s.resultado),
              forecast.caixa?.proximosMeses ?? [],
            )}
          />

          {/* ── A TABELA DOS MESES PROJETADOS ──────────────────────────── */}
          <Panel padded={false}>
            <div className="p-5 sm:p-6 pb-3">
              <PanelHeader
                title="Os próximos meses"
                sub="Média histórica mais a tendência acumulada, mês a mês."
              />
            </div>
            <TableShell>
              <Table>
                <THead>
                  <HeadRow>
                    <Th className="pl-5">Período</Th>
                    <Th align="right">Receita</Th>
                    <Th align="right">Despesa</Th>
                    <Th align="right">Resultado</Th>
                    <Th align="right">Caixa</Th>
                  </HeadRow>
                </THead>
                <tbody>
                  {forecast.mesesProjetados.length === 0 ? (
                    <EmptyRow colSpan={5}>Nenhum mês projetado.</EmptyRow>
                  ) : forecast.mesesProjetados.map((p, i) => (
                    <Row key={p}>
                      <Td className="pl-5 t-num whitespace-nowrap">{formatMesRef(p)}</Td>
                      <Td align="right" numeric>
                        {moedaCheia(forecast.receita?.proximosMeses[i] ?? 0)}
                      </Td>
                      <Td align="right" numeric>
                        {moedaCheia(forecast.despesa?.proximosMeses[i] ?? 0)}
                      </Td>
                      <Td align="right" numeric>
                        {moedaCheia(forecast.resultado?.proximosMeses[i] ?? 0)}
                      </Td>
                      <Td align="right" numeric className="font-medium">
                        {moedaCheia(forecast.caixa?.proximosMeses[i] ?? 0)}
                      </Td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableShell>
            <p className="t-label text-subtle/70 px-5 sm:px-6 py-4">
              A projeção nunca fica negativa em receita e despesa: uma tendência de queda
              forte projetaria faturamento negativo depois de alguns meses, o que não
              existe. O piso é zero, e a tendência aparece ao lado para que a queda não
              desapareça da leitura. O resultado e o caixa PODEM ser negativos — ali o
              sinal é a informação.
            </p>
          </Panel>

          {/* ── O HISTÓRICO QUE ALIMENTOU A CONTA ──────────────────────── */}
          <Panel padded={false}>
            <div className="p-5 sm:p-6 pb-3">
              <PanelHeader
                title="A base da projeção"
                sub="Os meses fechados com lançamento. O mês em curso fica de fora."
              />
            </div>
            <TableShell>
              <Table>
                <THead>
                  <HeadRow>
                    <Th className="pl-5">Período</Th>
                    <Th align="right">Receita</Th>
                    <Th align="right">Despesa</Th>
                    <Th align="right">Resultado</Th>
                  </HeadRow>
                </THead>
                <tbody>
                  {serieHistorica.length === 0 ? (
                    <EmptyRow colSpan={4}>Nenhum mês fechado com lançamento.</EmptyRow>
                  ) : serieHistorica.map((s) => (
                    <Row key={s.periodo}>
                      <Td className="pl-5 t-num whitespace-nowrap">{formatMesRef(s.periodo)}</Td>
                      <Td align="right" numeric>{moedaCheia(s.receita)}</Td>
                      <Td align="right" numeric>{moedaCheia(s.despesa)}</Td>
                      <Td align="right" numeric>{moedaCheia(s.resultado)}</Td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableShell>
            <p className="t-label text-subtle/70 px-5 sm:px-6 py-4">
              Mês sem lançamento nenhum NÃO entra como zero: ausência de dado não é
              receita zero, e contá-la afundaria a média e inventaria uma tendência de
              queda.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}

/**
 * Costura o REALIZADO e o FORECAST numa linha do tempo só.
 *
 * O último ponto histórico também recebe o valor de forecast, para que a linha
 * tracejada comece nele em vez de flutuar desconectada — sem a emenda, o traço
 * aparece como um segmento solto à direita do gráfico.
 */
function montarSerie(
  mesesBase: string[],
  mesesProjetados: string[],
  realizados: number[],
  projetados: number[],
): Array<{ periodo: string; realizado: number | null; forecast: number | null }> {
  const historico = mesesBase.map((p, i) => ({
    periodo: p,
    realizado: realizados[i] ?? 0,
    forecast: null as number | null,
  }))

  const ultimo = historico[historico.length - 1]
  if (!ultimo || projetados.length === 0) return historico

  return [
    ...historico.slice(0, -1),
    { ...ultimo, forecast: ultimo.realizado },
    ...mesesProjetados.map((p, i) => ({
      periodo: p,
      realizado: null,
      forecast: projetados[i] ?? null,
    })),
  ]
}
