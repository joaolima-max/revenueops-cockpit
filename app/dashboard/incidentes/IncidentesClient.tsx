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
  satisfacao?: number | null
  clientesAfetados: { clienteId: string; cliente: { id: string; nome: string } }[]
}

interface Cliente { id: string; nome: string }

interface Props {
  initial: Incidente[]
  clientes: Cliente[]
  canEdit: boolean
}

const CRITICIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']

export default function IncidentesClient({ initial, clientes, canEdit }: Props) {
  const [incidentes, setIncidentes] = useState(initial)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descricao: '', inicio: '', fim: '',
    downtimeMins: '', criticidade: 'MEDIA', satisfacao: '',
    clienteIds: [] as string[],
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
        satisfacao: form.satisfacao ? Number(form.satisfacao) : null,
      }),
    })
    if (res.ok) {
      const { incidente } = await res.json()
      setIncidentes(p => [incidente, ...p])
      setModal(false)
      setForm({ titulo: '', descricao: '', inicio: '', fim: '', downtimeMins: '', criticidade: 'MEDIA', satisfacao: '', clienteIds: [] })
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

  function toggleCliente(id: string) {
    setForm(p => ({
      ...p,
      clienteIds: p.clienteIds.includes(id) ? p.clienteIds.filter(c => c !== id) : [...p.clienteIds, id],
    }))
  }

  const abertos = incidentes.filter(i => !i.fim).length

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Incidentes Operacionais</h1>
          <p className="text-gray-600 text-sm mt-0.5">Registro de ocorrências e impactos</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
          >
            + Novo Incidente
          </button>
        )}
      </div>

      {abertos > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <p className="text-red-400 text-sm font-medium">{abertos} incidente{abertos !== 1 ? 's' : ''} em aberto</p>
        </div>
      )}

      <div className="space-y-3">
        {incidentes.map(inc => {
          const isAberto = !inc.fim
          const duration = inc.fim && inc.inicio
            ? Math.round((new Date(inc.fim).getTime() - new Date(inc.inicio).getTime()) / 60000)
            : null

          return (
            <div key={inc.id} className={`bg-gray-900 border rounded-xl p-5 ${isAberto ? 'border-red-500/20' : 'border-gray-800'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {isAberto && <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INCIDENTE_CRITICIDADE_COLORS[inc.criticidade]}`}>
                      {INCIDENTE_CRITICIDADE_LABELS[inc.criticidade]}
                    </span>
                    {isAberto && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Em Aberto</span>}
                    {!isAberto && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Resolvido</span>}
                  </div>
                  <p className="text-white font-medium text-sm">{inc.titulo}</p>
                  {inc.descricao && <p className="text-gray-500 text-xs mt-0.5">{inc.descricao}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600">
                    <span>Início: {formatDate(inc.inicio)}</span>
                    {inc.fim && <span>Fim: {formatDate(inc.fim)}</span>}
                    {duration && <span>Duração: {duration} min</span>}
                    {inc.downtimeMins && <span>Downtime: {inc.downtimeMins} min</span>}
                    {inc.satisfacao != null && <span>Satisfação: {inc.satisfacao}/10</span>}
                    {inc.clientesAfetados.length > 0 && (
                      <span>{inc.clientesAfetados.length} cliente{inc.clientesAfetados.length !== 1 ? 's' : ''} afetado{inc.clientesAfetados.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {inc.clientesAfetados.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {inc.clientesAfetados.map(ca => (
                        <span key={ca.clienteId} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                          {ca.cliente.nome}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {canEdit && isAberto && (
                  <button
                    onClick={() => fecharIncidente(inc.id)}
                    className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 flex-shrink-0"
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {incidentes.length === 0 && (
          <div className="text-center py-12 text-gray-600">Nenhum incidente registrado</div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-bold text-white">Registrar Incidente</h2>
            <div className="space-y-3">
              <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Título do incidente *"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição" rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Início *</label>
                  <input type="datetime-local" value={form.inicio} onChange={e => setForm(p => ({ ...p, inicio: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Fim</label>
                  <input type="datetime-local" value={form.fim} onChange={e => setForm(p => ({ ...p, fim: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Criticidade</label>
                  <select value={form.criticidade} onChange={e => setForm(p => ({ ...p, criticidade: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                    {CRITICIDADES.map(c => <option key={c} value={c}>{INCIDENTE_CRITICIDADE_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Downtime (min)</label>
                  <input type="number" value={form.downtimeMins} onChange={e => setForm(p => ({ ...p, downtimeMins: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Satisfação (0-10)</label>
                  <input type="number" min="0" max="10" value={form.satisfacao} onChange={e => setForm(p => ({ ...p, satisfacao: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Clientes Afetados</label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {clientes.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 px-2 py-1 rounded">
                      <input type="checkbox" checked={form.clienteIds.includes(c.id)} onChange={() => toggleCliente(c.id)}
                        className="accent-emerald-500" />
                      <span className="text-sm text-gray-300">{c.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving || !form.titulo || !form.inicio}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
