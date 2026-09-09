'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import PageHeader from '@/components/dashboard/PageHeader'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import TransferirModal from '@/components/pipeline/TransferirModal'
import HistoricoModal from '@/components/pipeline/HistoricoModal'
import type { AcessoFunil, FunilResumo, EtapaResumo, Card } from '@/components/pipeline/tipos'

interface Lead { id: string; name: string; company: string | null }

const FORM_VAZIO = { title: '', value: '', probability: '30', leadId: '' }

export default function PipelineClient({ leads, podeAdministrar }: {
  leads: Lead[]
  podeAdministrar: boolean
}) {
  const [funis, setFunis] = useState<FunilResumo[]>([])
  const [funil, setFunil] = useState<FunilResumo | null>(null)
  const [etapas, setEtapas] = useState<EtapaResumo[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [acesso, setAcesso] = useState<AcessoFunil | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [funilId, setFunilId] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  const [arrastando, setArrastando] = useState<string | null>(null)
  const [criandoEm, setCriandoEm] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [transferir, setTransferir] = useState<Card | null>(null)
  const [historico, setHistorico] = useState<Card | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = funilId ? `?funilId=${funilId}` : ''
    fetch(`/api/pipeline/board${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setFunis(d.funis ?? [])
        setFunil(d.funil ?? null)
        setEtapas(d.etapas ?? [])
        setCards(d.cards ?? [])
        setAcesso(d.acesso ?? null)
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [funilId, versao])

  const totalPonderado = useMemo(
    () => cards.reduce((s, c) => s + c.value * (c.probability / 100), 0),
    [cards],
  )

  async function mover(cardId: string, etapaId: string) {
    const antes = cards
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, etapaId } : c)))
    const res = await fetch(`/api/pipeline/cards/${cardId}/mover`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etapaId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setCards(antes)
      setErro(d.error ?? 'Não foi possível mover o card.')
    }
  }

  async function criar(etapaId: string) {
    if (!form.title || !form.value) return
    setSalvando(true); setErro('')
    const res = await fetch('/api/deals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        value: parseFloat(form.value),
        probability: parseInt(form.probability) || 0,
        leadId: form.leadId || null,
        etapaId,
      }),
    })
    if (res.ok) {
      setCriandoEm(null); setForm(FORM_VAZIO); recarregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar o card.')
    }
    setSalvando(false)
  }

  if (carregando) return <p className="t-sm text-subtle">Carregando...</p>

  if (funis.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Pipeline" />
        <Panel padded={false}>
          <EmptyState
            title="Nenhum funil disponível"
            description="Você não tem acesso a nenhum funil ativo. Um administrador precisa liberar o acesso ou criar um funil."
            action={podeAdministrar ? <Link href="/dashboard/pipeline/funis"><Button variant="primary">Gerenciar funis</Button></Link> : undefined}
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pipeline"
        sub={`${cards.length} ${cards.length === 1 ? 'negócio' : 'negócios'} · Valor ponderado ${formatCurrency(totalPonderado)}`}
        actions={podeAdministrar
          ? <Link href="/dashboard/pipeline/funis"><Button>Gerenciar funis</Button></Link>
          : undefined}
      />

      {/* Seletor de funis — só os que a alçada do usuário deixa ver. */}
      <div className="flex flex-wrap items-center gap-2">
        {funis.map((f) => {
          const ativo = f.id === funil?.id
          return (
            <button
              key={f.id}
              onClick={() => { setFunilId(f.id); setErro('') }}
              aria-current={ativo ? 'true' : undefined}
              className={`px-3.5 py-2 rounded-lg t-sm font-medium border transition-colors duration-[180ms] ease-bp ${
                ativo ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-line text-muted hover:border-line-2 hover:text-fg'
              }`}
            >
              {f.nome}
              {f.area && <span className="ml-2 t-label text-subtle">{f.area}</span>}
            </button>
          )
        })}
      </div>

      {erro && (
        <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
      )}

      {etapas.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Este funil ainda não tem etapas ativas"
            description="Crie etapas na administração do funil para começar a usar o quadro."
          />
        </Panel>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 items-start">
          {etapas.map((etapa) => {
            const daEtapa = cards.filter((c) => c.etapaId === etapa.id)
            const total = daEtapa.reduce((s, c) => s + c.value, 0)
            const criando = criandoEm === etapa.id

            return (
              <div
                key={etapa.id}
                className="flex-shrink-0 w-64"
                onDragOver={(e) => { if (acesso?.mover) e.preventDefault() }}
                onDrop={() => { if (arrastando && acesso?.mover) { mover(arrastando, etapa.id); setArrastando(null) } }}
              >
                <div className="bg-surface border border-line rounded-t-xl px-3 py-2.5 flex items-center justify-between border-t-2"
                  style={etapa.cor ? { borderTopColor: etapa.cor } : undefined}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="t-label font-semibold text-fg truncate">{etapa.nome}</span>
                    <span className="t-label bg-white/[0.06] text-subtle px-1.5 py-0.5 rounded-full">{daEtapa.length}</span>
                  </div>
                  <span className="t-label text-subtle">{formatCurrency(total)}</span>
                </div>

                <div className="bg-surface border-x border-b border-line rounded-b-xl p-2 space-y-2 min-h-20">
                  {daEtapa.map((card) => (
                    <div
                      key={card.id}
                      draggable={acesso?.mover}
                      onDragStart={() => setArrastando(card.id)}
                      className={`bg-surface-2 border border-line rounded-lg p-3 group transition-colors duration-[180ms] ease-bp hover:border-line-2 ${
                        acesso?.mover ? 'cursor-grab active:cursor-grabbing' : ''
                      }`}
                    >
                      <p className="t-sm font-medium text-fg leading-tight">{card.title}</p>
                      {(card.cliente || card.lead) && (
                        <p className="t-label text-subtle mt-0.5 truncate">
                          {card.cliente?.nome ?? card.lead?.company ?? card.lead?.name}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="t-sm font-semibold text-pos">{formatCurrency(card.value)}</span>
                        <span className="t-label text-subtle">{card.probability}%</span>
                      </div>
                      <p className="t-label text-subtle mt-0.5">{card.owner.name}</p>

                      <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-[180ms]">
                        {acesso?.transferir && (
                          <button onClick={() => setTransferir(card)}
                            className="t-label text-muted hover:text-accent-soft">Transferir</button>
                        )}
                        <button onClick={() => setHistorico(card)}
                          className="t-label text-muted hover:text-fg">Histórico</button>
                      </div>
                    </div>
                  ))}

                  {acesso?.criar && (criando ? (
                    <div className="bg-surface-2 border border-line rounded-lg p-2.5 space-y-2">
                      <input autoFocus value={form.title} placeholder="Título *"
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                        className="w-full bg-bg border border-line rounded px-2 py-1.5 t-sm text-fg focus:outline-none focus:border-accent" />
                      <input type="number" value={form.value} placeholder="Valor R$ *"
                        onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
                        className="w-full bg-bg border border-line rounded px-2 py-1.5 t-sm text-fg focus:outline-none focus:border-accent" />
                      <div className="grid grid-cols-2 gap-1.5">
                        <input type="number" min="0" max="100" value={form.probability} placeholder="% prob."
                          onChange={(e) => setForm((p) => ({ ...p, probability: e.target.value }))}
                          className="w-full bg-bg border border-line rounded px-2 py-1.5 t-sm text-fg focus:outline-none focus:border-accent" />
                        <select value={form.leadId}
                          onChange={(e) => setForm((p) => ({ ...p, leadId: e.target.value }))}
                          className="w-full bg-bg border border-line rounded px-2 py-1.5 t-sm text-fg focus:outline-none focus:border-accent">
                          <option value="">Lead opc.</option>
                          {leads.map((l) => <option key={l.id} value={l.id}>{l.company || l.name}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="flex-1" onClick={() => { setCriandoEm(null); setForm(FORM_VAZIO) }}>Cancelar</Button>
                        <Button size="sm" variant="primary" className="flex-1"
                          disabled={salvando || !form.title || !form.value}
                          onClick={() => criar(etapa.id)}>
                          {salvando ? '...' : 'Criar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setCriandoEm(etapa.id); setForm(FORM_VAZIO) }}
                      className="w-full py-2 t-sm text-subtle hover:text-muted hover:bg-white/[0.03] rounded-lg transition-colors duration-[180ms]">
                      + Adicionar
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {funil && !acesso?.mover && (
        <Badge tone="neutral">Você tem acesso somente de leitura a este funil</Badge>
      )}

      {transferir && funil && (
        <TransferirModal
          card={transferir}
          funilAtual={funil}
          onFechar={() => setTransferir(null)}
          onTransferido={() => { setTransferir(null); recarregar() }}
        />
      )}

      {historico && (
        <HistoricoModal card={historico} onFechar={() => setHistorico(null)} />
      )}
    </div>
  )
}
