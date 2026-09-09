'use client'

import { useState } from 'react'
import { formatDate, INCIDENTE_CRITICIDADE_LABELS, INCIDENTE_CRITICIDADE_COLORS } from '@/lib/utils'

interface Incidente {
  id: string
  titulo: string
  descricao?: string | null
  inicio: string
  fim?: string | null
  downtimeMins?: number | null
  criticidade: string
}

interface Props {
  initial: Incidente[]
  canEdit: boolean
}

const CRITICIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']

export default function IncidentesClient({ initial, canEdit }: Props) {
  const [incidentes, setIncidentes] = useState(initial)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descricao: '', inicio: '', fim: '',
    downtimeMins: '', criticidade: 'MEDIA',
  })
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!form.titulo || !form.inicio) return
    setSaving(true)
    const res = await fetch('/api/incidentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        downtimeMins: form.downtimeMins ? Number(form.downtimeMins) : null,
      }),
    })
    if (res.ok) {
      const { incidente } = await res.json()
      setIncidentes(p => [incidente, ...p])
      setModal(false)
      setForm({ titulo: '', descricao: '', inicio: '', fim: '', downtimeMins: '', criticidade: 'MEDIA' })
    }
    setSaving(false)
  }

  async function fecharIncidente(id: string) {
    const fim = new Date().toISOString()
    const res = await fetch(`/api/incidentes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fim }),
    })
    if (res.ok) {
      const { incidente } = await res.json()
      setIncidentes(p => p.map(i => i.id === id ? { ...i, ...incidente } : i))
    }
  }

  const abertos = incidentes.filter(i => !i.fim).length

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="t-h1 text-fg">Incidentes Operacionais</h1>
          <p className="text-subtle text-sm mt-0.5">Registro de ocorrências e impactos</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal(true)}
            className="bp-btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Novo Incidente
          </button>
        )}
      </div>

      {abertos > 0 && (
        <div className="bg-neg/10 border border-neg/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-2 h-2 bg-neg rounded-full animate-pulse" />
          <p className="text-neg text-sm font-medium">{abertos} incidente{abertos !== 1 ? 's' : ''} em aberto</p>
        </div>
      )}

      <div className="space-y-3">
        {incidentes.map(inc => {
          const isAberto = !inc.fim
          const duration = inc.fim && inc.inicio
            ? Math.round((new Date(inc.fim).getTime() - new Date(inc.inicio).getTime()) / 60000)
            : null

          return (
            <div key={inc.id} className={`bg-surface border rounded-xl p-5 ${isAberto ? 'border-neg/20' : 'border-line'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {isAberto && <div className="w-2 h-2 bg-neg rounded-full animate-pulse" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INCIDENTE_CRITICIDADE_COLORS[inc.criticidade]}`}>
                      {INCIDENTE_CRITICIDADE_LABELS[inc.criticidade]}
                    </span>
                    {isAberto && <span className="text-xs px-2 py-0.5 rounded-full bg-neg/10 text-neg font-medium">Em Aberto</span>}
                    {!isAberto && <span className="text-xs px-2 py-0.5 rounded-full bg-pos/10 text-pos font-medium">Resolvido</span>}
                  </div>
                  <p className="text-fg font-medium text-sm">{inc.titulo}</p>
                  {inc.descricao && <p className="text-subtle text-xs mt-0.5">{inc.descricao}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-subtle">
                    <span>Início: {formatDate(inc.inicio)}</span>
                    {inc.fim && <span>Fim: {formatDate(inc.fim)}</span>}
                    {duration && <span>Duração: {duration} min</span>}
                    {inc.downtimeMins && <span>Downtime: {inc.downtimeMins} min</span>}
                  </div>
                </div>
                {canEdit && isAberto && (
                  <button
                    onClick={() => fecharIncidente(inc.id)}
                    className="text-xs px-3 py-1.5 bg-pos/10 text-pos rounded-lg hover:bg-pos/20 flex-shrink-0"
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {incidentes.length === 0 && (
          <div className="text-center py-12 text-subtle">Nenhum incidente registrado</div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line-2 rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="t-h2 text-fg">Registrar Incidente</h2>
            <div className="space-y-3">
              <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Título do incidente *"
                className="bp-field w-full t-body disabled:opacity-40" />
              <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição" rows={2}
                className="bp-field w-full t-body disabled:opacity-40 resize-none" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="bp-field-label">Início *</label>
                  <input type="datetime-local" value={form.inicio} onChange={e => setForm(p => ({ ...p, inicio: e.target.value }))}
                    className="bp-field w-full t-body disabled:opacity-40" />
                </div>
                <div>
                  <label className="bp-field-label">Fim</label>
                  <input type="datetime-local" value={form.fim} onChange={e => setForm(p => ({ ...p, fim: e.target.value }))}
                    className="bp-field w-full t-body disabled:opacity-40" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="bp-field-label">Criticidade</label>
                  <select value={form.criticidade} onChange={e => setForm(p => ({ ...p, criticidade: e.target.value }))}
                    className="bp-field w-full t-body disabled:opacity-40">
                    {CRITICIDADES.map(c => <option key={c} value={c}>{INCIDENTE_CRITICIDADE_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="bp-field-label">Downtime (min)</label>
                  <input type="number" value={form.downtimeMins} onChange={e => setForm(p => ({ ...p, downtimeMins: e.target.value }))}
                    className="bp-field w-full t-body disabled:opacity-40" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-muted border border-line-2 hover:bg-surface-2">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving || !form.titulo || !form.inicio}
                className="bp-btn-primary flex-1 py-2 px-4 rounded-lg text-sm font-medium">
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
