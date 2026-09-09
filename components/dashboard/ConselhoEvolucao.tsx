'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { paleta, gridProps, axisProps, legendProps, cursorBarra, BAR, LINE } from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'
import { makeTooltip } from '@/components/ui/ChartTooltip'
import { moedaCompacta, moedaCheia } from '@/lib/format-financeiro'

export interface PontoEvolucao extends Record<string, unknown> {
  mes: string; tpv: number; faturamento: number
}

/**
 * Evolução do Conselho: TPV em barra (volume) e faturamento em linha sobre eixo
 * próprio (receita). Duas grandezas de ordem muito diferente no mesmo quadro —
 * um eixo só achataria o faturamento contra o TPV.
 */
export default function ConselhoEvolucao({ dados }: { dados: PontoEvolucao[] }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  // Só períodos com movimento entram: meses zerados sujam a leitura.
  const serie = useMemo(() => dados.filter(d => d.tpv > 0 || d.faturamento > 0), [dados])

  if (serie.length < 2) {
    return (
      <p className="t-sm text-subtle text-center py-14">
        São necessários ao menos dois meses com lançamento para desenhar a evolução.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={serie} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
        <CartesianGrid {...gridProps(p)} />
        <XAxis dataKey="mes" {...axisProps(p)} />
        <YAxis yAxisId="tpv" {...axisProps(p)} tickFormatter={moedaCompacta} width={68} />
        <YAxis yAxisId="fat" orientation="right" {...axisProps(p)} tickFormatter={moedaCompacta} width={68} />
        <Tooltip cursor={cursorBarra(p)} content={makeTooltip(serie, 'mes',
          [{ key: 'tpv', nome: 'TPV', cor: p.s3 }, { key: 'faturamento', nome: 'Faturamento', cor: p.s1 }],
          moedaCheia)} />
        <Legend {...legendProps(p)} />
        <Bar yAxisId="tpv" dataKey="tpv" name="TPV" fill={p.s3} {...BAR} />
        <Line yAxisId="fat" type="monotone" dataKey="faturamento" name="Faturamento" stroke={p.s1} {...LINE(p)} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
