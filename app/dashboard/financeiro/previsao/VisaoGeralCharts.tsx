'use client'

import Panel, { PanelHeader } from '@/components/ui/Panel'
import {
  PrevistoRealizadoChart, FluxoCaixaChart, OrcamentoPorCentroChart,
  DespesaPorCategoriaChart, ForecastChart,
  type PontoPrevisto, type PontoCaixaGrafico, type BarraSimples, type PontoForecast,
} from '@/components/previsao/PrevisaoCharts'

/**
 * OS OITO GRÁFICOS DA PREVISÃO.
 *
 * ── POR QUE UM COMPONENTE DE CLIENTE SÓ, E NÃO OITO ─────────────────────
 *
 * Os gráficos são Client Components (recharts precisa do DOM) e a página é
 * Server Component. Cada gráfico importado direto na página seria oito
 * fronteiras RSC, e em cada uma delas o risco de passar uma FUNÇÃO como prop
 * — o defeito que já derrubou a Visão Geral Financeira em produção, porque
 * função não atravessa essa fronteira.
 *
 * Com um componente só, a fronteira é UMA, e tudo o que a atravessa é dado
 * serializável: números, strings e booleanos. Os formatadores são importados
 * DENTRO dos gráficos, nunca passados de fora.
 *
 * ── A ORDEM DOS QUADROS ─────────────────────────────────────────────────
 *
 * Três de previsto × realizado (receita, despesa, resultado), depois o caixa,
 * depois a decomposição (orçamento por área, despesa por categoria), e o
 * forecast fechando. É a mesma leitura do resto da tela: o que aconteceu, o
 * que sobrou, onde foi, para onde aponta.
 *
 * Dois por linha em telas largas, um por linha abaixo de `xl` — o mesmo grid
 * do Cockpit. O fluxo de caixa e o forecast ocupam largura cheia: são curvas
 * temporais longas, e comprimi-las à metade da tela esmaga a leitura.
 */
export default function VisaoGeralCharts({
  receita, despesa, resultado, caixa,
  orcamentoPorCentro, despesaPorCategoria,
  forecastReceita, forecastCaixa,
}: {
  receita: PontoPrevisto[]
  despesa: PontoPrevisto[]
  resultado: PontoPrevisto[]
  caixa: PontoCaixaGrafico[]
  orcamentoPorCentro: BarraSimples[]
  despesaPorCategoria: BarraSimples[]
  forecastReceita: PontoForecast[]
  forecastCaixa: PontoForecast[]
}) {
  return (
    <div className="space-y-4">
      <PanelHeader
        title="Gráficos"
        sub="Todos respondem aos filtros selecionados. Série cheia é realizado; traço é previsto."
      />

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Receita" sub="Previsto × realizado" />
          <div className="mt-5">
            <PrevistoRealizadoChart pontos={receita} nome="Receita" corRealizado="s1" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Despesas" sub="Previsto × realizado" />
          <div className="mt-5">
            <PrevistoRealizadoChart pontos={despesa} nome="Despesa" corRealizado="s2" />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Resultado"
          sub="Previsto × realizado — receita menos despesa, por competência"
        />
        <div className="mt-5">
          <PrevistoRealizadoChart pontos={resultado} nome="Resultado" corRealizado="s1" />
        </div>
      </Panel>

      {/* LARGURA CHEIA: é uma curva temporal, e metade da tela esmaga a
          leitura do ponto em que o realizado vira projeção. */}
      <Panel>
        <PanelHeader
          title="Fluxo de caixa"
          sub="Realizado × projetado — saldo acumulado mês a mês"
        />
        <div className="mt-5">
          <FluxoCaixaChart pontos={caixa} />
        </div>
        <p className="t-label text-subtle/70 mt-3">
          O realizado é liquidação (lançamento pago); o projetado soma títulos a
          receber e a pagar com vencimento no mês, mais o que ainda se espera das
          previsões. Período fechado não tem projeção.
        </p>
      </Panel>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Orçamento por centro de custo"
            sub="Orçado × realizado de despesa. Vermelho marca o que passou do teto."
          />
          <div className="mt-5">
            <OrcamentoPorCentroChart barras={orcamentoPorCentro} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Despesas por categoria"
            sub="Realizado no período, da maior para a menor"
          />
          <div className="mt-5">
            <DespesaPorCategoriaChart barras={despesaPorCategoria} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Forecast de faturamento"
            sub="O realizado continua em traço onde o dado acaba"
          />
          <div className="mt-5">
            <ForecastChart pontos={forecastReceita} nome="faturamento" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Forecast de caixa"
            sub="Geração de caixa esperada — receita projetada menos despesa projetada"
          />
          <div className="mt-5">
            <ForecastChart pontos={forecastCaixa} nome="caixa" />
          </div>
        </Panel>
      </div>
    </div>
  )
}
