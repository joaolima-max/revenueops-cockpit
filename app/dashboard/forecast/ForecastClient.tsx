'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency, formatTPV, formatPercent, formatMesRef, getCurrentMonth } from '@/lib/utils'

interface ForecastGeral {
  id: string; mesRef: string
  tpvPrevisto: number; qtdTransacoesPrevista: number; faturamentoPrevisto: number; margemPrevista: number
  tpvRealizado: number | null; qtdTransacoesRealizadas: number | null
  margemRealizada: number | null
  qtdMedRealizada: number | null; receitaTarifariaWl: number | null
  dataLancamento: string | null
  notas: string | null
}

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = {
  mesRef: getCurrentMonth(),
  tpvPrevisto: '', qtdTransacoesPrevista: '', faturamentoPrevisto: '', margemPrevista: '',
  tpvRealizado: '', qtdTransacoesRealizadas: '', margemRealizada: '',
  qtdMedRealizada: '', receitaTarifariaWl: '',
  dataLancamento: today(),
  notas: '',
}

function fromForecast(fc: ForecastGeral) {
  return {
    mesRef: fc.mesRef,
    tpvPrevisto: String(fc.tpvPrevisto || ''),
    qtdTransacoesPrevista: String(fc.qtdTransacoesPrevista || ''),
    faturamentoPrevisto: String(fc.faturamentoPrevisto || ''),
    margemPrevista: String(fc.margemPrevista || ''),
    tpvRealizado: fc.tpvRealizado != null ? String(fc.tpvRealizado) : '',
    qtdTransacoesRealizadas: fc.qtdTransacoesRealizadas != null ? String(fc.qtdTransacoesRealizadas) : '',
    margemRealizada: fc.margemRealizada != null ? String(fc.margemRealizada) : '',
    qtdMedRealizada: fc.qtdMedRealizada != null ? String(fc.qtdMedRealizada) : '',
    receitaTarifariaWl: fc.receitaTarifariaWl != null ? String(fc.receitaTarifariaWl) : '',
    dataLancamento: fc.dataLancamento ? new Date(fc.dataLancamento).toISOString().split('T')[0] : today(),
    notas: fc.notas || '',
  }
}

export default function ForecastClient() {
  const [forecasts, setForecasts] = useState<ForecastGeral[]>([])
  const [loading, setLoading] = useState(true)
  const [mesFilter, setMesFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  const fetchData = useCallback(async () => {
    const p = new URLSearchParams()
    if (mesFilter) p.set('mes', mesFilter)
    const res = await fetch(`/api/forecast-geral?${p}`)
    if (res.ok) { const d = await res.json(); setForecasts(d.forecasts) }
    setLoading(false)
  }, [mesFilter])

  useEffect(() => { fetchData() }, [fetchData])

  function openNew() { setEditingId(null); setForm({ ...emptyForm, dataLancamento: today() }); setShowModal(true) }
  function openEdit(fc: ForecastGeral) { setEditingId(fc.id); setForm(fromForecast(fc)); setShowModal(true) }

  async function handleDelete(fc: ForecastGeral) {
    if (!confirm(`Excluir forecast de ${formatMesRef(fc.mesRef)}?`)) return
    const res = await fetch(`/api/forecast-geral/${fc.id}`, { method: 'DELETE' })
    if (res.ok) setForecasts(prev => prev.filter(f => f.id !== fc.id))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const n = (v: string) => v !== '' ? parseFloat(v) : null
    const ni = (v: string) => v !== '' ? parseInt(v) : null
    await fetch('/api/forecast-geral', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesRef: form.mesRef,
        tpvPrevisto: parseFloat(form.tpvPrevisto) || 0,
        qtdTransacoesPrevista: parseInt(form.qtdTransacoesPrevista) || 0,
        faturamentoPrevisto: parseFloat(form.faturamentoPrevisto) || 0,
        margemPrevista: parseFloat(form.margemPrevista) || 0,
        tpvRealizado: n(form.tpvRealizado),
        qtdTransacoesRealizadas: ni(form.qtdTransacoesRealizadas),
        margemRealizada: n(form.margemRealizada),
        qtdMedRealizada: ni(form.qtdMedRealizada),
        receitaTarifariaWl: n(form.receitaTarifariaWl),
        dataLancamento: form.dataLancamento || null,
        notas: form.notas || null,
      }),
    })
    setShowModal(false); setForm(emptyForm); fetchData(); setSaving(false)
  }

  const currentMonthFc = forecasts.find(fc => fc.mesRef === getCurrentMonth())

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Forecast da Carteira</h1>
          <p className="text-gray-600 text-sm mt-0.5">Previsão geral de TPV, transações, faturamento e margem</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
          + Novo Forecast
        </button>
      </div>

      {currentMonthFc && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { l: 'TPV Previsto (mês atual)', v: formatTPV(currentMonthFc.tpvPrevisto), r: currentMonthFc.tpvRealizado ? formatTPV(currentMonthFc.tpvRealizado) : null, c: 'text-sky-400' },
            { l: 'Qtd. Transações Prevista', v: currentMonthFc.qtdTransacoesPrevista.toLocaleString('pt-BR'), r: currentMonthFc.qtdTransacoesRealizadas ? currentMonthFc.qtdTransacoesRealizadas.toLocaleString('pt-BR') : null, c: 'text-violet-400' },
            { l: 'Faturamento Previsto', v: formatCurrency(currentMonthFc.faturamentoPrevisto), r: null, c: 'text-emerald-400' },
            { l: 'Margem Prevista', v: formatPercent(currentMonthFc.margemPrevista, 2), r: currentMonthFc.margemRealizada != null ? formatPercent(currentMonthFc.margemRealizada, 2) : null, c: 'text-amber-400' },
          ].map(k => (
            <div key={k.l} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-600 text-xs mb-1.5">{k.l}</p>
              <p className={`text-xl font-bold ${k.c}`}>{k.v}</p>
              {k.r && <p className="text-xs text-gray-500 mt-0.5">Realizado: <span className="text-gray-300">{k.r}</span></p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <input type="month" value={mesFilter} onChange={e => setMesFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
        {mesFilter && (
          <button onClick={() => setMesFilter('')} className="text-gray-600 hover:text-gray-400 text-sm px-3">Limpar</button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Mês', 'Lançamento', 'TPV Previsto', 'TPV Realizado', 'Qtd. Tx', 'Qtd. MED', 'Rec. Tarif. WL', 'Margem Prev.', 'Margem Real.', ''].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 py-3 whitespace-nowrap ${h === 'Mês' || h === '' ? 'text-left px-5' : 'text-right px-3'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center text-gray-700 py-12 text-sm">Carregando...</td></tr>
            ) : forecasts.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-gray-700 py-12 text-sm">Nenhum forecast cadastrado</td></tr>
            ) : forecasts.map(fc => {
              const medPct = fc.qtdMedRealizada != null && fc.qtdTransacoesRealizadas && fc.qtdTransacoesRealizadas > 0
                ? (fc.qtdMedRealizada / fc.qtdTransacoesRealizadas) * 100 : null
              return (
                <tr key={fc.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-5 py-3 text-sm font-semibold text-white whitespace-nowrap">{formatMesRef(fc.mesRef)}</td>
                  <td className="px-3 py-3 text-right text-xs text-gray-600 whitespace-nowrap">
                    {fc.dataLancamento ? new Date(fc.dataLancamento).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-sky-400 whitespace-nowrap">{formatTPV(fc.tpvPrevisto)}</td>
                  <td className="px-3 py-3 text-right text-sm text-sky-300 whitespace-nowrap">{fc.tpvRealizado != null ? formatTPV(fc.tpvRealizado) : <span className="text-gray-700">—</span>}</td>
                  <td className="px-3 py-3 text-right text-sm text-violet-400 whitespace-nowrap">
                    {fc.qtdTransacoesPrevista.toLocaleString('pt-BR')}
                    {fc.qtdTransacoesRealizadas != null && <span className="text-gray-600 text-xs"> / {fc.qtdTransacoesRealizadas.toLocaleString('pt-BR')}</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm whitespace-nowrap">
                    {fc.qtdMedRealizada != null
                      ? <span className="text-indigo-400">{fc.qtdMedRealizada.toLocaleString('pt-BR')}{medPct !== null && <span className="text-gray-600 text-xs ml-1">({medPct.toFixed(1)}%)</span>}</span>
                      : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-emerald-400 whitespace-nowrap">
                    {fc.receitaTarifariaWl != null ? formatCurrency(fc.receitaTarifariaWl) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-amber-400 whitespace-nowrap">{formatPercent(fc.margemPrevista, 2)}</td>
                  <td className="px-3 py-3 text-right text-sm text-amber-300 whitespace-nowrap">
                    {fc.margemRealizada != null ? formatPercent(fc.margemRealizada, 2) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEdit(fc)} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Editar</button>
                      <button onClick={() => handleDelete(fc)} className="text-xs text-red-700 hover:text-red-400 transition-colors">Excluir</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">{editingId ? 'Editar Forecast' : 'Novo Forecast'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mês de Referência *</label>
                  <input required type="month" value={form.mesRef} onChange={f('mesRef')} disabled={!!editingId} className={inp + (editingId ? ' opacity-50 cursor-not-allowed' : '')} />
                </div>
                <div>
                  <label className={lbl}>Data do Lançamento</label>
                  <input type="date" value={form.dataLancamento} onChange={f('dataLancamento')} className={inp} />
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600 font-semibold tracking-wider mb-3">PREVISTO</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lbl}>TPV Previsto (R$)</label><input type="number" step="0.01" value={form.tpvPrevisto} onChange={f('tpvPrevisto')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. Transações Prevista</label><input type="number" value={form.qtdTransacoesPrevista} onChange={f('qtdTransacoesPrevista')} className={inp} /></div>
                  <div><label className={lbl}>Faturamento Previsto (R$)</label><input type="number" step="0.01" value={form.faturamentoPrevisto} onChange={f('faturamentoPrevisto')} className={inp} /></div>
                  <div><label className={lbl}>Margem Prevista (%)</label><input type="number" step="0.01" min="0" max="100" value={form.margemPrevista} onChange={f('margemPrevista')} className={inp} /></div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600 font-semibold tracking-wider mb-3">REALIZADO (opcional)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lbl}>TPV Realizado (R$)</label><input type="number" step="0.01" value={form.tpvRealizado} onChange={f('tpvRealizado')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. Transações Realizadas</label><input type="number" value={form.qtdTransacoesRealizadas} onChange={f('qtdTransacoesRealizadas')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. MED Realizadas</label><input type="number" value={form.qtdMedRealizada} onChange={f('qtdMedRealizada')} className={inp} placeholder="Qtd. de transações MED" /></div>
                  <div><label className={lbl}>Rec. Tarifária WL (R$)</label><input type="number" step="0.01" value={form.receitaTarifariaWl} onChange={f('receitaTarifariaWl')} className={inp} placeholder="Tarifas cobradas dos WL" /></div>
                  <div><label className={lbl}>Margem Realizada (%)</label><input type="number" step="0.01" min="0" max="100" value={form.margemRealizada} onChange={f('margemRealizada')} className={inp} /></div>
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={form.notas} onChange={f('notas')} className={inp + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
