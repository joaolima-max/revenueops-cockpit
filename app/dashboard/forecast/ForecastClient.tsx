'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency, formatTPV, formatPercent, formatMesRef, getCurrentMonth } from '@/lib/utils'

interface Cliente { id: string; nome: string; modeloOperacional: string }
interface ForecastItem {
  id: string; mesRef: string; clienteId: string; tpvPrevisto: number; qtdPrevista: number
  taxaMedia: number; receitaPrevista: number; tpvRealizado: number | null; receitaRealizada: number | null
  cliente: { nome: string; modeloOperacional: string }
}

const emptyForm = { clienteId: '', mesRef: getCurrentMonth(), tpvPrevisto: '', qtdPrevista: '', taxaMedia: '', tpvRealizado: '', receitaRealizada: '' }

export default function ForecastClient() {
  const [forecasts, setForecasts] = useState<ForecastItem[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [mesFilter, setMesFilter] = useState('')
  const [clienteFilter, setClienteFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  const receitaCalculada = form.tpvPrevisto && form.taxaMedia
    ? parseFloat(form.tpvPrevisto) * (parseFloat(form.taxaMedia) / 100)
    : 0

  const fetchData = useCallback(async () => {
    const p = new URLSearchParams()
    if (mesFilter) p.set('mes', mesFilter)
    if (clienteFilter) p.set('clienteId', clienteFilter)
    const res = await fetch(`/api/forecast?${p}`)
    if (res.ok) { const d = await res.json(); setForecasts(d.forecasts); setClientes(d.clientes) }
    setLoading(false)
  }, [mesFilter, clienteFilter])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/forecast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: form.clienteId, mesRef: form.mesRef,
        tpvPrevisto: parseFloat(form.tpvPrevisto) || 0,
        qtdPrevista: parseInt(form.qtdPrevista) || 0,
        taxaMedia: parseFloat(form.taxaMedia) || 0,
        tpvRealizado: form.tpvRealizado ? parseFloat(form.tpvRealizado) : null,
        receitaRealizada: form.receitaRealizada ? parseFloat(form.receitaRealizada) : null,
      }),
    })
    setShowModal(false); setForm(emptyForm); fetchData(); setSaving(false)
  }

  const totals = forecasts.reduce((a, f) => ({
    previsto: a.previsto + f.receitaPrevista,
    realizado: a.realizado + (f.receitaRealizada || 0),
    tpvPrevisto: a.tpvPrevisto + f.tpvPrevisto,
    tpvRealizado: a.tpvRealizado + (f.tpvRealizado || 0),
  }), { previsto: 0, realizado: 0, tpvPrevisto: 0, tpvRealizado: 0 })

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Forecast Operacional</h1>
          <p className="text-gray-600 text-sm mt-0.5">Projeção e acompanhamento de receita por cliente</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          + Novo Forecast
        </button>
      </div>

      {/* Summary */}
      {forecasts.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { l: 'TPV Previsto', v: formatTPV(totals.tpvPrevisto), c: 'text-sky-400' },
            { l: 'TPV Realizado', v: totals.tpvRealizado > 0 ? formatTPV(totals.tpvRealizado) : '—', c: 'text-sky-300' },
            { l: 'Receita Prevista', v: formatCurrency(totals.previsto), c: 'text-violet-400' },
            { l: 'Receita Realizada', v: totals.realizado > 0 ? formatCurrency(totals.realizado) : '—', c: 'text-emerald-400' },
          ].map(k => (
            <div key={k.l} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-600 text-xs mb-1.5">{k.l}</p>
              <p className={`text-lg font-bold ${k.c}`}>{k.v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="month" value={mesFilter} onChange={e => setMesFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        <select value={clienteFilter} onChange={e => setClienteFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 flex-1 max-w-64">
          <option value="">Todos os clientes</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        {(mesFilter || clienteFilter) && (
          <button onClick={() => { setMesFilter(''); setClienteFilter('') }} className="text-gray-600 hover:text-gray-400 text-sm px-3">Limpar</button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Mês', 'Cliente', 'TPV Previsto', 'Taxa Média', 'Rec. Prevista', 'TPV Realizado', 'Rec. Realizada', 'Precisão'].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 py-3 ${h === 'Mês' || h === 'Cliente' ? 'text-left px-5' : 'text-right px-4'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-gray-700 py-12 text-sm">Carregando...</td></tr>
            ) : forecasts.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-gray-700 py-12 text-sm">Nenhum forecast encontrado</td></tr>
            ) : forecasts.map(fc => {
              const prec = fc.receitaRealizada && fc.receitaPrevista > 0 ? (fc.receitaRealizada / fc.receitaPrevista) * 100 : null
              return (
                <tr key={fc.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-5 py-3 text-sm font-medium text-gray-300">{formatMesRef(fc.mesRef)}</td>
                  <td className="px-5 py-3 text-sm text-white">{fc.cliente.nome}</td>
                  <td className="px-4 py-3 text-right text-sm text-sky-400">{formatTPV(fc.tpvPrevisto)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{formatPercent(fc.taxaMedia, 3)}</td>
                  <td className="px-4 py-3 text-right text-sm text-violet-400">{formatCurrency(fc.receitaPrevista)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400">{fc.tpvRealizado ? formatTPV(fc.tpvRealizado) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-400">{fc.receitaRealizada ? formatCurrency(fc.receitaRealizada) : '—'}</td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${prec === null ? 'text-gray-700' : prec >= 90 ? 'text-emerald-400' : prec >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    {prec !== null ? formatPercent(prec, 1) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Novo Forecast</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={lbl}>Cliente *</label>
                  <select required value={form.clienteId} onChange={f('clienteId')} className={inp}>
                    <option value="">Selecionar...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Mês de Referência *</label>
                  <input required type="month" value={form.mesRef} onChange={f('mesRef')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Taxa Média (%)</label>
                  <input type="number" step="0.001" value={form.taxaMedia} onChange={f('taxaMedia')} placeholder="1.700" className={inp} />
                </div>
                <div>
                  <label className={lbl}>TPV Previsto (R$)</label>
                  <input type="number" step="0.01" value={form.tpvPrevisto} onChange={f('tpvPrevisto')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Qtd. Transações Prevista</label>
                  <input type="number" value={form.qtdPrevista} onChange={f('qtdPrevista')} className={inp} />
                </div>
              </div>
              {receitaCalculada > 0 && (
                <p className="text-xs text-indigo-400 bg-indigo-500/10 px-3 py-2 rounded-lg">
                  Receita prevista calculada: <strong>{formatCurrency(receitaCalculada)}</strong>
                </p>
              )}
              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600 font-semibold tracking-wider mb-3">REALIZADO (opcional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lbl}>TPV Realizado (R$)</label><input type="number" step="0.01" value={form.tpvRealizado} onChange={f('tpvRealizado')} className={inp} /></div>
                  <div><label className={lbl}>Receita Realizada (R$)</label><input type="number" step="0.01" value={form.receitaRealizada} onChange={f('receitaRealizada')} className={inp} /></div>
                </div>
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
