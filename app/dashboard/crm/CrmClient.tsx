'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import { Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'
import { Donut, type Fatia } from '@/components/financeiro/FinanceiroCharts'
import { useTheme } from '@/components/theme/ThemeProvider'
import {
  paleta, gridProps, axisProps, legendProps, cursorBarra, BAR, LINE, hasSeries,
} from '@/lib/chart-theme'
import { makeTooltip } from '@/components/ui/ChartTooltip'
import { quantidadeCompacta, figuraPercentual } from '@/lib/format-financeiro'
import { MetaBar } from '@/components/ui/StatTile'
import { formatMesRef, META_TIPO_LABELS } from '@/lib/utils'
import { RESULTADO_LABEL } from '@/lib/pipeline'
import type { ResultadoCard } from '@/components/pipeline/tipos'

interface EtapaMetrica {
  id: string
  nome: string
  ativo: boolean
  volume: number
  tempoMedioDias: number | null
  conversao: { entraram: number; avancaram: number; taxa: number | null }
}

interface Responsavel {
  ownerId: string
  ownerNome: string
  total: number
  ganhos: number
  perdas: number
  abertos: number
  taxa: number | null
}

interface FatiaLeads {
  chave: string
  label: string
  total: number
  /** Null com base vazia — nunca 0%. */
  percentual: number | null
}

interface Comparativo {
  atual: number
  anterior: number
  /** Null quando o anterior é zero: sair de zero não é crescimento percentual. */
  variacao: number | null
}

interface MetaPipeline {
  tipo: string
  meta: number
  realizado: number | null
  direcao: string
  unidade: string
  atingimento: number | null
  positivo: boolean
  gap: number | null
}

interface LeituraLeads {
  base: number
  noPipeline: number
  geradosNoPeriodo: Comparativo
  ganhos: Comparativo
  perdidos: Comparativo
  conversao: { atual: number | null; anterior: number | null }
  atividadeAssistida: {
    total: number
    percentual: number | null
    comparativo: Comparativo
  }
  porSegmento: FatiaLeads[]
  porEtapa: FatiaLeads[]
  segmentoPorEtapa: Array<{
    segmento: string; segmentoLabel: string; porEtapa: number[]; total: number
  }>
  etapasDaMatriz: string[]
}

interface Dados {
  funis: Array<{ id: string; nome: string }>
  funil: { id: string; nome: string } | null
  vazio?: boolean
  periodo: string
  periodoAnterior: string
  leads: LeituraLeads
  metasPipeline: MetaPipeline[]
  resumo: {
    totalCards: number; abertos: number; ganhos: number; perdas: number
    taxaConversao: number | null; cicloMedioDias: number | null
  }
  etapas: EtapaMetrica[]
  distribuicao: Array<{ resultado: ResultadoCard; total: number }>
  evolucao: Array<{ periodo: string; criados: number; ganhos: number; perdidos: number }>
  responsaveis: Responsavel[]
  entreFunis: Array<{ origemNome: string; destinoNome: string; total: number }>
  gargalos: Array<{ etapaId: string; etapaNome: string; dias: number; cards: number; vezesMediana: number }>
}

function dias(n: number | null): string {
  if (n === null) return '—'
  if (n < 1) return `${Math.round(n * 24)}h`
  return `${n.toFixed(1)}d`
}

function pct(n: number | null, casas = 1): string {
  return n === null ? '—' : figuraPercentual(n, casas).completo
}

/**
 * Nota do comparativo contra o mês anterior.
 *
 * Variação nula significa que o mês anterior foi ZERO — e aí a frase diz o
 * número absoluto em vez de inventar "+100%" ou "∞%". Sair de zero é um
 * começo, não um crescimento percentual.
 */
function notaComparativo(c: Comparativo, unidade = ''): string {
  if (c.variacao === null) {
    return c.anterior === 0
      ? `${c.anterior}${unidade} no mês anterior`
      : `vs ${c.anterior}${unidade} no mês anterior`
  }
  const sinal = c.variacao >= 0 ? '+' : ''
  return `${sinal}${c.variacao.toFixed(1)}% vs mês anterior (${c.anterior}${unidade})`
}

/** Tom do comparativo. `melhorSubir` inverte para indicadores de perda. */
function tomComparativo(c: Comparativo, melhorSubir = true): 'pos' | 'neg' | undefined {
  if (c.variacao === null || c.variacao === 0) return undefined
  const subiu = c.variacao > 0
  return subiu === melhorSubir ? 'pos' : 'neg'
}

/**
 * VISÃO GERAL DO COMERCIAL — a analítica do Pipeline.
 *
 * A rota continua `/dashboard/crm` e a API continua `/api/crm`: renomear
 * quebraria links salvos e permissões gravadas (`view_crm`) sem ganho nenhum.
 * O que mudou é o NOME na navegação e no título — é por ele que a tela é
 * procurada.
 *
 * Não existe entidade de CRM: todos os números derivam de `Deal` e
 * `PipelineMovimentacao`. Ganho e perda vêm do RESULTADO do card, não da etapa
 * em que ele está — é por isso que um negócio perdido na Negociação aparece ao
 * mesmo tempo como volume da Negociação e como perda.
 */
export default function CrmClient() {
  const { theme } = useTheme()
  const p = useMemo(() => paleta(theme), [theme])

  const [dados, setDados] = useState<Dados | null>(null)
  const [funilId, setFunilId] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    fetch(`/api/crm${funilId ? `?funilId=${funilId}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setDados(d) })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [funilId])

  const serieEvolucao = useMemo(
    () => (dados?.evolucao ?? []).map((e) => ({ ...e, mes: formatMesRef(e.periodo) })),
    [dados],
  )

  const volumeEtapas = useMemo(
    () => (dados?.etapas ?? []).map((e) => ({ etapa: e.nome, volume: e.volume })),
    [dados],
  )

  if (carregando) return <p className="t-sm text-subtle">Carregando...</p>

  if (!dados || dados.vazio || !dados.funil) {
    return (
      <div className="space-y-8">
        <PageHeader title="Visão geral" />
        <Panel padded={false}>
          <EmptyState title="Nenhum funil disponível"
            description="A analítica lê o Pipeline. Sem acesso a um funil ativo não há o que medir." />
        </Panel>
      </div>
    )
  }

  const { resumo, etapas, responsaveis, entreFunis, gargalos, distribuicao } = dados
  const maxVolume = Math.max(...etapas.map((e) => e.volume), 1)

  const fatiasResultado: Fatia[] = distribuicao
    .map((d) => ({ id: d.resultado, nome: RESULTADO_LABEL[d.resultado], valor: d.total }))

  const L = dados.leads

  /**
   * KPIs DE LEADS — volume, desfecho, conversão e acompanhamento.
   *
   * Nenhum valor monetário: o valor comercial de um lead não está validado,
   * então não existe KPI em reais aqui, nem soma, nem ranking.
   *
   * Os três do meio comparam contra o MÊS ANTERIOR. Ganhos e perdas contam
   * pelo mês do DESFECHO, não da criação — um card criado em agosto e ganho
   * em outubro é ganho de outubro.
   */
  const kpisLeads = [
    {
      label: 'Leads no Pipeline', valor: quantidadeCompacta(L.noPipeline),
      nota: `${quantidadeCompacta(L.base)} na base`,
    },
    {
      label: 'Gerados no período', valor: quantidadeCompacta(L.geradosNoPeriodo.atual),
      nota: notaComparativo(L.geradosNoPeriodo), tom: tomComparativo(L.geradosNoPeriodo),
    },
    {
      label: 'Ganhos', valor: quantidadeCompacta(L.ganhos.atual),
      nota: notaComparativo(L.ganhos), tom: tomComparativo(L.ganhos),
    },
    {
      label: 'Perdidos', valor: quantidadeCompacta(L.perdidos.atual),
      // Perder menos é melhor: o tom inverte.
      nota: notaComparativo(L.perdidos), tom: tomComparativo(L.perdidos, false),
    },
    {
      label: 'Conversão', valor: pct(L.conversao.atual, 1),
      nota: L.conversao.anterior === null
        ? 'Ganhos ÷ decididos'
        : `${pct(L.conversao.anterior, 1)} no mês anterior`,
    },
    {
      label: 'Em atividade assistida', valor: quantidadeCompacta(L.atividadeAssistida.total),
      nota: L.atividadeAssistida.percentual === null
        ? 'Card aberto com responsável, ou tarefa / follow-up em aberto'
        : `${pct(L.atividadeAssistida.percentual, 1)} da base · ${notaComparativo(L.atividadeAssistida.comparativo)}`,
      tom: tomComparativo(L.atividadeAssistida.comparativo),
    },
  ]

  const kpis = [
    { label: 'Cards no funil', valor: quantidadeCompacta(resumo.totalCards), nota: 'Total já registrado' },
    { label: 'Em andamento', valor: quantidadeCompacta(resumo.abertos), nota: 'Sem desfecho definido' },
    { label: 'Ganhos', valor: quantidadeCompacta(resumo.ganhos), nota: 'Resultado = Ganho', tom: 'pos' as const },
    { label: 'Perdas', valor: quantidadeCompacta(resumo.perdas), nota: 'Resultado = Perdido', tom: 'neg' as const },
    { label: 'Taxa de conversão', valor: pct(resumo.taxaConversao, 1), nota: 'Ganhos ÷ decididos' },
    { label: 'Ciclo médio', valor: dias(resumo.cicloMedioDias), nota: 'Criação → desfecho' },
  ]

  /** Só os segmentos com lead: barra de zero não informa nada. */
  const segmentosComLead = L.porSegmento.filter((f) => f.total > 0)
  const maxSegmento = Math.max(...segmentosComLead.map((f) => f.total), 1)

  const maxEtapaLeads = Math.max(...L.porEtapa.map((f) => f.total), 1)
  const maxMatriz = Math.max(
    ...L.segmentoPorEtapa.flatMap((linha) => linha.porEtapa), 1,
  )

  const grid = gridProps(p), eixo = axisProps(p), leg = legendProps(p), linha = LINE(p)
  const temEvolucao = hasSeries(serieEvolucao, 'criados', 'ganhos', 'perdidos')

  return (
    <div className="space-y-8">
      <PageHeader
        title="Visão geral"
        sub="Analítica do Comercial. Todos os números derivam do Pipeline e das movimentações já registradas — não existe base paralela."
      />

      <div className="flex flex-wrap items-center gap-2">
        {dados.funis.map((f) => {
          const ativo = f.id === dados.funil!.id
          return (
            <button key={f.id} onClick={() => setFunilId(f.id)}
              aria-current={ativo ? 'true' : undefined}
              className={`px-3.5 py-2 rounded-lg t-sm font-medium border transition-colors duration-[180ms] ease-bp ${
                ativo ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-line text-muted hover:border-line-2 hover:text-fg'
              }`}>
              {f.nome}
            </button>
          )
        })}
      </div>

      {/* ── LEITURA DE LEADS ──────────────────────────────────────────────
          Abre a tela: volume, desfecho, conversão e acompanhamento, cada um
          comparado ao mês anterior. Nenhum valor monetário. */}
      <section className="space-y-4">
        <PanelHeader
          title="Leads"
          sub={`${formatMesRef(dados.periodo)} comparado a ${formatMesRef(dados.periodoAnterior)}. Contagem, percentual e tempo — nunca valor.`}
        />
        <HairlineGrid cols={6}>
          {kpisLeads.map((c) => (
            <HairlineCell key={c.label} className="gap-2">
              <p className="t-label text-subtle">{c.label}</p>
              <p className={`t-figure-sm tabular-nums ${
                c.tom === 'pos' ? 'text-pos' : c.tom === 'neg' ? 'text-neg' : 'text-fg'
              }`}>{c.valor}</p>
              <p className="t-label text-subtle/70">{c.nota}</p>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>

      {/* ── METAS DE PIPELINE ─────────────────────────────────────────────
          As metas comerciais do período, com a unidade governando a leitura:
          conversão em %, geração em quantidade. */}
      {dados.metasPipeline.length > 0 && (
        <section className="space-y-4">
          <PanelHeader
            title="Metas comerciais"
            sub="Definidas em Metas, apuradas sobre estes mesmos leads. A unidade da meta decide se o alvo é percentual ou quantidade."
          />
          <HairlineGrid cols={3}>
            {dados.metasPipeline.map((m) => {
              const fmt = (n: number | null) =>
                n === null ? '—'
                  : m.unidade === 'PERCENTUAL' ? pct(n, 1) : quantidadeCompacta(n)
              return (
                <HairlineCell key={m.tipo} className="gap-2">
                  <p className="t-label text-subtle">{META_TIPO_LABELS[m.tipo] ?? m.tipo}</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`t-figure-sm tabular-nums ${m.positivo ? 'text-pos' : 'text-fg'}`}>
                      {fmt(m.realizado)}
                    </span>
                    <span className="t-sm text-subtle">de {fmt(m.meta)}</span>
                  </div>
                  <MetaBar pct={m.atingimento} />
                  <p className="t-label text-subtle/70">
                    {m.atingimento === null
                      ? 'Sem realizado no período'
                      : `${m.atingimento.toFixed(0)}% do alvo · ${
                          m.direcao === 'MENOR_MELHOR' ? 'menor é melhor' : 'maior é melhor'
                        }`}
                    {m.gap !== null && m.gap > 0 && ` · faltam ${fmt(m.gap)}`}
                  </p>
                </HairlineCell>
              )
            })}
          </HairlineGrid>
        </section>
      )}

      {/* ── DISTRIBUIÇÕES ─────────────────────────────────────────────────
          Por segmento (quem são) e por etapa (onde estão). As duas leem a
          MESMA lista de leads, então os totais fecham. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Leads por segmento"
            sub="Toda a base, inclusive quem ainda não entrou no Pipeline." />
          {/* BARRAS, não donut. O `Donut` do financeiro formata em moeda por
              construção, e usá-lo aqui mostraria "R$ 12,00" para 12 leads. A
              barra também lê melhor com muitos segmentos. */}
          {segmentosComLead.length === 0 ? (
            <div className="mt-5"><EmptyState compact title="Nenhum lead cadastrado"
              description="A distribuição por segmento aparece quando houver lead na base." /></div>
          ) : (
            <div className="mt-5 space-y-3">
              {segmentosComLead.map((f) => (
                <div key={f.chave}>
                  <div className="flex justify-between items-baseline mb-1.5 gap-4">
                    <span className="t-label text-subtle truncate">{f.label}</span>
                    <span className="t-sm text-muted tabular-nums whitespace-nowrap">
                      {quantidadeCompacta(f.total)}
                      {f.percentual !== null && <span className="text-subtle"> · {pct(f.percentual, 1)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent/70 transition-[width] duration-[380ms] ease-bp"
                      style={{ width: `${(f.total / maxSegmento) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Leads por etapa"
            sub="Só os cards ABERTOS: um lead ganho na Negociação não é um lead em Negociação." />
          {L.porEtapa.length === 0 ? (
            <div className="mt-5"><EmptyState compact title="Nenhuma etapa ativa"
              description="O funil precisa de etapas ativas para distribuir os leads." /></div>
          ) : (
            <div className="mt-5 space-y-3">
              {L.porEtapa.map((f) => (
                <div key={f.chave}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="t-label text-subtle">{f.label}</span>
                    <span className="t-sm text-muted tabular-nums">
                      {f.total}
                      {f.percentual !== null && <span className="text-subtle"> · {pct(f.percentual, 0)}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent/70 transition-[width] duration-[380ms] ease-bp"
                      style={{ width: `${(f.total / maxEtapaLeads) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── SEGMENTO × ETAPA ──────────────────────────────────────────────
          Responde "quais segmentos temos em cada etapa" sem virar tabela
          pesada: uma célula por cruzamento, intensidade pelo volume. Segmento
          sem nenhum lead aberto não vira linha — seria uma linha de zeros. */}
      {L.segmentoPorEtapa.length > 0 && (
        <section className="space-y-4">
          <PanelHeader title="Segmento × etapa"
            sub="Cruzamento dos cards abertos. A intensidade da célula é o volume; o número é a contagem." />
          <Panel padded={false} className="overflow-x-auto">
            <Table>
              <THead>
                <HeadRow>
                  <Th>Segmento</Th>
                  {L.etapasDaMatriz.map((nome) => <Th key={nome} align="right">{nome}</Th>)}
                  <Th align="right">Total</Th>
                </HeadRow>
              </THead>
              <tbody>
                {L.segmentoPorEtapa.map((linha) => (
                  <Row key={linha.segmento}>
                    <Td>{linha.segmentoLabel}</Td>
                    {linha.porEtapa.map((n, i) => (
                      <Td key={i} align="right" numeric>
                        <span className="inline-flex items-center justify-end min-w-[2.5rem] px-2 py-0.5 rounded"
                          style={{
                            background: n > 0
                              ? `color-mix(in srgb, var(--color-accent) ${Math.round((n / maxMatriz) * 60) + 8}%, transparent)`
                              : 'transparent',
                          }}>
                          {n > 0 ? n : <span className="text-subtle">—</span>}
                        </span>
                      </Td>
                    ))}
                    <Td align="right" numeric>{linha.total}</Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          </Panel>
        </section>
      )}

      {/* ── KPIs do funil ─────────────────────────────────────────────────
          A leitura do CARD, que é outra pergunta: acima está a base de leads,
          aqui está o que já passou por este funil. */}
      <section className="space-y-4">
        <PanelHeader title="Cards do funil"
          sub="Histórico deste funil, incluindo os cards já decididos." />
        <HairlineGrid cols={6}>
          {kpis.map((c) => (
            <HairlineCell key={c.label} className="gap-2">
              <p className="t-label text-subtle">{c.label}</p>
              <p className={`t-figure-sm tabular-nums ${
                c.tom === 'pos' ? 'text-pos' : c.tom === 'neg' ? 'text-neg' : 'text-fg'
              }`}>{c.valor}</p>
              <p className="t-label text-subtle/70">{c.nota}</p>
            </HairlineCell>
          ))}
        </HairlineGrid>
      </section>

      {/* ── Distribuição e evolução ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Distribuição do pipeline"
            sub="Por resultado. Ganho e Perdido são o desfecho do card, não uma etapa."
          />
          <div className="mt-5">
            {resumo.totalCards === 0 ? (
              <div className="min-h-[13rem] flex items-center justify-center">
                <EmptyState compact title="Nenhum card neste funil"
                  description="A distribuição aparece quando houver cards registrados." />
              </div>
            ) : (
              // CONTAGEM, não moeda: o donut agora recebe o formatador.
              <Donut rotuloTotal="Cards" fatias={fatiasResultado}
                formatar={quantidadeCompacta} rotuloValor="Cards" />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Volume por etapa"
            sub="Quantos cards estão em cada etapa do processo agora."
          />
          <div className="mt-5">
            {etapas.length === 0 ? (
              <div className="min-h-[13rem] flex items-center justify-center">
                <EmptyState compact title="Funil sem etapas ativas"
                  description="Crie etapas na administração do funil." />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={volumeEtapas} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                  <CartesianGrid {...grid} />
                  <XAxis dataKey="etapa" {...eixo} />
                  <YAxis {...eixo} allowDecimals={false} width={44} />
                  <Tooltip cursor={cursorBarra(p)} content={makeTooltip(volumeEtapas, 'etapa',
                    [{ key: 'volume', nome: 'Cards', cor: p.s1 }], quantidadeCompacta)} />
                  <Bar dataKey="volume" name="Cards" fill={p.s1} {...BAR}>
                    {volumeEtapas.map((_, i) => <Cell key={i} fill={p.s1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Evolução"
          sub="Cards criados no mês, e cards decididos (ganhos/perdidos) pela data do desfecho."
        />
        <div className="mt-5">
          {!temEvolucao ? (
            <div className="min-h-[13rem] flex items-center justify-center">
              <EmptyState compact title="Sem série no período"
                description="Nenhum card criado ou decidido nos últimos 12 meses." />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={serieEvolucao} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="mes" {...eixo} />
                <YAxis {...eixo} allowDecimals={false} width={44} />
                <Tooltip cursor={cursorBarra(p)} content={makeTooltip(serieEvolucao, 'mes', [
                  { key: 'criados', nome: 'Criados', cor: p.s3 },
                  { key: 'ganhos', nome: 'Ganhos', cor: p.s1 },
                  { key: 'perdidos', nome: 'Perdidos', cor: p.s2 },
                ], quantidadeCompacta)} />
                <Legend {...leg} />
                <Bar dataKey="criados" name="Criados" fill={p.s3} {...BAR} />
                <Line type="monotone" dataKey="ganhos" name="Ganhos" stroke={p.s1} {...linha} />
                <Line type="monotone" dataKey="perdidos" name="Perdidos" stroke={p.s2} {...linha} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      {/* ── Gargalos ──────────────────────────────────────────────────────── */}
      {gargalos.length > 0 && (
        <Panel>
          <PanelHeader title="Gargalos"
            sub="Etapas em que os cards ficam mais que o dobro do tempo mediano do funil, e que ainda têm card parado." />
          <ul className="mt-4 space-y-2">
            {gargalos.map((g) => (
              <li key={g.etapaId} className="flex items-center justify-between gap-4 flex-wrap border border-warn/25 bg-warn/5 rounded-lg px-4 py-3">
                <div>
                  <p className="t-body font-medium text-fg">{g.etapaNome}</p>
                  <p className="t-sm text-muted mt-0.5">
                    {g.cards} card(s) parado(s) · {g.vezesMediana.toFixed(1)}× a mediana do funil
                  </p>
                </div>
                <Badge tone="warn">{dias(g.dias)} em média</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Por etapa ─────────────────────────────────────────────────────── */}
      <Panel padded={false}>
        <div className="p-5 sm:p-6 pb-0">
          <PanelHeader title="Por etapa" sub="Volume, tempo médio de permanência e conversão para as etapas seguintes." />
        </div>
        <div className="overflow-x-auto mt-4">
          <Table>
            <THead><HeadRow>
              <Th className="pl-5">Etapa</Th><Th align="right">Volume</Th>
              <Th>Distribuição</Th><Th align="right">Tempo médio</Th>
              <Th align="right">Entraram</Th><Th align="right">Conversão</Th>
            </HeadRow></THead>
            <tbody>
              {etapas.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center t-sm text-subtle">Funil sem etapas ativas.</td></tr>
              ) : etapas.map((e) => (
                <Row key={e.id}>
                  <Td className="pl-5 text-fg font-medium">{e.nome}</Td>
                  <Td align="right" numeric>{e.volume}</Td>
                  <Td>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[6rem]">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(e.volume / maxVolume) * 100}%` }} />
                    </div>
                  </Td>
                  <Td align="right" numeric>{dias(e.tempoMedioDias)}</Td>
                  <Td align="right" numeric>{e.conversao.entraram}</Td>
                  <Td align="right" numeric>
                    {e.conversao.taxa === null
                      ? <span className="text-subtle">—</span>
                      : pct(e.conversao.taxa, 1)}
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>

      {/* ── Responsáveis e transferências ─────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel padded={false}>
          <div className="p-5 sm:p-6 pb-0">
            <PanelHeader title="Desempenho por responsável" sub="A taxa considera só os cards já decididos." />
          </div>
          <div className="overflow-x-auto mt-4">
            <Table className="min-w-[26rem]">
              <THead><HeadRow>
                <Th className="pl-5">Responsável</Th><Th align="right">Em andamento</Th>
                <Th align="right">Ganhos</Th><Th align="right">Perdas</Th><Th align="right">Taxa</Th>
              </HeadRow></THead>
              <tbody>
                {responsaveis.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center t-sm text-subtle">Sem cards.</td></tr>
                ) : responsaveis.map((r) => (
                  <Row key={r.ownerId}>
                    <Td className="pl-5 text-fg font-medium">
                      {r.ownerNome}
                      <p className="t-label text-subtle font-normal mt-0.5">{r.total} card(s) no total</p>
                    </Td>
                    <Td align="right" numeric>{r.abertos}</Td>
                    <Td align="right" numeric className="text-pos">{r.ganhos}</Td>
                    <Td align="right" numeric className="text-neg">{r.perdas}</Td>
                    <Td align="right" numeric>
                      {r.taxa === null ? <span className="text-subtle">—</span> : pct(r.taxa, 0)}
                    </Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Entre funis" sub="Transferências que saíram deste funil." />
          {entreFunis.length === 0 ? (
            <p className="t-sm text-subtle mt-4">Nenhuma transferência registrada a partir deste funil.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {entreFunis.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 border-b border-line/60 last:border-0 pb-2 last:pb-0">
                  <span className="t-sm text-muted">
                    {t.origemNome} <span className="text-accent" aria-hidden>→</span> {t.destinoNome}
                  </span>
                  <span className="t-sm font-medium text-fg tabular-nums">{t.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
