'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { RESULTADO_LABEL, RESULTADOS } from '@/lib/pipeline'
import { SEGMENTO_CRM_LABELS, SEGMENTO_LABELS, CANAL_LABELS } from '@/lib/utils'
import type { ResultadoCard } from './tipos'

/** Tom do badge de resultado. Cor comunica desfecho, não categoria. */
export const TOM_RESULTADO: Record<ResultadoCard, BadgeTone> = {
  EM_ANDAMENTO: 'accent',
  GANHO: 'pos',
  PERDIDO: 'neg',
}

interface Detalhe {
  id: string
  title: string
  notes: string | null
  resultado: ResultadoCard
  resultadoEm: string | null
  createdAt: string
  updatedAt: string
  expectedAt: string | null
  owner: { id: string; name: string; email: string }
  funil: { id: string; nome: string; area: string | null } | null
  etapa: { id: string; nome: string; ordem: number } | null
  cliente: { id: string; nome: string; cnpj: string | null } | null
  lead: {
    id: string; name: string; company: string | null; cnpj: string | null
    email: string | null; phone: string | null; position: string | null
    segmento: string | null; canal: string | null; status: string
    source: string | null; createdAt: string
  } | null
}

interface Movimentacao {
  id: string
  tipo: 'CRIACAO' | 'MOVIMENTO_ETAPA' | 'TRANSFERENCIA_FUNIL' | 'MUDANCA_RESULTADO'
  observacao: string | null
  createdAt: string
  user: { name: string }
  funilOrigem: { nome: string } | null
  etapaOrigem: { nome: string } | null
  funilDestino: { nome: string }
  etapaDestino: { nome: string }
  resultadoAnterior: ResultadoCard | null
  resultadoNovo: ResultadoCard | null
}

interface Comentario {
  id: string
  texto: string
  createdAt: string
  autor: { id: string; name: string }
}

interface AcessoCard {
  ver: boolean; editar: boolean; mover: boolean
  criar: boolean; transferir: boolean; administrar: boolean
}

interface Resposta {
  card?: Detalhe
  historico?: Movimentacao[]
  comentarios?: Comentario[]
  acesso?: AcessoCard
  erro?: string
}

const TIPO_MOV: Record<Movimentacao['tipo'], { label: string; tone: BadgeTone }> = {
  CRIACAO: { label: 'Criação', tone: 'neutral' },
  MOVIMENTO_ETAPA: { label: 'Etapa', tone: 'accent' },
  TRANSFERENCIA_FUNIL: { label: 'Transferência', tone: 'warn' },
  MUDANCA_RESULTADO: { label: 'Resultado', tone: 'pos' },
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const fmt = (iso: string | null | undefined) => (iso ? QUANDO.format(new Date(iso)) : '—')

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="t-label text-subtle">{rotulo}</p>
      <p className="t-sm text-fg mt-1 break-words">{children ?? '—'}</p>
    </div>
  )
}

/**
 * DETALHES DO CARD — a visão completa de uma oportunidade.
 *
 * Três blocos: identificação (lead, empresa, CNPJ, responsável, funil, etapa,
 * resultado, datas), histórico cronológico e anotações.
 *
 * ETAPA e RESULTADO aparecem separados e rotulados. É a mudança conceitual
 * desta rodada: o card mostra "Etapa: Negociação / Resultado: Em andamento",
 * e não uma coluna chamada "Ganho" que apagava a etapa em que o negócio
 * realmente fechou.
 */
export default function CardDetalheModal({
  cardId, onFechar, onMudou,
}: {
  cardId: string
  onFechar: () => void
  onMudou: () => void
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [historico, setHistorico] = useState<Movimentacao[]>([])
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [acesso, setAcesso] = useState<AcessoCard | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [novoComentario, setNovoComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [salvandoResultado, setSalvandoResultado] = useState(false)

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (): Promise<Resposta> => {
    const res = await fetch(`/api/pipeline/cards/${cardId}`)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return { erro: d.error ?? 'Não foi possível carregar o card.' }
    }
    return (await res.json()) as Resposta
  }, [cardId])

  const aplicar = useCallback((d: Resposta) => {
    if (d.erro) {
      setErro(d.erro)
    } else {
      setErro('')
      setDetalhe(d.card ?? null)
      setHistorico(d.historico ?? [])
      setComentarios(d.comentarios ?? [])
      setAcesso(d.acesso ?? null)
    }
    setCarregando(false)
  }, [])

  const carregar = useCallback(async () => { aplicar(await buscar()) }, [buscar, aplicar])

  useEffect(() => {
    let vivo = true
    buscar().then((d) => { if (vivo) aplicar(d) })
    return () => { vivo = false }
  }, [buscar, aplicar])

  async function mudarResultado(novo: ResultadoCard) {
    if (!detalhe || novo === detalhe.resultado) return
    setSalvandoResultado(true); setErro('')
    const res = await fetch(`/api/pipeline/cards/${cardId}/resultado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultado: novo }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível alterar o resultado.')
    } else {
      await carregar()
      onMudou()
    }
    setSalvandoResultado(false)
  }

  /**
   * EXCLUIR O CARD — **não** o lead.
   *
   * A confirmação diz isso com todas as letras, porque é a dúvida real de
   * quem clica: o botão fica ao lado de Ganho e Perdido, e "excluir" num
   * contexto comercial soa como "descartar o contato". O lead continua em
   * Leads, com histórico, e pode receber um card novo depois.
   */
  async function excluirCard() {
    if (!detalhe) return

    const lead = detalhe.lead
    const ok = window.confirm(
      `Excluir o card "${detalhe.title}" do Pipeline?\n\n`
      + `O card sai do quadro e deixa de contar nos indicadores.\n\n`
      + (lead
        ? `O LEAD "${lead.name}" NÃO será excluído: continua em Leads, com o `
          + `histórico dele, e pode receber um card novo depois.\n\n`
        : '')
      + `O histórico do card (movimentações e anotações) é preservado.`,
    )
    if (!ok) return

    setExcluindo(true); setErro('')
    const res = await fetch(`/api/pipeline/cards/${cardId}`, { method: 'DELETE' })
    if (res.ok) {
      onMudou()
      onFechar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível excluir o card.')
      setExcluindo(false)
    }
  }

  async function comentar(e: React.FormEvent) {
    e.preventDefault()
    const texto = novoComentario.trim()
    if (!texto) return
    setEnviando(true); setErro('')
    const res = await fetch(`/api/pipeline/cards/${cardId}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    })
    if (res.ok) {
      const d = await res.json()
      setComentarios((p) => [d.comentario, ...p])
      setNovoComentario('')
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar a anotação.')
    }
    setEnviando(false)
  }

  const podeResultado = !!acesso && (acesso.mover || acesso.editar)
  // EXCLUIR exige `editar`, não `mover`: tirar o card do quadro é mais forte
  // que arrastá-lo de coluna. Espelha `podeExcluirCard` no servidor.
  const podeExcluir = !!acesso && acesso.editar

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-[var(--bp-shadow-overlay)]">
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-line flex-none">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg bp-truncate">{detalhe?.title ?? 'Card'}</h2>
            {detalhe && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <Badge>Etapa: {detalhe.etapa?.nome ?? '—'}</Badge>
                <Badge tone={TOM_RESULTADO[detalhe.resultado]}>
                  Resultado: {RESULTADO_LABEL[detalhe.resultado]}
                </Badge>
              </div>
            )}
          </div>
          <button onClick={onFechar} className="text-subtle hover:text-fg flex-none" aria-label="Fechar">✕</button>
        </div>

        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          {erro && (
            <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
          )}

          {carregando ? (
            <p className="t-sm text-subtle">Carregando…</p>
          ) : !detalhe ? (
            <p className="t-sm text-subtle">Card não encontrado.</p>
          ) : (
            <>
              {/* ── Identificação ───────────────────────────────────────── */}
              <section className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Lead">
                  {detalhe.lead
                    ? <Link href={`/dashboard/leads/${detalhe.lead.id}`} className="text-accent-soft hover:underline">
                        {detalhe.lead.name}
                      </Link>
                    : '—'}
                </Campo>
                <Campo rotulo="Empresa">{detalhe.lead?.company ?? detalhe.cliente?.nome ?? '—'}</Campo>
                <Campo rotulo="CNPJ">{detalhe.lead?.cnpj ?? detalhe.cliente?.cnpj ?? '—'}</Campo>
                <Campo rotulo="Responsável">{detalhe.owner.name}</Campo>
                <Campo rotulo="Funil">
                  {detalhe.funil?.nome ?? '—'}
                  {detalhe.funil?.area && <span className="text-subtle"> · {detalhe.funil.area}</span>}
                </Campo>
                <Campo rotulo="Cliente vinculado">{detalhe.cliente?.nome ?? '—'}</Campo>
                <Campo rotulo="Criado em">{fmt(detalhe.createdAt)}</Campo>
                <Campo rotulo="Última movimentação">
                  {fmt(historico[0]?.createdAt ?? detalhe.updatedAt)}
                </Campo>
                {detalhe.resultado !== 'EM_ANDAMENTO' && (
                  <Campo rotulo="Resultado definido em">{fmt(detalhe.resultadoEm)}</Campo>
                )}
                {detalhe.lead?.email && <Campo rotulo="E-mail do lead">{detalhe.lead.email}</Campo>}
                {detalhe.lead?.phone && <Campo rotulo="Telefone do lead">{detalhe.lead.phone}</Campo>}
                {/* RÓTULO, não o valor do enum: a tela mostrava
                    "CRYPTO_EXCHANGES" onde devia mostrar "Cripto Exchanges". */}
                {detalhe.lead?.segmento && (
                  <Campo rotulo="Segmento">
                    {SEGMENTO_CRM_LABELS[detalhe.lead.segmento]
                      ?? SEGMENTO_LABELS[detalhe.lead.segmento]
                      ?? detalhe.lead.segmento}
                  </Campo>
                )}
                {detalhe.lead?.canal && (
                  <Campo rotulo="Canal de origem">
                    {CANAL_LABELS[detalhe.lead.canal] ?? detalhe.lead.canal}
                  </Campo>
                )}
              </section>

              {detalhe.notes && (
                <section>
                  <p className="t-label text-subtle">Observações do cadastro</p>
                  <p className="t-sm text-muted mt-1 whitespace-pre-wrap">{detalhe.notes}</p>
                </section>
              )}

              {/* ── Resultado ───────────────────────────────────────────── */}
              <section className="border-t border-line pt-5">
                <p className="t-label text-subtle">Resultado</p>
                <p className="t-sm text-muted mt-1">
                  Ganho e Perdido são o desfecho do negócio, não uma etapa. O card permanece
                  na etapa em que está.
                </p>
                <div className="flex gap-2 flex-wrap mt-3">
                  {RESULTADOS.map((r) => {
                    const ativo = detalhe.resultado === r
                    return (
                      <Button
                        key={r}
                        size="sm"
                        variant={ativo ? 'primary' : 'subtle'}
                        disabled={!podeResultado || salvandoResultado || ativo}
                        onClick={() => mudarResultado(r)}
                      >
                        {RESULTADO_LABEL[r]}
                      </Button>
                    )
                  })}
                </div>
                {!podeResultado && (
                  <p className="t-label text-subtle mt-2">
                    Você tem acesso somente de leitura a este funil.
                  </p>
                )}
              </section>

              {/* ── Histórico ───────────────────────────────────────────── */}
              <section className="border-t border-line pt-5">
                <p className="t-label text-subtle mb-3">Histórico</p>
                {historico.length === 0 ? (
                  <p className="t-sm text-subtle">
                    Nenhuma movimentação registrada. Cards anteriores ao pipeline multi-funil só
                    passam a gravar histórico a partir da próxima movimentação.
                  </p>
                ) : (
                  <ol className="space-y-4">
                    {historico.map((m) => {
                      const t = TIPO_MOV[m.tipo]
                      return (
                        <li key={m.id} className="border-l border-line pl-4 relative">
                          <span aria-hidden className="absolute -left-[3px] top-1.5 w-[5px] h-[5px] rotate-45 rounded-[1px] bg-subtle" />
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone={t.tone}>{t.label}</Badge>
                            <span className="t-label text-subtle">{fmt(m.createdAt)}</span>
                          </div>
                          <p className="t-sm text-fg mt-1.5">
                            {m.tipo === 'MUDANCA_RESULTADO' && m.resultadoNovo
                              ? <>
                                  {RESULTADO_LABEL[m.resultadoAnterior ?? 'EM_ANDAMENTO']}
                                  {' → '}
                                  {RESULTADO_LABEL[m.resultadoNovo]}
                                  <span className="text-subtle"> · em {m.etapaDestino.nome}</span>
                                </>
                              : m.funilOrigem
                                ? <>{m.funilOrigem.nome} / {m.etapaOrigem?.nome ?? '—'} → {m.funilDestino.nome} / {m.etapaDestino.nome}</>
                                : <>Criado em {m.funilDestino.nome} / {m.etapaDestino.nome}</>}
                          </p>
                          <p className="t-label text-subtle mt-0.5">por {m.user.name}</p>
                          {m.observacao && <p className="t-sm text-muted mt-1">{m.observacao}</p>}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>

              {/* ── Anotações ───────────────────────────────────────────── */}
              <section className="border-t border-line pt-5">
                <p className="t-label text-subtle mb-3">Anotações</p>
                <form onSubmit={comentar} className="space-y-2">
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                    placeholder="Escreva uma anotação sobre esta oportunidade…"
                    className="bp-field w-full t-body resize-none"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" variant="primary"
                      disabled={enviando || !novoComentario.trim()}>
                      {enviando ? 'Salvando…' : 'Adicionar anotação'}
                    </Button>
                  </div>
                </form>

                {comentarios.length === 0 ? (
                  <p className="t-sm text-subtle mt-2">Nenhuma anotação ainda.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {comentarios.map((c) => (
                      <li key={c.id} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="t-sm font-medium text-fg">{c.autor.name}</span>
                          <span className="t-label text-subtle">{fmt(c.createdAt)}</span>
                        </div>
                        <p className="t-sm text-muted mt-1 whitespace-pre-wrap">{c.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        {/* EXCLUIR fica no rodapé, à esquerda e separado do "Fechar".
            Não entra na fileira de Ganho/Perdido de propósito: aqueles três
            são o desfecho do negócio e se alternam entre si; excluir tira o
            card do quadro, e não é um quarto resultado possível. */}
        <div className="p-5 border-t border-line flex items-center justify-between gap-3 flex-none">
          {podeExcluir ? (
            <Button variant="danger" size="sm" disabled={excluindo} onClick={excluirCard}>
              {excluindo ? 'Excluindo…' : 'Excluir card'}
            </Button>
          ) : <span />}
          <Button onClick={onFechar}>Fechar</Button>
        </div>
      </div>
    </div>
  )
}
