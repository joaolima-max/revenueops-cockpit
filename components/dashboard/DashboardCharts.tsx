'use client'

import { useState, useRef, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatMesRef, cn } from '@/lib/utils'
import {
  paleta, gridProps, axisProps, legendProps, cursorBarra, cursorLinha,
  BAR, LINE, hasSeries, isFlat,
} from '@/lib/chart-theme'
import { useTheme } from '@/components/theme/ThemeProvider'
import { makeTooltip } from '@/components/ui/ChartTooltip'
import {
  eixoMoeda as fmtEixoMoeda, moedaCheia, quantidadeCompacta, percentual, variacao,
} from '@/lib/format-financeiro'
import EmptyState from '@/components/ui/EmptyState'
import Button from '@/components/ui/Button'
import { Delta } from '@/components/ui/Figure'
import type { SeriesCockpit, PontoDiario, PontoMensalCockpit, RangeDias } from '@/lib/kpi'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRÁFICOS DO COCKPIT — cada um com a SUA janela de 7, 30 ou 90 dias
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE MUDOU NESTA RODADA ────────────────────────────────────────────
 *
 * Antes, todos os gráficos mostravam uma série fixa de 12 MESES, montada no
 * servidor e imutável na tela. Agora cada gráfico tem o seu próprio controle
 * [7 dias] [30 dias] [90 dias], e o período escolhido vem do BACKEND —
 * `/api/dashboard/series?range=…` —, não de um recorte feito aqui.
 *
 * É O MESMO GRÁFICO com período variável: mesma métrica, mesma identidade
 * visual, mesma legenda, mesmo eixo. Só o intervalo muda. Não há três
 * gráficos, e nenhum gráfico foi duplicado por janela.
 *
 * ── POR QUE O CONTROLE É POR GRÁFICO, E NÃO UM SÓ NO TOPO ───────────────
 *
 * Porque as perguntas são independentes. "Como foi a semana de TPV" e "como
 * foi o trimestre de MED" se fazem lado a lado, e um filtro global obrigaria
 * a alternar a página inteira para comparar duas escalas de tempo. O custo é
 * baixo: as janelas são cacheadas por range (ver `useSeries`), então são no
 * máximo três requisições, independentemente de quantos gráficos existam.
 *
 * ── DUAS RESOLUÇÕES, E A RAZÃO DISSO ────────────────────────────────────
 *
 * OITO gráficos são DIÁRIOS: TPV, receita, transações, saldo, MED, clientes
 * ativos, take rate e o operacional diário. Todos saem do Lançamento Diário,
 * que tem grão de um dia.
 *
 * TRÊS são MENSAIS: BaaS ativos, White Labels ativos e MRR. Eles não têm
 * resolução diária e não há como inventá-la — "parceiros ativos" é contagem de
 * cadastro e o MRR é apurado sobre a carteira do mês. Desenhá-los dia a dia
 * daria 90 pontos idênticos, uma linha reta fingindo tendência. Então eles
 * respondem ao filtro pela janela, com a resolução que têm: os meses que o
 * intervalo atravessa. Quando a janela toca um mês só, o gráfico DIZ que a
 * série é mensal em vez de desenhar um ponto solto.
 *
 * ── "ATIVIDADE OPERACIONAL" SAIU ────────────────────────────────────────
 *
 * Havia DOIS gráficos para a mesma pergunta: "Atividade Operacional"
 * (transações, MEDs e clientes ativos lado a lado) e "Evolução Atividade
 * Operacional Diária" (TPV, receita, transações e MED). O segundo é
 * estritamente mais informativo — tem as duas séries monetárias — e os dois
 * leem a MESMA `serieDiaria`.
 *
 * Dois gráficos do mesmo dado no mesmo painel não dão duas leituras: dão a
 * dúvida de qual dos dois é o certo. Ficou o DIÁRIO, que já era o gráfico de
 * largura inteira no topo da tela. Nenhuma métrica se perdeu: clientes ativos
 * tem o seu próprio gráfico, logo acima.
 *
 * ── A DATA MÍNIMA DE 01/06 ──────────────────────────────────────────────
 *
 * A série diária começa em 01/06/2026 e nada anterior é exibido (ver
 * `DATA_MINIMA_ATIVIDADE`, em lib/kpi). Enquanto não houver 90 dias desde o
 * piso, as três janelas devolvem o mesmo recorte — e a tela DECLARA isso, em
 * vez de deixar o leitor concluir que 30 e 90 dias são a mesma coisa.
 *
 * ── E A SÉRIE MENSAL TEM O SEU PRÓPRIO PISO ─────────────────────────────
 *
 * Os três gráficos mensais começam no primeiro mês com condição comercial
 * cadastrada (`mensalDisponivelDe`), não no começo da janela. Antes disso o
 * sistema não sabe quantos parceiros havia, e desenhar zero afirmaria que não
 * havia nenhum. Ver `serieMensalCockpit`.
 */

/**
 * Dois dias de calendário são VIZINHOS?
 *
 * `PontoDiario.dia` vem como "dd/mm/aaaa" (pt-BR, em UTC — ver `serieDiaria`),
 * que é o formato que o tooltip exibe. A comparação "dia vs dia anterior" só é
 * honesta entre dias adjacentes, e a série pode ter buracos: um dia sem
 * lançamento fica FORA dela, de propósito.
 */
function diasVizinhos(anterior: string, posterior: string): boolean {
  const parse = (s: string) => {
    const [d, m, a] = s.split('/').map(Number)
    return Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(a)
      ? Date.UTC(a, m - 1, d)
      : NaN
  }
  const a = parse(anterior), b = parse(posterior)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return b - a === 86_400_000
}

/** As três janelas. Conjunto FECHADO, espelho de `RANGES_DIAS` em lib/kpi. */
const RANGES: Array<{ valor: RangeDias; label: string }> = [
  { valor: 7, label: '7 dias' },
  { valor: 30, label: '30 dias' },
  { valor: 90, label: '90 dias' },
]

/**
 * Os gráficos, e a RESOLUÇÃO de cada um.
 *
 * `resolucao` não é decoração: é ela que decide de qual série o gráfico lê
 * (`diario` ou `mensal`) e o que o rodapé declara. Marcar um gráfico mensal
 * como diário faria ele desenhar uma reta de 90 pontos.
 */
type Resolucao = 'diaria' | 'mensal'

interface ChartDef {
  id: string
  title: string
  sub: string
  resolucao: Resolucao
}

const CHART_DEFS: ChartDef[] = [
  { id: 'tpv', title: 'Evolução do TPV', sub: 'Volume total de pagamentos', resolucao: 'diaria' },
  { id: 'receita', title: 'Evolução da Receita', sub: 'Receita tarifária do lançamento diário', resolucao: 'diaria' },
  { id: 'transacoes', title: 'Evolução das Transações', sub: 'Quantidade de transações', resolucao: 'diaria' },
  { id: 'saldo', title: 'Evolução do Saldo', sub: 'Saldo em conta, dia a dia', resolucao: 'diaria' },
  { id: 'med', title: 'Evolução dos MEDs', sub: 'Quantidade e proporção sobre as transações', resolucao: 'diaria' },
  { id: 'clientes', title: 'Clientes Ativos', sub: 'Informado no lançamento de cada dia', resolucao: 'diaria' },
  // O gráfico combinado "BaaS e White Labels Ativos" SAIU. Juntar duas
  // contagens de naturezas diferentes num quadro só não respondia nenhuma das
  // duas perguntas: cada tipo de parceiro tem a sua trajetória.
  { id: 'baas', title: 'Evolução de BaaS Ativos', sub: 'Parceiros BaaS ativos no fim de cada mês', resolucao: 'mensal' },
  { id: 'whitelabel', title: 'Evolução de White Labels Ativos', sub: 'White Labels ativos no fim de cada mês', resolucao: 'mensal' },
  { id: 'takerate', title: 'Receita ÷ TPV', sub: 'Take rate — quanto da movimentação vira receita', resolucao: 'diaria' },
  { id: 'mrr', title: 'Evolução do MRR', sub: 'Receita recorrente mensal', resolucao: 'mensal' },
]

/**
 * O GRÁFICO DIÁRIO — fora da lista reordenável, e de propósito.
 *
 * Ele ocupa a largura inteira e tem o dobro da altura dos outros, então não
 * entra no pareamento de dois por linha nem no arrasta-e-solta: uma peça de
 * tamanho diferente embaralharia o grid a cada movimento. Fica fixo no topo
 * das séries, que é onde a leitura começa.
 *
 * AS VELAS SAÍRAM, todas elas. Mostravam dispersão intramensal com OHLC
 * agregado de observações diárias — mas a pergunta que a operação faz é
 * "como foi cada dia", e para essa pergunta o dia inteiro é o ponto, não a
 * sombra de uma vela mensal.
 */
const DIARIO_DEF: ChartDef = {
  id: 'diario',
  title: 'Evolução Atividade Operacional Diária',
  sub: 'Transações, Receita, TPV e MED, dia a dia',
  resolucao: 'diaria',
}

const DEFAULT_ORDER = CHART_DEFS.map((c) => c.id)
// Chave versionada: a LISTA de gráficos mudou — "Atividade Operacional" saiu
// —, e uma ordem salva com o id antigo não deve sobreviver em silêncio: ela
// deixaria um buraco no grid, porque `charts['atividade']` não existe mais.
// Subir a chave é o que faz cada navegador voltar à ordem padrão uma vez.
const LS_KEY = 'dashboard_chart_order_v7'

const PADRAO_SERIALIZADO = JSON.stringify(DEFAULT_ORDER)
const EVENTO_ORDEM = 'bp-chart-order'

/**
 * A ordem dos gráficos é preferência LOCAL do usuário, guardada no navegador.
 *
 * Lida por `useSyncExternalStore` e não por efeito: o localStorage é um
 * sistema externo ao React, e ler dele com `setState` dentro de um efeito
 * causa uma renderização em cascata a cada montagem. O snapshot precisa ser a
 * STRING crua — devolver um array novo a cada chamada faria o store considerar
 * o valor sempre diferente e entrar em laço.
 */
function assinarOrdem(cb: () => void) {
  window.addEventListener(EVENTO_ORDEM, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENTO_ORDEM, cb)
    window.removeEventListener('storage', cb)
  }
}

function ordemGuardada(): string {
  try {
    return localStorage.getItem(LS_KEY) ?? PADRAO_SERIALIZADO
  } catch {
    return PADRAO_SERIALIZADO
  }
}

/** Valida contra a lista atual: uma ordem salva com ids antigos é descartada. */
function interpretarOrdem(bruto: string): string[] {
  try {
    const parsed = JSON.parse(bruto) as string[]
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_ORDER.length &&
      DEFAULT_ORDER.every((id) => parsed.includes(id))
    ) return parsed
  } catch {}
  return DEFAULT_ORDER
}

/* ========================================================================= *
 * O CONTROLE DE JANELA
 * ========================================================================= */

/**
 * [7 dias] [30 dias] [90 dias] — o controle que mora no topo de cada gráfico.
 *
 * Usa a MESMA gramática visual dos filtros que já existem no produto (o
 * seletor de resultado do Pipeline, o de funil): botão de fio, estado ativo
 * marcado pelo accent. Não é um componente novo de design — é o padrão da
 * casa aplicado aqui.
 */
function SeletorRange({
  valor, onChange, carregando, id,
}: {
  valor: RangeDias
  onChange: (r: RangeDias) => void
  carregando: boolean
  id: string
}) {
  return (
    <div className="flex items-center gap-1" role="group"
      aria-label="Período do gráfico">
      {RANGES.map((r) => {
        const ativo = r.valor === valor
        return (
          <button
            key={r.valor}
            type="button"
            onClick={() => onChange(r.valor)}
            aria-pressed={ativo}
            // O id entra no nome acessível para que um leitor de tela
            // distinga o controle de um gráfico do controle do vizinho —
            // são doze botões "30 dias" na mesma página.
            aria-label={`${r.label} · ${id}`}
            disabled={carregando && !ativo}
            className={cn(
              'px-2.5 py-1 rounded-md t-label border whitespace-nowrap',
              'transition-colors duration-[180ms] ease-bp',
              ativo
                ? 'border-accent/40 bg-accent/10 text-accent-soft'
                : 'border-line text-muted hover:border-line-2 hover:text-fg',
              carregando && !ativo && 'opacity-50 cursor-wait',
            )}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Cabeçalho do gráfico: título, subtítulo, o seletor de janela e — quando a
 * série permite — a variação do último ponto contra o anterior.
 */
function ChartCard({
  title, sub, rodape, delta, children, dragging, onDragStart, onDragOver, onDrop,
  reordering, range, onRange, carregando, id,
}: {
  title: string
  sub: string
  /** Declaração da janela de fato usada. Aparece sob o gráfico. */
  rodape?: string
  delta?: React.ReactNode
  children: React.ReactNode
  dragging: boolean
  reordering: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  range: RangeDias
  onRange: (r: RangeDias) => void
  carregando: boolean
  id: string
}) {
  return (
    <section
      draggable={reordering}
      onDragStart={reordering ? onDragStart : undefined}
      onDragOver={reordering ? (e) => { e.preventDefault(); onDragOver(e) } : undefined}
      onDrop={reordering ? onDrop : undefined}
      className={cn(
        'bg-surface border rounded-2xl p-5 sm:p-6 flex flex-col',
        'transition-[border-color,box-shadow,opacity] duration-[380ms] ease-bp',
        dragging ? 'border-accent opacity-50' : 'border-line hover:border-line-2',
        reordering && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <h3 className="t-h2 text-fg">{title}</h3>
          <p className="t-sm text-subtle mt-1">{sub}</p>
        </div>
        <div className="flex items-center gap-3 flex-none">
          {delta}
          {/* O SELETOR NÃO APARECE EM MODO DE REORDENAR: o card inteiro vira
              alvo de arraste, e um botão dentro de um elemento arrastável
              engole o clique na metade das tentativas. */}
          {!reordering && (
            <SeletorRange valor={range} onChange={onRange} carregando={carregando} id={id} />
          )}
          {reordering && <span className="text-subtle text-lg leading-none select-none" aria-hidden>⠿</span>}
        </div>
      </div>
      <div className="flex-1">{children}</div>
      {rodape && <p className="t-label text-subtle/70 mt-3">{rodape}</p>}
    </section>
  )
}

function NoSeries({ what, alto = false }: { what: string; alto?: boolean }) {
  return (
    <div className={cn('flex items-center justify-center', alto ? 'h-[420px]' : 'h-[190px]')}>
      <EmptyState compact title="Sem série para o período" description={what} />
    </div>
  )
}

/* ========================================================================= *
 * O CACHE DE JANELAS
 * ========================================================================= */

/**
 * As séries por janela, buscadas do backend sob demanda e GUARDADAS.
 *
 * ── POR QUE CACHEAR ────────────────────────────────────────────────────
 *
 * São doze gráficos e três janelas. Sem cache, trocar seis gráficos para 90
 * dias faria seis requisições idênticas. Com cache, a primeira busca serve
 * todas — e voltar para 30 dias não busca nada, porque a primeira carga já
 * veio do servidor.
 *
 * O cache é por SESSÃO DE TELA, não persistido: o Cockpit é dado de hoje, e
 * guardar a série entre visitas mostraria número velho sem avisar.
 *
 * ── O ERRO NÃO É ENGOLIDO ──────────────────────────────────────────────
 *
 * Uma falha de rede devolve a janela anterior e registra a mensagem. O
 * gráfico continua mostrando o que tinha, com o aviso ao lado — em vez de
 * esvaziar e parecer que não há dado.
 */
function useSeries(inicial: SeriesCockpit) {
  const [cache, setCache] = useState<Partial<Record<RangeDias, SeriesCockpit>>>(
    () => ({ [inicial.range]: inicial }),
  )
  const [buscando, setBuscando] = useState<Set<RangeDias>>(() => new Set())
  const [erro, setErro] = useState<string | null>(null)
  // Janelas já pedidas, para que dois gráficos trocando ao mesmo tempo não
  // disparem a mesma requisição duas vezes. É um ref e não estado porque a
  // decisão tem de valer no mesmo tick do clique.
  const pedidas = useRef<Set<RangeDias>>(new Set([inicial.range]))

  const garantir = useCallback((range: RangeDias) => {
    if (pedidas.current.has(range)) return
    pedidas.current.add(range)
    setBuscando((s) => new Set(s).add(range))

    fetch(`/api/dashboard/series?range=${range}d`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Falha ao buscar o período.')
        return r.json() as Promise<SeriesCockpit>
      })
      .then((d) => {
        setCache((c) => ({ ...c, [range]: d }))
        setErro(null)
      })
      .catch((e: unknown) => {
        // Permite tentar de novo: sem isto, uma falha transitória trancaria a
        // janela para o resto da sessão.
        pedidas.current.delete(range)
        setErro(e instanceof Error ? e.message : 'Falha ao buscar o período.')
      })
      .finally(() => {
        setBuscando((s) => {
          const n = new Set(s)
          n.delete(range)
          return n
        })
      })
  }, [])

  return { cache, buscando, erro, garantir, padrao: inicial.range }
}

/* ========================================================================= *
 * O COMPONENTE
 * ========================================================================= */

export default function DashboardCharts({ series }: { series: SeriesCockpit }) {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const bruto = useSyncExternalStore(assinarOrdem, ordemGuardada, () => PADRAO_SERIALIZADO)
  const order = useMemo(() => interpretarOrdem(bruto), [bruto])

  const [reordering, setReordering] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOver = useRef<string | null>(null)

  const { cache, buscando, erro, garantir, padrao } = useSeries(series)

  /**
   * A JANELA DE CADA GRÁFICO, independente.
   *
   * Todos nascem na janela padrão (a que o servidor já renderizou), então a
   * primeira pintura não espera requisição nenhuma e não há estado vazio
   * piscando antes do dado.
   */
  const [ranges, setRanges] = useState<Record<string, RangeDias>>({})
  const rangeDe = useCallback(
    (id: string): RangeDias => ranges[id] ?? padrao,
    [ranges, padrao],
  )

  const trocar = useCallback((id: string, r: RangeDias) => {
    setRanges((atual) => ({ ...atual, [id]: r }))
    garantir(r)
  }, [garantir])

  // Mudar de tema não refaz requisição; mudar de janela, sim — e é o
  // `garantir` acima que o faz, no clique. Este efeito só cobre a janela
  // padrão, que já vem do servidor e portanto nunca dispara busca.
  useEffect(() => { garantir(padrao) }, [garantir, padrao])

  /** A série de um gráfico, na janela dele. Cai no padrão enquanto busca. */
  const serieDe = useCallback((id: string): SeriesCockpit => {
    const r = rangeDe(id)
    return cache[r] ?? cache[padrao] ?? series
  }, [cache, rangeDe, padrao, series])

  // Eixo sem centavos; tooltip e cards seguem com o valor cheio.
  const eixoMoeda = (v: number) => fmtEixoMoeda(v)
  const eixoQtd = (v: number) => quantidadeCompacta(v)
  const eixoPct = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)}%`

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)

  /**
   * A DECLARAÇÃO DA JANELA, sob cada gráfico.
   *
   * Diz o intervalo de fato usado — e, quando o piso de 01/10 encurtou o
   * pedido, diz isso em voz alta. Sem a frase, um usuário que escolhe 90 dias
   * e vê 7 pontos concluiria que o gráfico está quebrado.
   */
  function rodapeDe(id: string): string {
    const s = serieDe(id)
    const def = id === DIARIO_DEF.id ? DIARIO_DEF : CHART_DEFS.find((c) => c.id === id)

    if (def?.resolucao === 'mensal') {
      const n = s.mensal.length
      // O PISO DESTA SÉRIE É O CADASTRO, não a janela. Declará-lo é o que
      // impede a leitura de que o gráfico está incompleto por erro: a série
      // começa onde o dado começa a existir. Ver `serieMensalCockpit`.
      const desde = s.mensalDisponivelDe
        ? ` · desde ${formatMesRef(s.mensalDisponivelDe)}, o primeiro mês com condição cadastrada`
        : ''
      return n <= 1
        ? `Série de resolução mensal${desde || ' — a janela escolhida cobre um mês só.'}`
        : `${n} meses · resolução mensal, não diária${desde}`
    }

    const base = `${s.janela.inicio.split('-').reverse().join('/')} a `
      + `${s.janela.fim.split('-').reverse().join('/')}`
    return s.janela.limitada
      ? `${base} · ${s.janela.dias} dias — a série começa em `
        + `${s.janela.minimo.split('-').reverse().join('/')} e não há dado anterior`
      : `${base} · ${s.janela.dias} dias`
  }

  /**
   * Variação do ÚLTIMO DIA LANÇADO contra o DIA ANTERIOR A ELE.
   *
   * ── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────
   *
   * A versão anterior descartava os zeros ANTES de pegar os dois últimos
   * valores. Com isso, se o dia 05 tivesse saldo zero, "a variação do dia 06"
   * comparava 06 com 04 — e o rodapé continuava dizendo "no dia". Dois dias
   * de distância apresentados como um.
   *
   * Agora os dois pontos são os dois ÚLTIMOS da série, sem filtro. Zero é um
   * valor: um dia com zero MED é um dia sem MED, não um dia sem lançamento —
   * e dia sem lançamento já fica fora da série (`serieDiaria`).
   *
   * A base zero continua recusada, mas por `variacao`, que é quem sabe que
   * dividir por zero não dá percentual. A diferença é onde a recusa acontece:
   * antes ela escondia o par errado, agora ela não desenha seta nenhuma.
   *
   * ── E OS DOIS DIAS PRECISAM SER CONSECUTIVOS ──────────────────────────
   *
   * A série pode ter buracos (dia sem lançamento). Se o último par não for de
   * dias de calendário vizinhos, a comparação não é "dia vs dia anterior" e a
   * seta não é desenhada — é a regra de `parTemporal` (lib/comparacao-temporal)
   * aplicada à granularidade DIÁRIA: as duas janelas têm de ser adjacentes.
   */
  function deltaDiario(id: string, key: keyof PontoDiario, sufixo: string) {
    const serie = serieDe(id).diario
    if (serie.length < 2) return null

    const ultimo = serie[serie.length - 1]
    const penultimo = serie[serie.length - 2]
    if (!diasVizinhos(penultimo.dia, ultimo.dia)) return null

    const a = ultimo[key]
    const b = penultimo[key]
    if (typeof a !== 'number' || typeof b !== 'number') return null
    return <Delta v={variacao(a, b)} sufixo={sufixo} />
  }

  /**
   * Variação do último MÊS contra o anterior.
   *
   * Mesma correção do diário: sem filtro de zero. Uma contagem de parceiros
   * que caiu a zero é informação, e descartá-la fazia o gráfico comparar
   * outubro com agosto chamando de "no mês".
   */
  function deltaMensal(id: string, key: keyof PontoMensalCockpit) {
    const serie = serieDe(id).mensal
    if (serie.length < 2) return null
    const a = serie[serie.length - 1][key]
    const b = serie[serie.length - 2][key]
    if (typeof a !== 'number' || typeof b !== 'number') return null
    return <Delta v={variacao(a, b)} sufixo="no mês" />
  }

  /** Pontos mensais com o rótulo já formatado para o eixo. */
  function mensal(id: string) {
    return serieDe(id).mensal.map((d) => ({ ...d, mes: formatMesRef(d.mes) }))
  }

  function diario(id: string): PontoDiario[] {
    return serieDe(id).diario
  }

  /**
   * EVOLUÇÃO ATIVIDADE OPERACIONAL DIÁRIA
   *
   * Quatro métricas, quatro escalas, nenhuma normalização.
   *
   * TPV e Receita são COLUNAS; Transações e MED são LINHAS — é o conceito
   * visual que esta tela já usava, e ele funciona: volume financeiro se lê
   * como massa, ritmo se lê como curva.
   *
   * ── POR QUE QUATRO EIXOS ────────────────────────────────────────────────
   *
   * TPV e Receita são os dois em reais, mas vivem em ordens de grandeza
   * diferentes: num dia típico o TPV é da casa dos milhões e a receita, dos
   * milhares. No MESMO eixo monetário a barra da receita teria altura de um
   * fio — presente no gráfico e ilegível. Por isso cada um tem o seu eixo
   * monetário, à esquerda e à direita.
   *
   * Transações (contagem) e MED (percentual) ganham eixos próprios, ocultos:
   * quatro réguas desenhadas em volta de um gráfico competem com o gráfico.
   * Elas existem para que cada série use a sua própria amplitude — o oposto de
   * normalizar, que achataria as quatro numa escala inventada de 0 a 100.
   *
   * MED aparece em PERCENTUAL na linha — é como a operação lê MED — e também
   * em quantidade no tooltip. O indicador é um só; o que muda é a unidade.
   */
  function graficoDiarioOperacional() {
    const d = diario(DIARIO_DEF.id)
    if (!hasSeries(d, 'tpv', 'receita', 'transacoes', 'med')) {
      return (
        <div className="h-[420px] flex items-center justify-center">
          <EmptyState compact
            title="Sem atividade diária no período"
            description="O gráfico vem do Lançamento Diário. Sem dias lançados na janela escolhida, não há série para desenhar."
          />
        </div>
      )
    }

    return (
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={d} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />

          {/* Eixos monetários SEPARADOS: TPV à esquerda, Receita à direita. */}
          <YAxis yAxisId="tpv" {...eixo} tickFormatter={eixoMoeda} width={104} />
          <YAxis yAxisId="receita" orientation="right" {...eixo}
            tickFormatter={eixoMoeda} width={92} />

          {/* Ocultos: dão amplitude própria às linhas sem desenhar uma terceira
              e uma quarta régua em volta do quadro. */}
          <YAxis yAxisId="tx" hide />
          <YAxis yAxisId="med" hide />

          <Tooltip
            cursor={cursorBarra(p)}
            content={makeTooltip(
              d, 'rotulo',
              [
                { key: 'tpv', nome: 'TPV', cor: p.s1, formatar: moedaCheia },
                { key: 'receita', nome: 'Receita', cor: p.s2, formatar: moedaCheia },
                { key: 'transacoes', nome: 'Transações', cor: p.fg, formatar: quantidadeCompacta },
                {
                  key: 'medPercentual', nome: 'MED', cor: p.s3,
                  formatar: (v: number) => percentual(v, 2),
                },
                { key: 'med', nome: 'MED (qtd.)', cor: p.s3, formatar: quantidadeCompacta },
              ],
              moedaCheia,
              'TPV à esquerda · Receita à direita · escalas independentes',
            )}
          />
          <Legend {...leg} />

          <Bar yAxisId="tpv" dataKey="tpv" name="TPV" fill={p.s1} {...BAR} />
          <Bar yAxisId="receita" dataKey="receita" name="Receita" fill={p.s2} {...BAR} />
          <Line yAxisId="tx" dataKey="transacoes" name="Transações" stroke={p.fg} {...linha} />
          <Line yAxisId="med" dataKey="medPercentual" name="MED" stroke={p.s3} {...linha} />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  /* ───────────────────────────────────────────────────────────────────────
   * OS GRÁFICOS
   *
   * Cada um é uma FUNÇÃO de id → nó, e não um nó pronto: a série depende da
   * janela daquele gráfico, que muda em tempo de execução. Um mapa de nós
   * montado uma vez fixaria a janela da primeira renderização.
   * ─────────────────────────────────────────────────────────────────────── */
  const charts: Record<string, (id: string) => React.ReactNode> = {
    tpv: (id) => {
      const d = diario(id)
      return hasSeries(d, 'tpv') ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="tpvG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
                <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'rotulo',
              [{ key: 'tpv', nome: 'TPV', cor: p.s1 }], moedaCheia)} />
            <Area type="monotone" dataKey="tpv" stroke={p.s1} fill="url(#tpvG)" {...linha} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhum TPV lançado na janela escolhida." />
    },

    receita: (id) => {
      const d = diario(id)
      return hasSeries(d, 'receita') ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
            <Tooltip cursor={cursorBarra(p)} content={makeTooltip(d, 'rotulo',
              [{ key: 'receita', nome: 'Tarifária', cor: p.s1 }], moedaCheia)} />
            <Bar dataKey="receita" name="Tarifária" fill={p.s1} {...BAR} />
          </BarChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhum lançamento diário na janela escolhida." />
    },

    transacoes: (id) => {
      const d = diario(id)
      return hasSeries(d, 'transacoes') ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...eixo} tickFormatter={eixoQtd} width={88} allowDecimals={false} />
            <Tooltip cursor={cursorBarra(p)} content={makeTooltip(d, 'rotulo',
              [{ key: 'transacoes', nome: 'Transações', cor: p.s1 }], quantidadeCompacta)} />
            <Bar dataKey="transacoes" name="Transações" fill={p.s1} {...BAR} />
          </BarChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhuma transação lançada na janela escolhida." />
    },

    saldo: (id) => {
      const d = diario(id)
      return hasSeries(d, 'saldo') ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="saldoG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s2} stopOpacity={0.20} />
                <stop offset="100%" stopColor={p.s2} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'rotulo',
              [{ key: 'saldo', nome: 'Saldo em conta', cor: p.s2 }], moedaCheia)} />
            <Area type="monotone" dataKey="saldo" stroke={p.s2} fill="url(#saldoG)" {...linha} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhum saldo em conta lançado na janela escolhida." />
    },

    /* MED em DUAS leituras no mesmo gráfico: a barra é a quantidade, a linha é
       a proporção sobre as transações. São o mesmo fato em unidades
       diferentes, e separá-los em dois gráficos obrigaria a alternar entre
       eles para responder "foram muitos?" e "foram muitos para o volume?". */
    med: (id) => {
      const d = diario(id)
      return hasSeries(d, 'med', 'medPercentual') ? (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis yAxisId="qtd" {...eixo} tickFormatter={eixoQtd} width={76} allowDecimals={false} />
            <YAxis yAxisId="pct" orientation="right" {...eixo} tickFormatter={eixoPct} width={56} />
            <Tooltip cursor={cursorBarra(p)} content={makeTooltip(d, 'rotulo', [
              { key: 'med', nome: 'MEDs', cor: p.s3, formatar: quantidadeCompacta },
              {
                key: 'medPercentual', nome: '% das transações', cor: p.s1,
                formatar: (v: number) => percentual(v, 2),
              },
            ], quantidadeCompacta)} />
            <Legend {...leg} />
            <Bar yAxisId="qtd" dataKey="med" name="MEDs" fill={p.s3} {...BAR} />
            <Line yAxisId="pct" type="monotone" dataKey="medPercentual" name="% das transações"
              stroke={p.s1} {...linha} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhum MED lançado na janela escolhida." />
    },

    clientes: (id) => {
      const d = diario(id)
      return hasSeries(d, 'clientesAtivos') ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="cliG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
                <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...eixo} tickFormatter={eixoQtd} width={64} allowDecimals={false} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'rotulo',
              [{ key: 'clientesAtivos', nome: 'Clientes ativos', cor: p.s1 }], quantidadeCompacta)} />
            {/* `connectNulls`: dia que não INFORMOU clientes ativos não é dia de
                zero cliente. A linha atravessa o buraco em vez de mergulhar
                até o eixo — mergulhar afirmaria uma queda que não houve. */}
            <Area type="monotone" dataKey="clientesAtivos" connectNulls
              stroke={p.s1} fill="url(#cliG)" {...linha} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhum dia da janela informou clientes ativos no lançamento diário." />
    },

    takerate: (id) => {
      const d = diario(id)
      return hasSeries(d, 'takeRate') ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="trG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s2} stopOpacity={0.18} />
                <stop offset="100%" stopColor={p.s2} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="rotulo" {...eixo} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...eixo} tickFormatter={eixoPct} width={56} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'rotulo',
              [{ key: 'takeRate', nome: 'Take Rate', cor: p.s2 }], (n) => percentual(n, 3))} />
            <Area type="monotone" dataKey="takeRate" connectNulls
              stroke={p.s2} fill="url(#trG)" {...linha}
              activeDot={{ r: 4, strokeWidth: 3, stroke: p.tipBg, fill: p.s2 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <NoSeries what="O take rate depende de TPV e receita lançados na janela." />
    },

    /* ── OS TRÊS MENSAIS ──────────────────────────────────────────────────
       BaaS, White Labels e MRR não têm grão diário. A contagem de cada mês é
       RECONSTRUÍDA do histórico de `ativo` das condições comerciais (ver
       `evolucaoParceiros`), e o MRR é apurado sobre a carteira vigente no mês.
       Nada é estimado — e por isso a resolução é a que é. */
    baas: (id) => {
      const d = mensal(id)
      if (d.length <= 1) {
        return <SerieMensalCurta nome="BaaS ativos" disponivelDe={serieDe(id).mensalDisponivelDe ?? undefined} />
      }
      return hasSeries(d, 'baasAtivos') ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="baasG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s1} stopOpacity={0.26} />
                <stop offset="100%" stopColor={p.s1} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="mes" {...eixo} />
            <YAxis {...eixo} tickFormatter={eixoQtd} width={56} allowDecimals={false} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'mes',
              [{ key: 'baasAtivos', nome: 'BaaS ativos', cor: p.s1 }], quantidadeCompacta)} />
            <Area type="monotone" dataKey="baasAtivos" stroke={p.s1} fill="url(#baasG)" {...linha} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhuma condição BaaS ativa nos meses com cadastro." />
    },

    whitelabel: (id) => {
      const d = mensal(id)
      if (d.length <= 1) {
        return <SerieMensalCurta nome="White Labels ativos" disponivelDe={serieDe(id).mensalDisponivelDe ?? undefined} />
      }
      return hasSeries(d, 'whiteLabelsAtivos') ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="wlG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s2} stopOpacity={0.26} />
                <stop offset="100%" stopColor={p.s2} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="mes" {...eixo} />
            <YAxis {...eixo} tickFormatter={eixoQtd} width={56} allowDecimals={false} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'mes',
              [{ key: 'whiteLabelsAtivos', nome: 'White Labels ativos', cor: p.s2 }], quantidadeCompacta)} />
            <Area type="monotone" dataKey="whiteLabelsAtivos" stroke={p.s2} fill="url(#wlG)" {...linha} />
          </AreaChart>
        </ResponsiveContainer>
      ) : <NoSeries what="Nenhuma condição White Label ativa nos meses com cadastro." />
    },

    mrr: (id) => {
      const d = mensal(id)
      if (d.length <= 1) {
        return <SerieMensalCurta nome="MRR" disponivelDe={serieDe(id).mensalDisponivelDe ?? undefined} />
      }
      if (!hasSeries(d, 'mrr')) {
        return <NoSeries what="Nenhum cliente ativo com mensalidade contratada." />
      }
      if (isFlat(d, 'mrr')) {
        // Honestidade: um valor repetido não é evolução. Mostramos o valor
        // corrente, não uma linha reta fingindo tendência.
        return (
          <div className="h-[200px] flex items-center justify-center">
            <EmptyState compact
              title="MRR estável na janela"
              description={`O MRR não mudou nos meses do período (${moedaCheia(d[0]?.mrr ?? 0)}). Amplie para 90 dias para ver mais meses.`} />
          </div>
        )
      }
      return (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={d} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={p.s1} stopOpacity={0.20} />
                <stop offset="100%" stopColor={p.s1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="mes" {...eixo} />
            <YAxis {...eixo} tickFormatter={eixoMoeda} width={104} />
            <Tooltip cursor={cursorLinha(p)} content={makeTooltip(d, 'mes',
              [{ key: 'mrr', nome: 'MRR', cor: p.s1 }], moedaCheia)} />
            <Area type="monotone" dataKey="mrr" stroke={p.s1} fill="url(#mrrG)" {...linha} />
          </AreaChart>
        </ResponsiveContainer>
      )
    },
  }

  /** O delta de cada gráfico, na janela dele. */
  function deltaDe(id: string): React.ReactNode {
    switch (id) {
      case 'tpv': return deltaDiario(id, 'tpv', 'no dia')
      case 'receita': return deltaDiario(id, 'receita', 'no dia')
      case 'transacoes': return deltaDiario(id, 'transacoes', 'no dia')
      case 'saldo': return deltaDiario(id, 'saldo', 'no dia')
      case 'med': return deltaDiario(id, 'med', 'no dia')
      case 'clientes': return deltaDiario(id, 'clientesAtivos', 'no dia')
      case 'takerate': return deltaDiario(id, 'takeRate', 'no dia')
      case 'baas': return deltaMensal(id, 'baasAtivos')
      case 'whitelabel': return deltaMensal(id, 'whiteLabelsAtivos')
      case 'mrr': return deltaMensal(id, 'mrr')
      default: return null
    }
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    const next = [...order]
    next.splice(next.indexOf(targetId), 0, ...next.splice(next.indexOf(draggingId), 1))
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {}
    window.dispatchEvent(new Event(EVENTO_ORDEM))
    setDraggingId(null)
  }

  const pares = order.reduce<string[][]>((rows, id, i) => {
    if (i % 2 === 0) rows.push([id]); else rows[rows.length - 1].push(id)
    return rows
  }, [])

  const carregandoDe = (id: string) => buscando.has(rangeDe(id))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="t-h2 text-fg">Séries</h2>
          <p className="t-sm text-subtle mt-1">
            Cada gráfico tem o seu próprio período. A série diária começa em{' '}
            {series.janela.minimo.split('-').reverse().join('/')}.
          </p>
        </div>
        <Button size="sm" variant={reordering ? 'primary' : 'subtle'}
          onClick={() => setReordering((r) => !r)}>
          {reordering ? 'Concluir' : 'Reordenar'}
        </Button>
      </div>

      {/* A FALHA DE REDE APARECE, e o gráfico continua mostrando a janela
          anterior. Esvaziar a tela faria parecer que não há dado. */}
      {erro && (
        <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">
          {erro} Os gráficos seguem mostrando o último período carregado.
        </div>
      )}

      {/* O DIÁRIO ABRE AS SÉRIES, em largura cheia e altura dupla. Fica fora
          do grid de dois-por-linha e fora do arrasta-e-solta: é a peça de
          tamanho diferente, e deixá-la reordenável abriria buracos na grade a
          cada movimento. */}
      <ChartCard
        id={DIARIO_DEF.id}
        title={DIARIO_DEF.title}
        sub={DIARIO_DEF.sub}
        rodape={rodapeDe(DIARIO_DEF.id)}
        range={rangeDe(DIARIO_DEF.id)}
        onRange={(r) => trocar(DIARIO_DEF.id, r)}
        carregando={carregandoDe(DIARIO_DEF.id)}
        dragging={false}
        reordering={false}
        onDragStart={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
      >
        {graficoDiarioOperacional()}
      </ChartCard>

      <div className="space-y-4">
        {pares.map((par, ri) => (
          <div key={ri} className={cn('grid gap-4', par.length === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1')}>
            {par.map((id) => {
              const def = CHART_DEFS.find((c) => c.id === id)!
              return (
                <ChartCard key={id} id={id} title={def.title} sub={def.sub}
                  rodape={rodapeDe(id)}
                  delta={deltaDe(id)}
                  range={rangeDe(id)}
                  onRange={(r) => trocar(id, r)}
                  carregando={carregandoDe(id)}
                  dragging={draggingId === id} reordering={reordering}
                  onDragStart={() => setDraggingId(id)}
                  onDragOver={() => { dragOver.current = id }}
                  onDrop={() => handleDrop(id)}
                >
                  {charts[id](id)}
                </ChartCard>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Uma série MENSAL cuja janela toca um mês só.
 *
 * Desenhar um ponto solto num gráfico de linha não é uma leitura: é um pixel.
 * E interpolar dias dentro do mês inventaria dado. Então o quadro diz o que
 * está acontecendo e aponta a janela que resolve.
 */
/**
 * A SÉRIE MENSAL TEM UM PONTO SÓ — e a tela precisa dizer QUAL dos dois
 * motivos é o caso, porque a conduta de quem lê muda.
 *
 * JANELA CURTA      a janela escolhida cobre um mês só. Ampliar para 90 dias
 *                   resolve, e é o que a mensagem manda fazer.
 *
 * HISTÓRICO CURTO   o cadastro de condições comerciais começou neste mês, e
 *                   ampliar a janela não vai produzir mês nenhum. Dizer
 *                   "escolha 90 dias" aqui seria mandar o usuário a um lugar
 *                   onde não há nada — e ele concluiria, com razão, que o
 *                   gráfico está quebrado.
 *
 * O segundo caso é a razão de `mensalDisponivelDe` existir: antes desta
 * rodada a série desenhava ZERO nos meses sem cadastro, e o gráfico mostrava
 * uma rampa de 0 para 9 que nunca aconteceu.
 */
function SerieMensalCurta({ nome, disponivelDe }: { nome: string; disponivelDe?: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <EmptyState compact
        title={disponivelDe ? 'Histórico ainda de um mês' : 'Série de resolução mensal'}
        description={disponivelDe
          ? `${nome} é apurado por mês, e o cadastro de condições comerciais `
            + `começa em ${formatMesRef(disponivelDe)} — não há mês anterior para `
            + 'comparar. Ampliar a janela não acrescenta pontos: o que falta é '
            + 'histórico, não janela.'
          : `${nome} é apurado por mês, e a janela escolhida cobre um mês só. `
            + 'Escolha 90 dias para ver a trajetória trimestral.'}
      />
    </div>
  )
}
