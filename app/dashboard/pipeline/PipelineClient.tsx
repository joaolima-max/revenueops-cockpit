'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Panel from '@/components/ui/Panel'
import TransferirModal from '@/components/pipeline/TransferirModal'
import CardDetalheModal, { TOM_RESULTADO } from '@/components/pipeline/CardDetalheModal'
import { RESULTADO_LABEL } from '@/lib/pipeline'
import type { AcessoFunil, FunilResumo, EtapaResumo, Card, ResultadoCard } from '@/components/pipeline/tipos'

interface Lead { id: string; name: string; company: string | null }

/**
 * QUADRO DO PIPELINE.
 *
 * As colunas são as ETAPAS do processo — Prospecção, Qualificação, Proposta,
 * Negociação, Fechamento. Ganho e Perdido NÃO são colunas: são o RESULTADO do
 * card, mostrado no próprio card e alterado na visão de detalhes.
 *
 * O card NASCE de um Lead que já existe (§4). O Pipeline não cadastra Lead, e
 * não tem campo de valor: quem entra aqui escolhe um Lead, a etapa em que
 * clicou e salva. O título do card vem do próprio Lead.
 */
const FORM_VAZIO = { leadId: '' }

/** Filtro de resultado do quadro. "" = todos. */
const FILTROS: Array<{ valor: '' | ResultadoCard; label: string }> = [
  { valor: '', label: 'Todos' },
  { valor: 'EM_ANDAMENTO', label: 'Em andamento' },
  { valor: 'GANHO', label: 'Ganhos' },
  { valor: 'PERDIDO', label: 'Perdidos' },
]

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

  const [filtro, setFiltro] = useState<'' | ResultadoCard>('')
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [criandoEm, setCriandoEm] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [transferir, setTransferir] = useState<Card | null>(null)
  const [detalhe, setDetalhe] = useState<string | null>(null)

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

  const visiveis = useMemo(
    () => (filtro ? cards.filter((c) => c.resultado === filtro) : cards),
    [cards, filtro],
  )

  const porResultado = useMemo(() => ({
    GANHO: cards.filter((c) => c.resultado === 'GANHO').length,
    PERDIDO: cards.filter((c) => c.resultado === 'PERDIDO').length,
    EM_ANDAMENTO: cards.filter((c) => c.resultado === 'EM_ANDAMENTO').length,
  }), [cards])

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
    const lead = leads.find((l) => l.id === form.leadId)
    if (!lead) return
    setSalvando(true); setErro('')
    const res = await fetch('/api/deals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: lead.company || lead.name, leadId: lead.id, etapaId }),
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
        sub={`${cards.length} ${cards.length === 1 ? 'negócio' : 'negócios'} · `
          + `${porResultado.EM_ANDAMENTO} em andamento · ${porResultado.GANHO} ganhos · ${porResultado.PERDIDO} perdidos`}
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

      {/* Filtro por RESULTADO. Ganho e Perdido são um recorte do quadro, nunca
          uma coluna dele. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-label text-subtle mr-1">Resultado</span>
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todos'}
            onClick={() => setFiltro(f.valor)}
            aria-pressed={filtro === f.valor}
            className={`px-3 py-1.5 rounded-lg t-label border transition-colors duration-[180ms] ease-bp ${
              filtro === f.valor
                ? 'border-accent/40 bg-accent/10 text-accent-soft'
                : 'border-line text-muted hover:border-line-2 hover:text-fg'
            }`}
          >
            {f.label}
          </button>
        ))}
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
            const daEtapa = visiveis.filter((c) => c.etapaId === etapa.id)
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
                    <span className="t-label bg-[var(--bp-hover)] text-subtle px-1.5 py-0.5 rounded-full">{daEtapa.length}</span>
                  </div>
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
                      <button
                        onClick={() => setDetalhe(card.id)}
                        className="block text-left w-full t-sm font-medium text-fg leading-tight hover:text-accent-soft transition-colors duration-[180ms]"
                      >
                        {card.title}
                      </button>
                      {(card.cliente || card.lead) && (
                        <p className="t-label text-subtle mt-0.5 truncate">
                          {card.cliente?.nome ?? card.lead?.company ?? card.lead?.name}
                        </p>
                      )}

                      {/* ETAPA + RESULTADO, separados e rotulados. */}
                      <div className="mt-2">
                        <Badge tone={TOM_RESULTADO[card.resultado]}>
                          {RESULTADO_LABEL[card.resultado]}
                        </Badge>
                      </div>

                      <p className="t-label text-subtle mt-1.5">{card.owner.name}</p>

                      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-[180ms]">
                        <button onClick={() => setDetalhe(card.id)}
                          className="t-label text-muted hover:text-fg">Detalhes</button>
                        {acesso?.transferir && (
                          <button onClick={() => setTransferir(card)}
                            className="t-label text-muted hover:text-accent-soft">Transferir</button>
                        )}
                      </div>
                    </div>
                  ))}

                  {acesso?.criar && (criando ? (
                    <div className="bg-surface-2 border border-line rounded-lg p-2.5 space-y-2">
                      <select autoFocus value={form.leadId}
                        onChange={(e) => setForm({ leadId: e.target.value })}
                        className="bp-field w-full t-sm">
                        <option value="">Selecione o lead *</option>
                        {leads.map((l) => <option key={l.id} value={l.id}>{l.company || l.name}</option>)}
                      </select>
                      {leads.length === 0 && (
                        <p className="t-label text-subtle">
                          Nenhum lead cadastrado. Cadastre em <Link href="/dashboard/leads" className="text-accent-soft">Leads</Link>.
                        </p>
                      )}
                      <div className="flex gap-1.5">
                        <Button size="sm" className="flex-1" onClick={() => { setCriandoEm(null); setForm(FORM_VAZIO) }}>Cancelar</Button>
                        <Button size="sm" variant="primary" className="flex-1"
                          disabled={salvando || !form.leadId}
                          onClick={() => criar(etapa.id)}>
                          {salvando ? '...' : 'Criar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setCriandoEm(etapa.id); setForm(FORM_VAZIO) }}
                      className="w-full py-2 t-sm text-subtle hover:text-muted hover:bg-[var(--bp-hover)] rounded-lg transition-colors duration-[180ms]">
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

      {detalhe && (
        <CardDetalheModal
          cardId={detalhe}
          onFechar={() => setDetalhe(null)}
          onMudou={recarregar}
        />
      )}
    </div>
  )
}
