'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface EtapaMetrica {
  id: string
  nome: string
  tipo: string
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
  valorAberto: number
  taxa: number | null
}

interface Dados {
  funis: Array<{ id: string; nome: string }>
  funil: { id: string; nome: string } | null
  vazio?: boolean
  resumo: {
    totalCards: number; abertos: number; ganhos: number; perdas: number
    valorAberto: number; cicloMedioDias: number | null
  }
  etapas: EtapaMetrica[]
  responsaveis: Responsavel[]
  entreFunis: Array<{ origemNome: string; destinoNome: string; total: number }>
  gargalos: Array<{ etapaId: string; etapaNome: string; dias: number; cards: number; vezesMediana: number }>
}

function dias(n: number | null): string {
  if (n === null) return '—'
  if (n < 1) return `${Math.round(n * 24)}h`
  return `${n.toFixed(1)}d`
}

export default function CrmClient() {
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

  if (carregando) return <p className="t-sm text-subtle">Carregando...</p>

  if (!dados || dados.vazio || !dados.funil) {
    return (
      <div className="space-y-8">
        <PageHeader title="CRM" />
        <Panel padded={false}>
          <EmptyState title="Nenhum funil disponível"
            description="A analítica lê o Pipeline. Sem acesso a um funil ativo não há o que medir." />
        </Panel>
      </div>
    )
  }

  const { resumo, etapas, responsaveis, entreFunis, gargalos } = dados
  const maxVolume = Math.max(...etapas.map((e) => e.volume), 1)

  const cards: Array<{ label: string; valor: string; tom?: BadgeTone }> = [
    { label: 'Cards no funil', valor: String(resumo.totalCards) },
    { label: 'Em aberto', valor: String(resumo.abertos) },
    { label: 'Valor em aberto', valor: formatCurrency(resumo.valorAberto) },
    { label: 'Ganhos', valor: String(resumo.ganhos), tom: 'pos' },
    { label: 'Perdas', valor: String(resumo.perdas), tom: 'neg' },
    { label: 'Ciclo médio', valor: dias(resumo.cicloMedioDias) },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="CRM"
        sub="Analítica do Pipeline. Todos os números derivam das movimentações já registradas — não existe base paralela."
      />

      <div className="flex flex-wrap items-center gap-2">
        {dados.funis.map((f) => {
          const ativo = f.id === dados.funil!.id
          return (
            <button key={f.id} onClick={() => setFunilId(f.id)}
              className={`px-3.5 py-2 rounded-lg t-sm font-medium border transition-colors duration-[180ms] ${
                ativo ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-line text-muted hover:text-fg'
              }`}>
              {f.nome}
            </button>
          )
        })}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {cards.map((c) => (
          <Panel key={c.label} className="!p-4">
            <p className="t-label text-subtle">{c.label}</p>
            <p className={`t-h2 mt-1.5 tabular-nums ${
              c.tom === 'pos' ? 'text-pos' : c.tom === 'neg' ? 'text-neg' : 'text-fg'
            }`}>{c.valor}</p>
          </Panel>
        ))}
      </div>

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

      <Panel padded={false}>
        <div className="p-5 sm:p-6 pb-0">
          <PanelHeader title="Por etapa" sub="Volume, tempo médio de permanência e conversão para as etapas seguintes." />
        </div>
        <div className="overflow-x-auto mt-4">
          <Table>
            <THead><HeadRow>
              <Th>Etapa</Th><Th align="right">Volume</Th>
              <Th>Distribuição</Th><Th align="right">Tempo médio</Th>
              <Th align="right">Entraram</Th><Th align="right">Conversão</Th>
            </HeadRow></THead>
            <tbody>
              {etapas.map((e) => (
                <Row key={e.id} className={e.ativo ? undefined : 'opacity-60'}>
                  <Td className="text-fg font-medium">
                    {e.nome}
                    {e.tipo !== 'NORMAL' && (
                      <Badge tone={e.tipo === 'GANHO' ? 'pos' : 'neg'} className="ml-2">
                        {e.tipo === 'GANHO' ? 'Ganho' : 'Perdido'}
                      </Badge>
                    )}
                  </Td>
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
                      : formatPercent(e.conversao.taxa, 1)}
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel padded={false}>
          <div className="p-5 sm:p-6 pb-0">
            <PanelHeader title="Por responsável" sub="A taxa considera só os cards já decididos." />
          </div>
          <div className="overflow-x-auto mt-4">
            <Table className="min-w-[26rem]">
              <THead><HeadRow>
                <Th>Responsável</Th><Th align="right">Abertos</Th>
                <Th align="right">Ganhos</Th><Th align="right">Perdas</Th><Th align="right">Taxa</Th>
              </HeadRow></THead>
              <tbody>
                {responsaveis.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center t-sm text-subtle">Sem cards.</td></tr>
                ) : responsaveis.map((r) => (
                  <Row key={r.ownerId}>
                    <Td className="text-fg font-medium">
                      {r.ownerNome}
                      <p className="t-label text-subtle font-normal mt-0.5">{formatCurrency(r.valorAberto)} em aberto</p>
                    </Td>
                    <Td align="right" numeric>{r.abertos}</Td>
                    <Td align="right" numeric className="text-pos">{r.ganhos}</Td>
                    <Td align="right" numeric className="text-neg">{r.perdas}</Td>
                    <Td align="right" numeric>
                      {r.taxa === null ? <span className="text-subtle">—</span> : formatPercent(r.taxa, 0)}
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
