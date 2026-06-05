'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatPercent, getCurrentMonth, META_TIPO_LABELS } from '@/lib/utils'

interface Meta { id: string; tipo: string; valor: number; periodo: string; realizado: number | null }

const TIPOS = ['RECEITA', 'TPV', 'MRR', 'FLOATING', 'CLIENTES_ATIVOS']
const emptyForm = { tipo: 'RECEITA', valor: '', periodo: getCurrentMonth(), realizado: '' }

function formatVal(tipo: string, val: number) {
  if (tipo === 'CLIENTES_ATIVOS') return String(val)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export default function MetasClient() {
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState(getCurrentMonth())
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function fetchData(p: string) {
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

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  const tiposComMeta = new Set(metas.map(m => m.tipo))
  const tiposFaltando = TIPOS.filter(t => !tiposComMeta.has(t))

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Metas</h1>
          <p className="text-gray-600 text-sm mt-0.5">Acompanhamento de metas por período</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={periodo} onChange={e => { setPeriodo(e.target.value); setLoading(true) }}
            className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            + Definir Meta
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-700 text-sm">Carregando...</p>
      ) : (
        <div className="space-y-4">
          {metas.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-600 text-sm">Nenhuma meta definida para este período.</p>
              <button onClick={() => setShowModal(true)} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">Definir metas →</button>
            </div>
          )}
          {metas.map(meta => {
            const pct = meta.realizado !== null && meta.valor > 0 ? Math.min((meta.realizado / meta.valor) * 100, 100) : null
            const color = pct === null ? 'bg-gray-700' : pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
            const textColor = pct === null ? 'text-gray-500' : pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
            return (
              <div key={meta.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{META_TIPO_LABELS[meta.tipo]}</p>
                    <p className="text-xs text-gray-600 mt-0.5">Meta: {formatVal(meta.tipo, meta.valor)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${textColor}`}>
                      {pct !== null ? formatPercent(pct, 1) : '—'}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {meta.realizado !== null ? formatVal(meta.tipo, meta.realizado) : 'Sem realizado'}
                    </p>
                  </div>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct ?? 0}%` }} />
                </div>
                {meta.realizado !== null && meta.valor > 0 && (
                  <div className="flex justify-between mt-2 text-xs text-gray-700">
                    <span>0</span>
                    <span>{formatVal(meta.tipo, meta.valor)}</span>
                  </div>
                )}
              </div>
            )
          })}
          {tiposFaltando.length > 0 && metas.length > 0 && (
            <p className="text-xs text-gray-700">Sem meta definida para: {tiposFaltando.map(t => META_TIPO_LABELS[t]).join(', ')}</p>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Definir Meta</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className={lbl}>Tipo de Meta *</label>
                <select required value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} className={inp}>
                  {TIPOS.map(t => <option key={t} value={t}>{META_TIPO_LABELS[t]}</option>)}
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
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
