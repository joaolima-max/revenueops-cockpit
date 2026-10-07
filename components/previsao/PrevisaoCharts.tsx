'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatMesRef } from '@/lib/utils'
import {
  paleta, gridProps, axisProps, legendProps, cursorBarra, cursorLinha,
  signal, BAR, LINE, hasSeries,
} from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'
import { makeTooltip } from '@/components/ui/ChartTooltip'
import { eixoMoeda as fmtEixoMoeda, moedaCheia } from '@/lib/format-financeiro'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'

/**
 * GRÁFICOS DA PREVISÃO.
 *
 * ── A GRAMÁTICA: PREVISTO É FANTASMA, REALIZADO É SÓLIDO ────────────────
 *
 * Em todo gráfico de previsto × realizado, o PREVISTO é a série de contorno
 * (linha ou barra clara) e o REALIZADO é a série cheia. É a convenção que o
 * Cockpit já usa para comparação (`LINE` em traço contra área preenchida), e
 * ela carrega a leitura sem legenda: o que está cheio aconteceu.
 *
 * Duas barras sólidas lado a lado forçariam o leitor a conferir a legenda em
 * cada gráfico para saber qual é qual.
 *
 * ── A COR SÓ MARCA SITUAÇÃO ─────────────────────────────────────────────
 *
 * Verde e vermelho aparecem exclusivamente onde há julgamento — estouro de
 * orçamento, caixa negativo. Receita, despesa e resultado usam o accent em
 * intensidades diferentes. É a regra do `Badge` do produto, aplicada aos
 * gráficos: cor comunica status, nunca categoria.
 *
 * ── NADA É DECORATIVO ───────────────────────────────────────────────────
 *
 * Sem gradiente em barra, sem sombra, sem rótulo sobre cada ponto. Os eixos
 * monetários cortam os centavos (`eixoMoeda`), e o valor cheio aparece no
 * tooltip — a mesma divisão de trabalho do resto do sistema.
 */

/* ========================================================================= *
 * TIPOS — espelho do que `lib/previsao.ts` devolve
 * ========================================================================= */

export interface PontoPrevisto {
  periodo: string
  previsto: number
  realizado: number
  desvio: number
}

export interface PontoCaixaGrafico {
  periodo: string
  fechado: boolean
  saldoRealizado: number
  saldoProjetado: number
  geracaoRealizada: number
  geracaoProjetada: number
}

export interface BarraSimples {
  id: string
  nome: string
  orcado?: number
  realizado?: number
  valor?: number
}

export interface PontoForecast {
  periodo: string
  /** Realizado dos meses fechados. `null` nos meses projetados. */
  realizado: number | null
  /** Projeção. `null` nos meses já fechados. */
  forecast: number | null
}

/* ========================================================================= *
 * MOLDURA
 * ========================================================================= */

function Quadro({
  titulo, sub, children, rodape,
}: {
  titulo: string
  sub: string
  children: React.ReactNode
  rodape?: string
}) {
  return (
    <Panel>
      <PanelHeader title={titulo} sub={sub} />
      <div className="mt-5">{children}</div>
      {rodape && <p className="t-label text-subtle/70 mt-3">{rodape}</p>}
    </Panel>
  )
}

function SemSerie({ what }: { what: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <EmptyState compact title="Sem série para o período" description={what} />
    </div>
  )
}

/* ========================================================================= *
 * PREVISTO × REALIZADO — receita, despesa e resultado
 * ========================================================================= */

/**
 * O gráfico base de PREVISTO × REALIZADO.
 *
 * Barra = realizado (o que aconteceu, sólido). Linha = previsto (a
 * expectativa, traço). Os três gráficos que o pedido lista — receita, despesa
 * e resultado — são a MESMA peça com dados diferentes: três componentes
 * separados seriam três cópias do mesmo eixo, da mesma legenda e do mesmo
 * tooltip, livres para divergir no primeiro ajuste.
 */
export function PrevistoRealizadoChart({
  pontos, nome, corRealizado,
}: {
  pontos: PontoPrevisto[]
  nome: string
  /** `s1` para receita, `s2` para despesa e resultado — nunca semântica. */
  corRealizado: 's1' | 's2'
}) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])
  const dados = useMemo(
    () => pontos.map((x) => ({ ...x, mes: formatMesRef(x.periodo) })),
    [pontos],
  )

  if (!hasSeries(dados, 'previsto', 'realizado')) {
    return <SemSerie what={`Nenhum ${nome.toLowerCase()} previsto nem realizado no período.`} />
  }

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="mes" {...eixo} />
        <YAxis {...eixo} tickFormatter={fmtEixoMoeda} width={104} />
        <Tooltip cursor={cursorBarra(p)} content={makeTooltip(dados, 'mes', [
          { key: 'realizado', nome: 'Realizado', cor: p[corRealizado] },
          { key: 'previsto', nome: 'Previsto', cor: p.fg },
          { key: 'desvio', nome: 'Desvio', cor: p.s3 },
        ], moedaCheia)} />
        <Legend {...leg} />
        <Bar dataKey="realizado" name="Realizado" fill={p[corRealizado]} {...BAR} />
        {/* O PREVISTO é LINHA, não uma segunda barra: duas barras sólidas lado
            a lado obrigam a conferir a legenda para saber qual é qual. A linha
            atravessa as barras e a leitura fica imediata — a barra que passa
            da linha estourou. */}
        <Line type="monotone" dataKey="previsto" name="Previsto"
          stroke={p.fg} {...linha} strokeDasharray="4 3" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ========================================================================= *
 * FLUXO DE CAIXA — realizado × projetado
 * ========================================================================= */

/**
 * A CURVA DE CAIXA.
 *
 * Duas áreas: o saldo REALIZADO (sólido, para onde o dado existe) e o
 * PROJETADO (traço, a partir do mês corrente). Elas se encontram no mês em
 * curso, que é onde o realizado termina e a projeção começa.
 *
 * ── A LINHA DO ZERO É DESENHADA ─────────────────────────────────────────
 *
 * Num gráfico de caixa, cruzar o zero é o evento que importa — é o mês em que
 * falta dinheiro. Sem a referência visível, um saldo de 200 mil e um de −200
 * mil parecem igualmente altos na área, e o leitor precisa ler o eixo para
 * descobrir qual é qual.
 */
export function FluxoCaixaChart({ pontos }: { pontos: PontoCaixaGrafico[] }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])
  const sig = useMemo(() => signal(theme), [theme])

  const dados = useMemo(() => pontos.map((x) => ({
    ...x,
    mes: formatMesRef(x.periodo),
    // O realizado só existe onde o período já aconteceu. `null` nos meses
    // futuros — zero afirmaria que o caixa zerou, e a área desceria até o
    // eixo desenhando um precipício que ninguém viveu.
    realizado: x.fechado || x.saldoRealizado !== x.saldoProjetado ? x.saldoRealizado : x.saldoRealizado,
    projetado: x.saldoProjetado,
  })), [pontos])

  if (!hasSeries(dados, 'projetado')) {
    return <SemSerie what="Sem lançamentos liquidados nem previsões no horizonte escolhido." />
  }

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)
  const temNegativo = dados.some((d) => d.projetado < 0 || d.realizado < 0)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="caixaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.s1} stopOpacity={0.22} />
            <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="mes" {...eixo} />
        <YAxis {...eixo} tickFormatter={fmtEixoMoeda} width={104} />
        <Tooltip cursor={cursorLinha(p)} content={makeTooltip(dados, 'mes', [
          { key: 'realizado', nome: 'Caixa realizado', cor: p.s1 },
          { key: 'projetado', nome: 'Caixa projetado', cor: p.fg },
          { key: 'geracaoRealizada', nome: 'Geração realizada', cor: p.s2 },
          { key: 'geracaoProjetada', nome: 'Geração projetada', cor: p.s3 },
        ], moedaCheia)} />
        <Legend {...leg} />

        {/* A REFERÊNCIA DO ZERO. Desenhada como uma série constante e não como
            `ReferenceLine` porque assim ela entra na legenda e o leitor sabe
            o que a linha é — uma linha sem rótulo num gráfico financeiro é um
            convite a interpretá-la como meta. */}
        {temNegativo && (
          <Line dataKey={() => 0} name="Zero" stroke={sig.neg}
            strokeWidth={1} dot={false} activeDot={false} legendType="plainline" />
        )}

        <Area type="monotone" dataKey="realizado" name="Caixa realizado"
          stroke={p.s1} fill="url(#caixaG)" {...linha} />
        {/* PROJETADO em traço: ele é expectativa, e preenchê-lo o faria parecer
            tão certo quanto o realizado. */}
        <Area type="monotone" dataKey="projetado" name="Caixa projetado"
          stroke={p.fg} fill="none" {...linha} strokeDasharray="4 3" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ========================================================================= *
 * ORÇAMENTO POR CENTRO DE CUSTO
 * ========================================================================= */

/**
 * ORÇADO × REALIZADO POR CENTRO DE CUSTO, em barras horizontais.
 *
 * ── POR QUE HORIZONTAL ──────────────────────────────────────────────────
 *
 * Os nomes das áreas são palavras ("Administrativo", "Tecnologia"), e num eixo
 * vertical elas giram 45° ou se cortam. Na horizontal cabem inteiras, e a
 * comparação entre áreas — que é a pergunta do gráfico — fica na vertical, que
 * é onde o olho compara comprimento com precisão.
 *
 * A COR MARCA SITUAÇÃO: a barra do realizado fica vermelha quando passou do
 * orçado. É julgamento, e aqui ele é pedido — "quais despesas estão acima do
 * previsto" é uma das perguntas que o módulo existe para responder.
 */
export function OrcamentoPorCentroChart({ barras }: { barras: BarraSimples[] }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])
  const sig = useMemo(() => signal(theme), [theme])

  const dados = useMemo(
    () => barras.filter((b) => (b.orcado ?? 0) > 0 || (b.realizado ?? 0) > 0).slice(0, 12),
    [barras],
  )

  if (dados.length === 0) {
    return <SemSerie what="Nenhum orçamento aprovado nem despesa atribuída a centro de custo no período." />
  }

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p)

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 38)}>
      <BarChart data={dados} layout="vertical"
        margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid {...grid} horizontal={false} vertical />
        <XAxis type="number" {...eixo} tickFormatter={fmtEixoMoeda} />
        <YAxis type="category" dataKey="nome" {...eixo} width={128} />
        <Tooltip cursor={cursorBarra(p)} content={makeTooltip(dados, 'nome', [
          { key: 'orcado', nome: 'Orçado', cor: p.s3 },
          { key: 'realizado', nome: 'Realizado', cor: p.s1 },
        ], moedaCheia)} />
        <Legend {...leg} />
        <Bar dataKey="orcado" name="Orçado" fill={p.s3} maxBarSize={10}
          radius={[0, 3, 3, 0]} />
        <Bar dataKey="realizado" name="Realizado" maxBarSize={10} radius={[0, 3, 3, 0]}
          // Vermelho só onde estourou: é a única cor semântica do quadro.
          fill={p.s1}
          shape={(props: unknown) => {
            const b = props as {
              x: number; y: number; width: number; height: number
              payload: BarraSimples
            }
            const estourou = (b.payload.realizado ?? 0) > (b.payload.orcado ?? 0)
              && (b.payload.orcado ?? 0) > 0
            return (
              <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={3}
                fill={estourou ? sig.neg : p.s1} />
            )
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ========================================================================= *
 * DESPESA POR CATEGORIA
 * ========================================================================= */

/**
 * DESPESA POR CATEGORIA, em barras horizontais.
 *
 * Barras e não pizza, ao contrário do "Gasto por categoria" da Visão Geral
 * Financeira — e a diferença é de pergunta. Lá o donut responde "qual a
 * composição da despesa", onde a proporção é o ponto. Aqui a pergunta é "quais
 * categorias consomem mais", que é ordenação e comparação de magnitude — e
 * para isso barra ordenada é mais precisa que ângulo.
 */
export function DespesaPorCategoriaChart({ barras }: { barras: BarraSimples[] }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const dados = useMemo(
    () => barras.filter((b) => (b.valor ?? 0) > 0).slice(0, 12),
    [barras],
  )

  if (dados.length === 0) {
    return <SemSerie what="Nenhuma despesa lançada no período." />
  }

  const grid = gridProps(p), eixo = axisProps(p)

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, dados.length * 32)}>
      <BarChart data={dados} layout="vertical"
        margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
        <CartesianGrid {...grid} horizontal={false} vertical />
        <XAxis type="number" {...eixo} tickFormatter={fmtEixoMoeda} />
        <YAxis type="category" dataKey="nome" {...eixo} width={128} />
        <Tooltip cursor={cursorBarra(p)} content={makeTooltip(dados, 'nome',
          [{ key: 'valor', nome: 'Despesa', cor: p.s2 }], moedaCheia)} />
        <Bar dataKey="valor" name="Despesa" fill={p.s2} maxBarSize={14}
          radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ========================================================================= *
 * FORECAST — realizado e projetado na mesma linha do tempo
 * ========================================================================= */

/**
 * O FORECAST, como CONTINUAÇÃO do realizado.
 *
 * ── UMA SÓ LINHA DO TEMPO, DUAS SÉRIES ──────────────────────────────────
 *
 * Os meses fechados carregam `realizado` e `forecast: null`; os projetados, o
 * contrário. O resultado é uma curva sólida que vira traço no ponto em que o
 * dado acaba — e esse ponto é exatamente a informação mais importante do
 * gráfico.
 *
 * Dois gráficos lado a lado (histórico | projeção) obrigariam o leitor a
 * costurar as duas escalas de cabeça, e a continuidade — que é o que torna
 * uma projeção crível ou não — ficaria invisível.
 *
 * `connectNulls` NÃO é usado: ele uniria as duas séries numa linha contínua e
 * apagaria a fronteira entre o que aconteceu e o que é palpite.
 */
export function ForecastChart({
  pontos, nome,
}: {
  pontos: PontoForecast[]
  nome: string
}) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])
  const dados = useMemo(
    () => pontos.map((x) => ({ ...x, mes: formatMesRef(x.periodo) })),
    [pontos],
  )

  if (dados.length === 0) {
    return <SemSerie what={`Sem histórico suficiente para projetar ${nome.toLowerCase()}.`} />
  }

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="fcG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
            <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="mes" {...eixo} />
        <YAxis {...eixo} tickFormatter={fmtEixoMoeda} width={104} />
        <Tooltip cursor={cursorLinha(p)} content={makeTooltip(dados, 'mes', [
          { key: 'realizado', nome: 'Realizado', cor: p.s1 },
          { key: 'forecast', nome: 'Forecast', cor: p.fg },
        ], moedaCheia)} />
        <Legend {...leg} />
        <Area type="monotone" dataKey="realizado" name="Realizado"
          stroke={p.s1} fill="url(#fcG)" {...linha} />
        <Line type="monotone" dataKey="forecast" name="Forecast"
          stroke={p.fg} {...linha} strokeDasharray="4 3" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export { Quadro as QuadroPrevisao }
