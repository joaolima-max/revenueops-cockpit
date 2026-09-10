'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import {
  PENDENCIA_MOTIVO_LABELS, PENDENCIA_STATUS_LABELS,
  INCIDENTE_CRITICIDADE_LABELS, formatDate, formatDateTime,
} from '@/lib/utils'
import { MOTIVOS, STATUS, CRITICIDADES, estaVencida, diasParaPrazo, transicaoValida, type Status } from '@/lib/compliance'

interface Pendencia {
  id: string
  motivo: string
  criticidade: string
  titulo: string
  observacoes: string | null
  prazo: string | null
  status: Status
  createdAt: string
  cliente: { id: string; nome: string }
  responsavel: { id: string; name: string }
  _count: { eventos: number }
}

interface Evento {
  id: string
  statusDe: string | null
  statusPara: string | null
  comentario: string | null
  createdAt: string
  user: { name: string }
}

interface Opcao { id: string; nome?: string; name?: string }

const TOM_STATUS: Record<Status, BadgeTone> = {
  ABERTA: 'warn', EM_ANALISE: 'accent', AGUARDANDO_CLIENTE: 'neutral',
  RESOLVIDA: 'pos', CANCELADA: 'neutral',
}

const TOM_CRIT: Record<string, BadgeTone> = {
  BAIXA: 'neutral', MEDIA: 'accent', ALTA: 'warn', CRITICA: 'neg',
}

const FORM_VAZIO = {
  clienteId: '', motivo: 'ATUALIZACAO_CADASTRAL', criticidade: 'MEDIA',
  titulo: '', observacoes: '', prazo: '', responsavelId: '',
}

export default function ComplianceClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [clientes, setClientes] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Opcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)

  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroMotivo, setFiltroMotivo] = useState('')
  const [apenasMinhas, setApenasMinhas] = useState(false)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [detalhe, setDetalhe] = useState<{ pendencia: Pendencia; eventos: Evento[]; documentos: Array<{ id: string; nome: string }> } | null>(null)
  const [comentario, setComentario] = useState('')
  const [novoStatus, setNovoStatus] = useState<Status | ''>('')

  useEffect(() => {
    let vivo = true
    const qs = new URLSearchParams()
    if (filtroStatus) qs.set('status', filtroStatus)
    if (filtroMotivo) qs.set('motivo', filtroMotivo)
    if (apenasMinhas) qs.set('minhas', '1')

    fetch(`/api/compliance?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d) setPendencias(d.pendencias ?? []) })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [filtroStatus, filtroMotivo, apenasMinhas, versao])

  useEffect(() => {
    Promise.all([
      fetch('/api/clientes').then((r) => (r.ok ? r.json() : { clientes: [] })),
      fetch('/api/users').then((r) => (r.ok ? r.json() : { users: [] })),
    ]).then(([c, u]) => {
      setClientes(c.clientes ?? [])
      setUsuarios(u.users ?? u ?? [])
    }).catch(() => {})
  }, [])

  async function abrirDetalhe(p: Pendencia) {
    const res = await fetch(`/api/compliance/${p.id}`)
    if (!res.ok) return
    const d = await res.json()
    setDetalhe({ pendencia: d.pendencia, eventos: d.pendencia.eventos ?? [], documentos: d.documentos ?? [] })
    setComentario(''); setNovoStatus('')
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro('')
    const res = await fetch('/api/compliance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, prazo: form.prazo || null }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar.'); setSalvando(false); return
    }
    setModal(false); setForm(FORM_VAZIO); setSalvando(false); setVersao((v) => v + 1)
  }

  async function atualizar() {
    if (!detalhe) return
    setSalvando(true)
    const res = await fetch(`/api/compliance/${detalhe.pendencia.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus || undefined, comentario: comentario || undefined }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível atualizar.'); setSalvando(false); return
    }
    setSalvando(false); setDetalhe(null); setVersao((v) => v + 1)
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'
  const filtro = 'bg-surface border border-line rounded-lg px-3 py-2 t-sm text-muted focus:outline-none focus:border-accent'

  const vencidas = pendencias.filter((p) => estaVencida(p.prazo, p.status)).length
  const abertas = pendencias.filter((p) => p.status !== 'RESOLVIDA' && p.status !== 'CANCELADA').length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pendências Compliance"
        sub="Compliance sinaliza, a documentação vira pendência, o responsável acompanha e cada alteração fica no histórico."
        actions={podeGerenciar ? <Button variant="primary" onClick={() => { setErro(''); setModal(true) }}>+ Nova pendência</Button> : undefined}
      />

      <Panel className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="t-h2 text-fg">{abertas} em aberto</h2>
          <p className="t-sm text-muted mt-1">{pendencias.length} pendência(s) no filtro atual</p>
        </div>
        {vencidas > 0 && <Badge tone="neg">{vencidas} fora do prazo</Badge>}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} aria-label="Filtrar por status" className={filtro}>
          <option value="">Todos os status</option>
          {STATUS.map((s) => <option key={s} value={s}>{PENDENCIA_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filtroMotivo} onChange={(e) => setFiltroMotivo(e.target.value)} aria-label="Filtrar por motivo" className={filtro}>
          <option value="">Todos os motivos</option>
          {MOTIVOS.map((m) => <option key={m} value={m}>{PENDENCIA_MOTIVO_LABELS[m]}</option>)}
        </select>
        <label className="flex items-center gap-2 t-sm text-muted cursor-pointer">
          <input type="checkbox" checked={apenasMinhas} onChange={(e) => setApenasMinhas(e.target.checked)} />
          Só as minhas
        </label>
      </div>

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : pendencias.length === 0 ? (
        <Panel padded={false}>
          <EmptyState title="Nenhuma pendência" description="Atualização cadastral, explicação de movimentação, denúncia ou regularização de documento." />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead><HeadRow>
              <Th>Pendência</Th><Th>Cliente</Th><Th>Motivo</Th>
              <Th align="center">Criticidade</Th><Th>Prazo</Th>
              <Th align="center">Status</Th><Th align="right">Ações</Th>
            </HeadRow></THead>
            <tbody>
              {pendencias.length === 0 ? <EmptyRow colSpan={7}>Nenhum resultado.</EmptyRow> : pendencias.map((p) => {
                const dias = diasParaPrazo(p.prazo)
                const venceu = estaVencida(p.prazo, p.status)
                return (
                  <Row key={p.id}>
                    <Td className="text-fg font-medium">
                      {p.titulo}
                      <p className="t-label text-subtle font-normal mt-0.5">{p.responsavel.name}</p>
                    </Td>
                    <Td>{p.cliente.nome}</Td>
                    <Td className="t-sm">{PENDENCIA_MOTIVO_LABELS[p.motivo] ?? p.motivo}</Td>
                    <Td align="center">
                      <Badge tone={TOM_CRIT[p.criticidade] ?? 'neutral'}>
                        {INCIDENTE_CRITICIDADE_LABELS[p.criticidade] ?? p.criticidade}
                      </Badge>
                    </Td>
                    <Td>
                      {p.prazo ? (
                        <span className={venceu ? 'text-neg' : undefined}>
                          {formatDate(p.prazo)}
                          {dias !== null && !venceu && <span className="t-label text-subtle ml-1.5">em {dias}d</span>}
                          {venceu && <span className="t-label ml-1.5">vencida</span>}
                        </span>
                      ) : <span className="text-subtle">—</span>}
                    </Td>
                    <Td align="center"><Badge tone={TOM_STATUS[p.status]}>{PENDENCIA_STATUS_LABELS[p.status]}</Badge></Td>
                    <Td align="right"><Button size="sm" onClick={() => abrirDetalhe(p)}>Abrir</Button></Td>
                  </Row>
                )
              })}
            </tbody>
          </Table>
        </TableShell>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line sticky top-0 bg-surface">
              <h2 className="t-h2 text-fg">Nova pendência</h2>
              <button onClick={() => setModal(false)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={criar} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              <div>
                <label className={lbl} htmlFor="p-cliente">Cliente *</label>
                <select id="p-cliente" required value={form.clienteId} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, clienteId: e.target.value }))}>
                  <option value="">Selecione</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="p-titulo">Título *</label>
                <input id="p-titulo" required value={form.titulo} className={inp} maxLength={200}
                  onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
              </div>

              <div>
                <label className={lbl} htmlFor="p-motivo">Motivo *</label>
                <select id="p-motivo" value={form.motivo} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}>
                  {MOTIVOS.map((m) => <option key={m} value={m}>{PENDENCIA_MOTIVO_LABELS[m]}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl} htmlFor="p-crit">Criticidade</label>
                  <select id="p-crit" value={form.criticidade} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, criticidade: e.target.value }))}>
                    {CRITICIDADES.map((c) => <option key={c} value={c}>{INCIDENTE_CRITICIDADE_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="p-prazo">Prazo</label>
                  <input id="p-prazo" type="date" value={form.prazo} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, prazo: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="p-resp">Responsável *</label>
                <select id="p-resp" required value={form.responsavelId} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, responsavelId: e.target.value }))}>
                  <option value="">Selecione</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.nome}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="p-obs">Observações</label>
                <textarea id="p-obs" rows={3} value={form.observacoes} className={inp} maxLength={2000}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Criar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setDetalhe(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line flex-none">
              <div className="min-w-0">
                <h2 className="t-h2 text-fg">{detalhe.pendencia.titulo}</h2>
                <p className="t-sm text-muted mt-0.5">
                  {detalhe.pendencia.cliente.nome} · {PENDENCIA_MOTIVO_LABELS[detalhe.pendencia.motivo]}
                </p>
              </div>
              <button onClick={() => setDetalhe(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {detalhe.pendencia.observacoes && (
                <p className="t-sm text-muted">{detalhe.pendencia.observacoes}</p>
              )}

              {detalhe.documentos.length > 0 && (
                <div>
                  <h3 className="t-label text-subtle mb-2">Documentos do cliente</h3>
                  <ul className="space-y-1">
                    {detalhe.documentos.map((d) => (
                      <li key={d.id} className="t-sm text-muted">· {d.nome}</li>
                    ))}
                  </ul>
                </div>
              )}

              {podeGerenciar && (
                <div className="space-y-3 border border-line rounded-xl p-4">
                  <div>
                    <label className={lbl} htmlFor="d-status">Mudar status</label>
                    <select id="d-status" value={novoStatus} className={inp}
                      onChange={(e) => setNovoStatus(e.target.value as Status | '')}>
                      <option value="">Manter {PENDENCIA_STATUS_LABELS[detalhe.pendencia.status]}</option>
                      {STATUS.filter((s) => transicaoValida(detalhe.pendencia.status, s)).map((s) => (
                        <option key={s} value={s}>{PENDENCIA_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="d-com">Comentário</label>
                    <textarea id="d-com" rows={2} value={comentario} className={inp} maxLength={1000}
                      onChange={(e) => setComentario(e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="primary" size="sm" disabled={salvando || (!novoStatus && !comentario)} onClick={atualizar}>
                      {salvando ? 'Salvando...' : 'Registrar'}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <h3 className="t-label text-subtle mb-3">Histórico</h3>
                <ol className="space-y-3">
                  {detalhe.eventos.map((ev) => (
                    <li key={ev.id} className="border-l border-line pl-4 relative">
                      <span aria-hidden className="absolute -left-[3px] top-1.5 w-[5px] h-[5px] rotate-45 rounded-[1px] bg-subtle" />
                      <p className="t-sm text-fg">
                        {ev.statusPara
                          ? `${ev.statusDe ? `${PENDENCIA_STATUS_LABELS[ev.statusDe]} → ` : ''}${PENDENCIA_STATUS_LABELS[ev.statusPara]}`
                          : 'Comentário'}
                      </p>
                      {ev.comentario && <p className="t-sm text-muted mt-0.5">{ev.comentario}</p>}
                      <p className="t-label text-subtle mt-0.5">{ev.user.name} · {formatDateTime(ev.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="p-5 border-t border-line flex justify-end flex-none">
              <Button onClick={() => setDetalhe(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
