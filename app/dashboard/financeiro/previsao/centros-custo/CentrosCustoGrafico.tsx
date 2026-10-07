'use client'

import {
  OrcamentoPorCentroChart, type BarraSimples,
} from '@/components/previsao/PrevisaoCharts'

/** A fronteira RSC do gráfico. Ver `FluxoCaixaGrafico` para o motivo. */
export default function CentrosCustoGrafico({ barras }: { barras: BarraSimples[] }) {
  return <OrcamentoPorCentroChart barras={barras} />
}
