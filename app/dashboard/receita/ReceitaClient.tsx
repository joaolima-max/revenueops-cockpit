'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatPercent, formatMesRef, getCurrentMonth } from '@/lib/utils'

interface Receita {
  id: string; mesRef: string; receitaTarifaria: number; floatingRealizado: number
  previsto: number; realizado: number; gap: number; precisao: number | null
}

const emptyForm = { mesRef: getCurrentMonth(), receitaTarifaria: '', floatingRealizado: '' }

export default function ReceitaClient() {
  const [receitas, setReceitas] = useState<Receita[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  async function fetchData() {
    const res = await fetch('/api/receita')
    if (res.ok) { const d = await res.json(); setReceitas(d.receitas) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/receita', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesRef: form.mesRef,
        receitaTarifaria: parseFloat(form.receitaTarifaria) || 0,
        floatingRealizado: parseFloat(form.floatingRealizado) || 0,
      }),
    })
    setShowModal(false); setForm(emptyForm); fetchData(); setSaving(false)
  }

  const totalReceita = receitas.reduce((s, r) => s + r.realizado, 0)
  const avgPrecisao = receitas.filter(r => r.precisao !== null).reduce((s, r, _, a) => s + (r.precisao! / a.length), 0)

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Receita Realizada</h1>
          <p className="text-gray-600 text-sm mt-0.5">Lançamento consolidado mensal de receita</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          + Lançar Mês
        </button>
      </div>

      {receitas.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1.5">Total Acumulado</p>
            <p className="text-lg font-bold text-indigo-400">{formatCurrency(totalReceita)}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1.5">Precisão Média Forecast</p>
            <p className={`text-lg font-bold ${avgPrecisao >= 90 ? 'text-emerald-400' : avgPrecisao >= 70 ? 'text-amber-400' : 'text-gray-500'}`}>
              {avgPrecisao > 0 ? formatPercent(avgPrecisao, 1) : '—'}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1.5">Meses Registrados</p>
            <p className="text-lg font-bold text-white">{receitas.length}</p>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Mês', 'Rec. Tarifária', 'Floating', 'Total Realizado', 'Forecast Previsto', 'Gap', 'Precisão'].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 py-3 ${h === 'Mês' ? 'text-left px-5' : 'text-right px-4'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-gray-700 py-12 text-sm">Carregando...</td></tr>
            ) : receitas.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-700 py-12 text-sm">Nenhum lançamento registrado</td></tr>
            ) : receitas.map(r => (
              <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                <td className="px-5 py-3.5 text-sm font-medium text-gray-300">{formatMesRef(r.mesRef)}</td>
                <td className="px-4 py-3.5 text-right text-sm text-indigo-400">{formatCurrency(r.receitaTarifaria)}</td>
                <td className="px-4 py-3.5 text-right text-sm text-emerald-400">{formatCurrency(r.floatingRealizado)}</td>
                <td className="px-4 py-3.5 text-right text-sm font-semibold text-white">{formatCurrency(r.realizado)}</td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-500">{r.previsto > 0 ? formatCurrency(r.previsto) : '—'}</td>
                <td className={`px-4 py-3.5 text-right text-sm font-medium ${r.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.previsto > 0 ? (r.gap >= 0 ? '+' : '') + formatCurrency(r.gap) : '—'}
                </td>
                <td className={`px-4 py-3.5 text-right text-sm font-medium ${r.precisao === null ? 'text-gray-700' : r.precisao >= 90 ? 'text-emerald-400' : r.precisao >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                  {r.precisao !== null ? formatPercent(r.precisao, 1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Lançar Receita Mensal</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div><label className={lbl}>Mês de Referência *</label><input required type="month" value={form.mesRef} onChange={e => setForm(p => ({ ...p, mesRef: e.target.value }))} className={inp} /></div>
              <div><label className={lbl}>Receita Tarifária Realizada (R$)</label><input type="number" step="0.01" value={form.receitaTarifaria} onChange={e => setForm(p => ({ ...p, receitaTarifaria: e.target.value }))} className={inp} /></div>
              <div><label className={lbl}>Floating Realizado (R$)</label><input type="number" step="0.01" value={form.floatingRealizado} onChange={e => setForm(p => ({ ...p, floatingRealizado: e.target.value }))} className={inp} /></div>
              {form.receitaTarifaria && (
                <p className="text-xs text-indigo-400 bg-indigo-500/10 px-3 py-2 rounded-lg">
                  Total: <strong>{formatCurrency((parseFloat(form.receitaTarifaria) || 0) + (parseFloat(form.floatingRealizado) || 0))}</strong>
                </p>
              )}
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
