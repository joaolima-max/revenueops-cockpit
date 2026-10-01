'use client'

import type { ReactNode } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, type TooltipContentProps,
} from 'recharts'
import { useTheme } from '@/components/theme/ThemeProvider'
import { paleta, gridProps, axisProps, signal, cursorBarra } from '@/lib/chart-theme'
import { velaDegenerada, variacaoDaVela, type Vela, type Granularidade } from '@/lib/candle'
import { NoData } from '@/components/ui/EmptyState'

/**
 * GRÁFICO DE VELAS — leitura de crescimento, não interface de trading.
 *
 * O corpo mostra o movimento LÍQUIDO da janela (abertura → fechamento) e as
 * sombras mostram a dispersão DENTRO dela (mínima → máxima). É informação que
 * a linha média esconde: dois meses podem fechar no mesmo ponto tendo passado
 * por caminhos completamente diferentes.
 *
 * NADA É SIMULADO. O OHLC vem de observações diárias reais agregadas pela
 * janela (ver `lib/candle.ts`) — cada um dos quatro números foi medido em
 * algum dia daquele período.
 *
 * O TOOLTIP DECLARA O PERÍODO e quantas observações formaram a vela. Uma vela
 * de uma observação só não tem dispersão medida, e é marcada como tal em vez
 * de ser desenhada como se tivesse.
 *
 * MOEDA SEMPRE POR EXTENSO: o formatador vem de fora, e nenhum eixo ou
 * tooltip usa K, M, MM ou BI.
 */

interface Props {
  velas: Vela[]
  /** Formata o valor no eixo e no tooltip. Para moeda, use `moedaCheia`. */
  formatar: (n: number) => string
  granularidade?: Granularidade
  altura?: number
  /** Mensagem quando não há série. */
  vazio?: string
}

/** Linha do tooltip. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="t-label text-subtle">{rotulo}</span>
      <span className="t-mono text-fg tabular-nums">{valor}</span>
    </div>
  )
}

export default function Candles({
  velas, formatar, granularidade = 'MES', altura = 240, vazio,
}: Props) {
  const { theme } = useTheme()
  const p = paleta(theme)
  const sig = signal(theme)

  if (velas.length === 0) {
    return (
      <div style={{ height: altura }} className="flex items-center justify-center">
        <NoData label={vazio ?? 'Nenhuma observação no período para formar velas.'} />
      </div>
    )
  }

  /**
   * O domínio inclui folga de 4% em cada ponta.
   *
   * Sem folga, a sombra da vela mais alta encosta na borda do gráfico e parece
   * cortada — o leitor não sabe se a máxima é aquela ou se continua acima.
   */
  const altas = velas.map((v) => v.high)
  const baixas = velas.map((v) => v.low)
  const teto = Math.max(...altas)
  const piso = Math.min(...baixas)
  const folga = (teto - piso) * 0.04 || Math.abs(teto) * 0.04 || 1

  /**
   * Cada ponto carrega a vela inteira. A `Bar` existe só para o recharts
   * posicionar a coluna e dar escala: o desenho real é do `shape` abaixo.
   */
  const dados = velas.map((v) => ({ rotulo: v.rotulo, faixa: [v.low, v.high], v }))

  type Forma = {
    x?: number; y?: number; width?: number; height?: number
    payload?: { v: Vela }
  }

  /**
   * Desenha a vela: a sombra como linha fina de mínima a máxima, e o corpo
   * como retângulo de abertura a fechamento.
   *
   * O corpo tem ALTURA MÍNIMA de 1px: quando abertura e fechamento coincidem,
   * um retângulo de altura zero desapareceria e a vela sumiria do gráfico.
   */
  function Vela1(props: unknown) {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props as Forma
    if (!payload) return <g />
    const v = payload.v

    const escala = height / ((v.high - v.low) || 1)
    const yDe = (valor: number) => y + (v.high - valor) * escala

    const cor = v.alta ? sig.pos : sig.neg
    const meio = x + width / 2
    const larguraCorpo = Math.max(width * 0.62, 3)
    const xCorpo = meio - larguraCorpo / 2

    const topoCorpo = yDe(Math.max(v.open, v.close))
    const baseCorpo = yDe(Math.min(v.open, v.close))
    const alturaCorpo = Math.max(baseCorpo - topoCorpo, 1)

    const traco = velaDegenerada(v)

    return (
      <g>
        {/* Sombra: mínima a máxima. Só quando há dispersão medida. */}
        {!traco && (
          <line x1={meio} x2={meio} y1={yDe(v.high)} y2={yDe(v.low)}
            stroke={cor} strokeWidth={1} opacity={0.65} />
        )}
        <rect
          x={xCorpo} y={topoCorpo} width={larguraCorpo} height={alturaCorpo}
          fill={v.alta ? cor : 'transparent'} stroke={cor} strokeWidth={1.25} rx={1}
          opacity={traco ? 0.55 : 1}
        />
      </g>
    )
  }

  function Dica({ active, payload }: TooltipContentProps): ReactNode {
    if (!active || !payload?.length) return null
    const v = (payload[0].payload as { v: Vela }).v
    const variacao = variacaoDaVela(v)
    const periodo = granularidade === 'SEMANA' ? 'Semana' : 'Mês'
    const fmtData = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })

    return (
      <div className="rounded-xl border border-line-2 bg-surface px-3.5 py-3 space-y-1.5
        shadow-[var(--bp-shadow-overlay)] min-w-[13rem]">
        <p className="t-label text-fg">{periodo} · {v.rotulo}</p>
        {/* O PERÍODO USADO, declarado: o candle é agregação de observações
            diárias, e sem a janela o leitor não sabe o que está vendo. */}
        <p className="t-label text-subtle">
          {fmtData(v.de)} a {fmtData(v.ate)} · {v.observacoes}{' '}
          observaç{v.observacoes === 1 ? 'ão' : 'ões'}
        </p>
        <div className="pt-1.5 space-y-0.5 border-t border-line">
          <Linha rotulo="Abertura" valor={formatar(v.open)} />
          <Linha rotulo="Máxima" valor={formatar(v.high)} />
          <Linha rotulo="Mínima" valor={formatar(v.low)} />
          <Linha rotulo="Fechamento" valor={formatar(v.close)} />
        </div>
        {variacao !== null && (
          <p className="t-label pt-1" style={{ color: v.alta ? sig.pos : sig.neg }}>
            {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}% no período
          </p>
        )}
        {velaDegenerada(v) && (
          <p className="t-label text-subtle">
            {v.observacoes < 2
              ? 'Uma observação só — sem dispersão medida.'
              : 'Sem variação dentro da janela.'}
          </p>
        )}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 6, right: 0, bottom: 0, left: -8 }}>
        <CartesianGrid {...gridProps(p)} />
        <XAxis dataKey="rotulo" {...axisProps(p)} />
        <YAxis
          {...axisProps(p)}
          width={104}
          domain={[piso - folga, teto + folga]}
          tickFormatter={formatar}
        />
        <Tooltip cursor={cursorBarra(p)} content={Dica} />
        <Bar dataKey="faixa" shape={Vela1} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
