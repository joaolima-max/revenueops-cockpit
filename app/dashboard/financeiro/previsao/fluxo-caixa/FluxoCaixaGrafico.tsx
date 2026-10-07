'use client'

import {
  FluxoCaixaChart, type PontoCaixaGrafico,
} from '@/components/previsao/PrevisaoCharts'

/**
 * A fronteira RSC do gráfico de caixa.
 *
 * `FluxoCaixaChart` é Client Component (recharts precisa do DOM) e a página é
 * Server Component. Esta casca existe para que a fronteira seja UMA e tudo o
 * que a atravessa seja dado serializável — números, strings e booleanos.
 *
 * Nenhuma FUNÇÃO cruza daqui para dentro: os formatadores são importados pelo
 * próprio gráfico. É o defeito que já derrubou a Visão Geral Financeira em
 * produção — "Functions cannot be passed directly to Client Components" —, e a
 * barreira contra ele é estrutural, não uma lembrança.
 */
export default function FluxoCaixaGrafico({ pontos }: { pontos: PontoCaixaGrafico[] }) {
  return <FluxoCaixaChart pontos={pontos} />
}
