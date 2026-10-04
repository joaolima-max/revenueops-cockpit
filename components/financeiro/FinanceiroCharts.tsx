'use client'

import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { useTheme } from '@/components/theme/ThemeProvider'
import {
  paleta, rampaCategorias, gridProps, axisProps, legendProps, cursorBarra, BAR, LINE, hasSeries,
} from '@/lib/chart-theme'
import { makeTooltip, TooltipCard } from '@/components/ui/ChartTooltip'
import { moedaCheia, eixoMoeda, quantidadeCompacta } from '@/lib/format-financeiro'
import { formatMesRef } from '@/lib/utils'
import EmptyState from '@/components/ui/EmptyState'

export interface Fatia {
  id: string
  nome: string
  valor: number
  /** Linha de apoio na legenda: origem, identificação, nº de lançamentos. */
  nota?: string
}

export interface PontoFinanceiro {
  periodo: string
  receita: number
  despesa: number
  resultado: number
}

function Vazio({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="min-h-[13rem] flex items-center justify-center">
      <EmptyState compact title={titulo} description={descricao} />
    </div>
  )
}

/**
 * COMO O VALOR DE UM GRÁFICO É ESCRITO — pelo NOME, não pela função.
 *
 * Estes componentes são de cliente e são usados por páginas de SERVIDOR. Uma
 * função não atravessa a fronteira RSC: o React recusa a serialização e a
 * página inteira vai para o error boundary. Um nome atravessa, e é resolvido
 * aqui dentro.
 *
 * O conjunto é FECHADO de propósito: acrescentar um formato exige acrescentar
 * uma entrada neste mapa, e não há como uma tela inventar formatação própria.
 */
export type FormatoValor = 'moeda' | 'quantidade'

const FORMATADORES: Record<FormatoValor, (n: number) => string> = {
  moeda: moedaCheia,
  quantidade: quantidadeCompacta,
}

/**
 * GRÁFICO CIRCULAR (donut).
 *
 * Círculo dividido em segmentos, legenda ao lado, sem painel de fundo pesado —
 * o contorno já vem do <Panel> que o envolve. O total fica no miolo: é a
 * pergunta que o leitor faz logo depois de ver a proporção.
 *
 * Valores SEMPRE por extenso, tanto na legenda quanto no tooltip. Nenhuma
 * abreviação de escala em nenhum ponto do sistema.
 */
export function Donut({ fatias, rotuloTotal, formato, rotuloValor = 'Valor' }: {
  fatias: Fatia[]
  rotuloTotal: string
  /**
   * Como o valor é escrito. **OBRIGATÓRIO**, e de propósito.
   *
   * Já teve default `moedaCheia`, e o default era o bug: o donut era moeda por
   * construção, a Visão geral do Comercial o reusou para CONTAGEM de cards, e
   * 12 cards apareceram como "R$ 12,00" — no miolo e no tooltip. Ninguém
   * escreveu "moeda" em lugar nenhum; a moeda veio de graça.
   *
   * Sem default, a próxima tela que usar esta peça é OBRIGADA a dizer qual é a
   * unidade. É o que impede valor monetário de reaparecer por omissão numa
   * superfície que não deve ter nenhum — Leads e Pipeline, em particular.
   *
   * ── POR QUE UM NOME E NÃO A FUNÇÃO ──────────────────────────────────────
   *
   * A exigência nasceu como `formatar: (n) => string`, e era uma FUNÇÃO. Isto
   * é um Client Component, e a Visão Geral Financeira é um Server Component:
   * função não atravessa essa fronteira. O React recusava a serialização com
   * "Functions cannot be passed directly to Client Components" e a tela inteira
   * caía no error boundary — em toda requisição, sem nada de errado no banco
   * nem no cálculo.
   *
   * Um NOME atravessa. A obrigatoriedade continua intacta (não há default, e o
   * tipo é fechado), e quem resolve o nome em função é este módulo, do lado do
   * cliente, onde a função sempre pôde existir.
   */
  formato: FormatoValor
  /** Rótulo da linha no tooltip. "Valor" não serve para contagem. */
  rotuloValor?: string
}) {
  const formatar = FORMATADORES[formato]
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const dados = useMemo(
    () => [...fatias].filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor),
    [fatias],
  )
  const cores = useMemo(() => rampaCategorias(theme, dados.length), [theme, dados.length])
  const total = dados.reduce((s, f) => s + f.valor, 0)

  if (dados.length === 0 || total <= 0) {
    return <Vazio titulo="Sem valores no período" descricao="Nenhum lançamento classificado para compor a distribuição." />
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] items-center">
      <div className="relative">
        <ResponsiveContainer width="100%" height={188}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={1.5}
              stroke={p.tipBg}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {dados.map((f, i) => <Cell key={f.id} fill={cores[i]} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0]
                const fatia = item.payload as Fatia
                const i = dados.findIndex((d) => d.id === fatia.id)
                return (
                  <TooltipCard
                    titulo={fatia.nome}
                    formatar={formatar}
                    linhas={[{ nome: rotuloValor, cor: cores[i] ?? p.s1, valor: fatia.valor }]}
                    nota={`${((fatia.valor / total) * 100).toFixed(1)}% do total`}
                  />
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Total no miolo do donut. */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            <p className="t-label text-subtle">{rotuloTotal}</p>
            <p className="t-sm font-semibold text-fg tabular-nums mt-0.5" title={formatar(total)}>
              {formatar(total)}
            </p>
          </div>
        </div>
      </div>

      <ul className="space-y-2 min-w-0">
        {dados.map((f, i) => (
          <li key={f.id} className="flex items-baseline gap-3 min-w-0">
            <span aria-hidden className="w-2.5 h-2.5 rounded-sm flex-none translate-y-0.5"
              style={{ background: cores[i] }} />
            <span className="min-w-0 flex-1">
              <span className="block t-sm text-fg bp-truncate">{f.nome}</span>
              {f.nota && <span className="block t-label text-subtle">{f.nota}</span>}
            </span>
            <span className="text-right flex-none">
              {/* A LEGENDA OBEDECE AO `formato` como o miolo e o tooltip.
                  Ela chamava `figuraMoeda` na mão: num donut de CONTAGEM o
                  miolo dizia "12" e a linha ao lado dizia "R$ 12,00", sobre o
                  mesmo número. Era o bug do default de moeda, sobrevivendo
                  num canto depois de o default ter sido removido. */}
              <span className="block t-sm font-medium text-fg tabular-nums">
                {formatar(f.valor)}
              </span>
              <span className="block t-label text-subtle tabular-nums">
                {((f.valor / total) * 100).toFixed(1)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * EVOLUÇÃO TEMPORAL — receita e despesa em barras, resultado em linha.
 *
 * As três séries vêm dos MESMOS lançamentos que a tabela lista; o resultado é
 * a subtração, não uma quarta fonte.
 */
export function EvolucaoFinanceira({ pontos }: { pontos: PontoFinanceiro[] }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const dados = useMemo(
    () => pontos.map((d) => ({ ...d, mes: formatMesRef(d.periodo) })),
    [pontos],
  )

  if (!hasSeries(dados, 'receita', 'despesa')) {
    return <Vazio titulo="Sem série no período" descricao="Nenhum lançamento financeiro nos últimos 12 meses." />
  }

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)

  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="mes" {...eixo} />
        <YAxis {...eixo} tickFormatter={eixoMoeda} width={112} />
        <Tooltip cursor={cursorBarra(p)} content={makeTooltip(dados, 'mes', [
          { key: 'receita', nome: 'Receita', cor: p.s1 },
          { key: 'despesa', nome: 'Despesa', cor: p.s3 },
          { key: 'resultado', nome: 'Resultado', cor: p.s2 },
        ], moedaCheia)} />
        <Legend {...leg} />
        <Bar dataKey="receita" name="Receita" fill={p.s1} {...BAR} />
        <Bar dataKey="despesa" name="Despesa" fill={p.s3} {...BAR} />
        <Line type="monotone" dataKey="resultado" name="Resultado" stroke={p.s2} {...linha} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
