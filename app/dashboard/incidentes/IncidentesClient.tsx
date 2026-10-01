'use client'

import { useState, useEffect } from 'react'
import { formatDate, INCIDENTE_CRITICIDADE_LABELS, INCIDENTE_CRITICIDADE_COLORS } from '@/lib/utils'
import { CRITICIDADES, calcularDowntime } from '@/lib/incidentes'
import Button from '@/components/ui/Button'
import { PanelHeader } from '@/components/ui/Panel'

interface Incidente {
  id: string
  titulo: string
  descricao?: string | null
  inicio: string
  fim?: string | null
  criticidade: string
}

interface Props {
  initial: Incidente[]
  /** Registrar e fechar. Todo perfil menos COMERCIAL. */
  podeRegistrar: boolean
  /** Editar e excluir. Somente ADMIN — o backend valida igual. */
  podeAdministrar: boolean
}

const FORM_VAZIO = { titulo: '', descricao: '', inicio: '', fim: '', criticidade: 'MEDIA' }

/** "2026-09-30T14:05:00.000Z" → "2026-09-30T14:05", que é o que o input aceita. */
function paraInputLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function IncidentesClient({ initial, podeRegistrar, podeAdministrar }: Props) {
  const [incidentes, setIncidentes] = useState(initial)

  /**
   * O RELÓGIO dos incidentes abertos.
   *
   * Começa em `null` e só passa a valer depois de montar: renderizar o agora
   * no servidor produziria um HTML diferente do que o cliente pinta um
   * segundo depois — o erro de hidratação. Com `null`,
   * `calcularDowntime(..., undefined)` usa o relógio do próprio servidor no
   * primeiro render, que é o comportamento de antes.
   *
   * Tica a cada 30s, e SÓ quando há incidente aberto: num quadro todo
   * resolvido, nenhum número muda e um intervalo rodando seria desperdício.
   */
  const [tiquetaque, setTiquetaque] = useState<Date | null>(null)
  const [modal, setModal] = useState<{ id?: string } | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  function abrirNovo() {
    setForm(FORM_VAZIO); setErro(''); setModal({})
  }

  function abrirEdicao(inc: Incidente) {
    setForm({
      titulo: inc.titulo,
      descricao: inc.descricao ?? '',
      inicio: paraInputLocal(inc.inicio),
      fim: paraInputLocal(inc.fim),
      criticidade: inc.criticidade,
    })
    setErro('')
    setModal({ id: inc.id })
  }

  async function salvar() {
    if (!modal) return
    if (!form.titulo || !form.inicio) return
    setSaving(true); setErro('')

    const res = await fetch(
      modal.id ? `/api/incidentes/${modal.id}` : '/api/incidentes',
      {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: form.titulo,
          descricao: form.descricao || null,
          inicio: new Date(form.inicio).toISOString(),
          fim: form.fim ? new Date(form.fim).toISOString() : null,
          criticidade: form.criticidade,
        }),
      },
    )

    if (res.ok) {
      const { incidente } = await res.json()
      setIncidentes((p) => modal.id
        ? p.map((i) => (i.id === modal.id ? { ...i, ...incidente } : i))
        : [incidente, ...p])
      setModal(null)
      setForm(FORM_VAZIO)
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar o incidente.')
    }
    setSaving(false)
  }

  async function fecharIncidente(id: string) {
    const res = await fetch(`/api/incidentes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fim: new Date().toISOString() }),
    })
    if (res.ok) {
      const { incidente } = await res.json()
      setIncidentes((p) => p.map((i) => (i.id === id ? { ...i, ...incidente } : i)))
      return
    }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível fechar o incidente.')
  }

  async function excluir(inc: Incidente) {
    const d = calcularDowntime(inc.inicio, inc.fim)
    const ok = confirm(
      `Excluir o incidente "${inc.titulo}"?\n\n`
      + `Início: ${formatDate(inc.inicio)}\n`
      + `${inc.fim ? `Encerramento: ${formatDate(inc.fim)}\nDowntime: ${d.rotulo}` : 'Ainda em aberto'}\n\n`
      + `A exclusão é definitiva. O registro permanece na Auditoria.`
    )
    if (!ok) return

    const res = await fetch(`/api/incidentes/${inc.id}`, { method: 'DELETE' })
    if (res.ok) {
      setIncidentes((p) => p.filter((i) => i.id !== inc.id))
      return
    }
    const j = await res.json().catch(() => ({}))
    alert(j.error ?? 'Não foi possível excluir o incidente.')
  }

  const abertos = incidentes.filter((i) => !i.fim).length

  /**
   * Tica só enquanto houver incidente aberto.
   *
   * `abertos` na dependência: o intervalo nasce quando o primeiro incidente
   * abre e morre quando o último é resolvido. Num quadro todo resolvido,
   * nenhum número muda — e um intervalo rodando seria redesenho sem efeito.
   */
  useEffect(() => {
    if (abertos === 0) return
    const tick = () => setTiquetaque(new Date())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [abertos])

  /** O agora do cliente, ou `undefined` no primeiro render (ver `tiquetaque`). */
  const agora = tiquetaque ?? undefined

  return (
    <div className="space-y-8">
      {/* A metade de baixo da tela: o REGISTRO. As métricas ficam acima,
          derivadas desta mesma lista. */}
      <PanelHeader
        title="Registro de incidentes"
        sub="O downtime é calculado do início ao encerramento — nunca informado à mão."
        actions={podeRegistrar
          ? <Button variant="primary" onClick={abrirNovo}>+ Novo incidente</Button>
          : undefined}
      />

      {abertos > 0 && (
        <div className="bg-neg/10 border border-neg/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-2 h-2 bg-neg rounded-full animate-pulse" />
          <p className="text-neg text-sm font-medium">
            {abertos} incidente{abertos !== 1 ? 's' : ''} em aberto
          </p>
        </div>
      )}

      <div className="space-y-3">
        {incidentes.map((inc) => {
          const isAberto = !inc.fim
          /**
           * UMA chamada, DOIS rótulos.
           *
           * Downtime e MTTR são o MESMO número — não dois cálculos que
           * coincidem. Chamar `calcularDowntime` duas vezes abriria a porta
           * para eles divergirem no dia em que alguém mudasse um dos lados;
           * aqui não há como.
           *
           * `agora` vem do relógio que tica: num incidente aberto os dois
           * sobem juntos, segundo a segundo.
           */
          const duracao = calcularDowntime(inc.inicio, inc.fim, agora)

          return (
            <div key={inc.id} className={`bg-surface border rounded-xl p-5 ${isAberto ? 'border-neg/20' : 'border-line'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isAberto && <div className="w-2 h-2 bg-neg rounded-full animate-pulse" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INCIDENTE_CRITICIDADE_COLORS[inc.criticidade]}`}>
                      {INCIDENTE_CRITICIDADE_LABELS[inc.criticidade]}
                    </span>
                    {isAberto
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-neg/10 text-neg font-medium">Em Aberto</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-pos/10 text-pos font-medium">Resolvido</span>}
                  </div>
                  <p className="text-fg font-medium text-sm">{inc.titulo}</p>
                  {inc.descricao && <p className="text-subtle text-xs mt-0.5">{inc.descricao}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-subtle">
                    <span>Início: {formatDate(inc.inicio)}</span>
                    {inc.fim && <span>Encerramento: {formatDate(inc.fim)}</span>}
                    <span className={isAberto ? 'text-warn' : 'text-fg'}>
                      Downtime: {duracao.rotulo}
                    </span>
                    {/* MTTR = DOWNTIME. Mesma variável, não um segundo
                        cálculo. Num incidente aberto, os dois sobem juntos. */}
                    <span className={isAberto ? 'text-warn' : 'text-fg'}>
                      MTTR: {duracao.rotulo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {podeRegistrar && isAberto && (
                    <button
                      onClick={() => fecharIncidente(inc.id)}
                      className="text-xs px-3 py-1.5 bg-pos/10 text-pos rounded-lg hover:bg-pos/20"
                    >
                      Fechar
                    </button>
                  )}
                  {/* Editar e excluir só aparecem para ADMIN. O backend nega
                      igual para qualquer outro perfil. */}
                  {podeAdministrar && (
                    <>
                      <Button size="sm" onClick={() => abrirEdicao(inc)}>Editar</Button>
                      <Button size="sm" variant="danger" onClick={() => excluir(inc)}>Excluir</Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {incidentes.length === 0 && (
          <div className="text-center py-12 text-subtle">Nenhum incidente registrado</div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="t-h2 text-fg">{modal.id ? 'Editar incidente' : 'Registrar Incidente'}</h2>
            <div className="space-y-3">
              <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                placeholder="Título do incidente *"
                className="bp-field w-full t-body" />
              <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição" rows={2}
                className="bp-field w-full t-body resize-none" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="bp-field-label">Início *</label>
                  <input type="datetime-local" value={form.inicio}
                    onChange={(e) => setForm((p) => ({ ...p, inicio: e.target.value }))}
                    className="bp-field w-full t-body" />
                </div>
                <div>
                  <label className="bp-field-label">Encerramento</label>
                  <input type="datetime-local" value={form.fim}
                    onChange={(e) => setForm((p) => ({ ...p, fim: e.target.value }))}
                    className="bp-field w-full t-body" />
                  <p className="t-label text-subtle mt-1">Vazio = incidente em aberto.</p>
                </div>
              </div>
              <div>
                <label className="bp-field-label">Criticidade</label>
                <select value={form.criticidade}
                  onChange={(e) => setForm((p) => ({ ...p, criticidade: e.target.value }))}
                  className="bp-field w-full t-body">
                  {CRITICIDADES.map((c) => (
                    <option key={c} value={c}>{INCIDENTE_CRITICIDADE_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              {/* Não há campo de downtime: ele é o intervalo acima. */}
              <p className="t-sm text-subtle">
                Downtime{form.inicio && ` (${calcularDowntime(
                  new Date(form.inicio),
                  form.fim ? new Date(form.fim) : null,
                ).rotulo})`} é calculado do início ao encerramento — não é informado.
              </p>

              {erro && <p className="t-sm text-neg">{erro}</p>}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-muted border border-line-2 hover:bg-surface-2">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving || !form.titulo || !form.inicio}
                className="bp-btn-primary flex-1 py-2 px-4 rounded-lg text-sm font-medium">
                {saving ? 'Salvando...' : modal.id ? 'Salvar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
