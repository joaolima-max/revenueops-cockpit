'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatPercent, getCurrentMonth, META_TIPO_LABELS } from '@/lib/utils'

interface Meta { id: string; tipo: string; valor: number; periodo: string; realizado: number | null }

const TIPOS = ['RECEITA_TARIFARIA', 'TPV', 'SALDO_EM_CONTA', 'TRANSACOES', 'MEDS']
const emptyForm = { tipo: 'RECEITA_TARIFARIA', valor: '', periodo: getCurrentMonth(), realizado: '' }

function formatVal(tipo: string, val: number) {
  if (tipo === 'CLIENTES_ATIVOS' || tipo === 'TRANSACOES') return val.toLocaleString('pt-BR')
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export default function MetasClient() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState(getCurrentMonth())
  const [showModal, setShowModal] = useState(false)
  const [editModal, setEditModal] = useState<Meta | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({ valor: '', realizado: '' })
  const [form, setForm] = useState(emptyForm)

  async function fetchData(p: string) {
    setLoading(true)
    const res = await fetch(`/api/metas?periodo=${p}`)
    if (res.ok) { const d = await res.json(); setMetas(d.metas) }
    setLoading(false)
  }

  useEffect(() => { fetchData(periodo) }, [periodo])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/metas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: form.tipo, valor: parseFloat(form.valor) || 0,
        periodo: form.periodo,
        realizado: form.realizado ? parseFloat(form.realizado) : null,
      }),
    })
    setShowModal(false); setForm(emptyForm); fetchData(periodo); setSaving(false)
  }

  function openEdit(meta: Meta) {
    setEditModal(meta)
    setEditForm({ valor: String(meta.valor), realizado: meta.realizado !== null ? String(meta.realizado) : '' })
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editModal) return
    setSaving(true)
    await fetch(`/api/metas/${editModal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valor: editForm.valor ? parseFloat(editForm.valor) : undefined,
        realizado: editForm.realizado !== '' ? parseFloat(editForm.realizado) : null,
      }),
    })
    setEditModal(null); fetchData(periodo); setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta meta?')) return
    await fetch(`/api/metas/${id}`, { method: 'DELETE' })
    fetchData(periodo)
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  const tiposComMeta = new Set(metas.map(m => m.tipo))
  const tiposFaltando = TIPOS.filter(t => !tiposComMeta.has(t))

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="t-h1 text-fg">Metas</h1>
          <p className="text-subtle text-sm mt-0.5">Acompanhamento de metas por período</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={periodo} onChange={e => { setPeriodo(e.target.value) }}
            className="bp-field text-sm" />
          <button onClick={() => setShowModal(true)} className="bp-btn-primary px-4 py-2 text-sm font-medium rounded-lg">
            + Definir Meta
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-subtle text-sm">Carregando...</p>
      ) : (
        <div className="space-y-4">
          {metas.length === 0 && (
            <div className="bg-surface border border-line rounded-xl p-8 text-center">
              <p className="text-subtle text-sm">Nenhuma meta definida para este período.</p>
              <button onClick={() => setShowModal(true)} className="mt-3 text-pos hover:text-pos text-sm">Definir metas →</button>
            </div>
          )}
          {metas.map(meta => {
            const pct = meta.realizado !== null && meta.valor > 0 ? Math.min((meta.realizado / meta.valor) * 100, 100) : null
            const color = pct === null ? 'bg-surface-2' : pct >= 90 ? 'bg-pos' : pct >= 70 ? 'bg-warn' : 'bg-neg'
            const textColor = pct === null ? 'text-subtle' : pct >= 90 ? 'text-pos' : pct >= 70 ? 'text-warn' : 'text-neg'
            return (
              <div key={meta.id} className="bg-surface border border-line rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-fg">{META_TIPO_LABELS[meta.tipo] || meta.tipo}</p>
                    <p className="text-xs text-subtle mt-0.5">Meta: {formatVal(meta.tipo, meta.valor)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-xl font-bold tnum ${textColor}`}>
                        {pct !== null ? formatPercent(pct, 1) : '—'}
                      </p>
                      <p className="text-xs text-subtle mt-0.5">
                        {meta.realizado !== null ? formatVal(meta.tipo, meta.realizado) : 'Sem realizado'}
                      </p>
                    </div>
                    {/* Edit / Delete buttons */}
                    <div className="flex flex-col gap-1 ml-2">
                      <button onClick={() => openEdit(meta)} title="Editar"
                        className="p-1.5 rounded-lg bg-surface-2 hover:bg-accent/20 text-subtle hover:text-accent-soft transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(meta.id)} title="Excluir"
                        className="p-1.5 rounded-lg bg-surface-2 hover:bg-neg/20 text-subtle hover:text-neg transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct ?? 0}%` }} />
                </div>
                {meta.realizado !== null && meta.valor > 0 && (
                  <div className="flex justify-between mt-2 text-xs text-subtle">
                    <span>0</span>
                    <span>{formatVal(meta.tipo, meta.valor)}</span>
                  </div>
                )}
              </div>
            )
          })}
          {tiposFaltando.length > 0 && metas.length > 0 && (
            <p className="text-xs text-subtle">Sem meta definida para: {tiposFaltando.map(t => META_TIPO_LABELS[t] || t).join(', ')}</p>
          )}
        </div>
      )}

      {/* Criar Meta Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Definir Meta</h2>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={lbl}>Tipo de Meta *</label>
                <select required value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} className={inp}>
                  {TIPOS.map(t => <option key={t} value={t}>{META_TIPO_LABELS[t] || t}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Período *</label>
                <input required type="month" value={form.periodo} onChange={e => setForm(p => ({ ...p, periodo: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Valor da Meta *</label>
                <input required type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Valor Realizado (opcional)</label>
                <input type="number" step="0.01" value={form.realizado} onChange={e => setForm(p => ({ ...p, realizado: e.target.value }))} className={inp} />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-subtle border border-line-2 hover:text-fg text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-accent hover:bg-accent disabled:opacity-50 text-fg text-sm font-medium rounded-lg transition-colors">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editar Meta Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Editar Meta — {META_TIPO_LABELS[editModal.tipo] || editModal.tipo}</h2>
              <button onClick={() => setEditModal(null)} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4">
              <div>
                <label className={lbl}>Valor da Meta</label>
                <input type="number" step="0.01" value={editForm.valor} onChange={e => setEditForm(p => ({ ...p, valor: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className={lbl}>Valor Realizado</label>
                <input type="number" step="0.01" value={editForm.realizado} onChange={e => setEditForm(p => ({ ...p, realizado: e.target.value }))} className={inp} placeholder="Deixe vazio para limpar" />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setEditModal(null)} className="px-4 py-2 text-subtle border border-line-2 hover:text-fg text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-accent hover:bg-accent disabled:opacity-50 text-fg text-sm font-medium rounded-lg transition-colors">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
