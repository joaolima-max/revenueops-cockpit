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
import { formatMesRef } from '@/lib/utils'
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

interface Dados {
  funis: Array<{ id: string; nome: string }>
  funil: { id: string; nome: string } | null
  vazio?: boolean
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

  const kpis = [
    { label: 'Cards no funil', valor: quantidadeCompacta(resumo.totalCards), nota: 'Total já registrado' },
    { label: 'Em andamento', valor: quantidadeCompacta(resumo.abertos), nota: 'Sem desfecho definido' },
    { label: 'Ganhos', valor: quantidadeCompacta(resumo.ganhos), nota: 'Resultado = Ganho', tom: 'pos' as const },
    { label: 'Perdas', valor: quantidadeCompacta(resumo.perdas), nota: 'Resultado = Perdido', tom: 'neg' as const },
    { label: 'Taxa de conversão', valor: pct(resumo.taxaConversao, 1), nota: 'Ganhos ÷ decididos' },
    { label: 'Ciclo médio', valor: dias(resumo.cicloMedioDias), nota: 'Criação → desfecho' },
  ]

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

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
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
              <Donut rotuloTotal="Cards" fatias={fatiasResultado} />
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
