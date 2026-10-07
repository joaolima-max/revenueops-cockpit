'use client'

import Panel, { PanelHeader } from '@/components/ui/Panel'
import { ForecastChart, type PontoForecast } from '@/components/previsao/PrevisaoCharts'

/**
 * OS QUATRO GRÁFICOS DE FORECAST.
 *
 * Um componente de cliente só, e não quatro: cada gráfico importado direto na
 * página seria uma fronteira RSC, e em cada uma o risco de passar uma FUNÇÃO
 * como prop — o defeito que já derrubou a Visão Geral Financeira em produção.
 *
 * Aqui a fronteira é UMA, e tudo o que a atravessa é dado serializável.
 */
export default function ForecastGraficos({
  receita, despesa, resultado, caixa,
}: {
  receita: PontoForecast[]
  despesa: PontoForecast[]
  resultado: PontoForecast[]
  caixa: PontoForecast[]
}) {
  return (
    <div className="space-y-4">
      <PanelHeader
        title="Projeções"
        sub="A curva cheia é o realizado; o traço começa onde o dado acaba."
      />

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Forecast de faturamento" sub="Receita projetada" />
          <div className="mt-5">
            <ForecastChart pontos={receita} nome="faturamento" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Forecast de despesas" sub="Despesa projetada" />
          <div className="mt-5">
            <ForecastChart pontos={despesa} nome="despesas" />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Forecast de resultado" sub="Receita menos despesa, projetadas" />
          <div className="mt-5">
            <ForecastChart pontos={resultado} nome="resultado" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Forecast de caixa"
            sub="Geração esperada — derivada das duas projeções, por isso fecha com elas"
          />
          <div className="mt-5">
            <ForecastChart pontos={caixa} nome="caixa" />
          </div>
        </Panel>
      </div>
    </div>
  )
}
