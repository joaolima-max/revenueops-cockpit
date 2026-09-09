'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency, formatTPV, formatPercent, formatMesRef, getCurrentMonth, formatDate} from '@/lib/utils'

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

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="t-h1 text-fg">Forecast da Carteira</h1>
          <p className="text-subtle text-sm mt-0.5">Previsão geral de TPV, transações, faturamento e margem</p>
        </div>
        <button onClick={openNew}
          className="bp-btn-primary px-4 py-2 text-sm font-medium rounded-lg transition-all">
          + Novo Forecast
        </button>
      </div>

      {currentMonthFc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { l: 'TPV Previsto (mês atual)', v: formatTPV(currentMonthFc.tpvPrevisto), r: currentMonthFc.tpvRealizado ? formatTPV(currentMonthFc.tpvRealizado) : null, c: 'text-accent-soft' },
            { l: 'Qtd. Transações Prevista', v: currentMonthFc.qtdTransacoesPrevista.toLocaleString('pt-BR'), r: currentMonthFc.qtdTransacoesRealizadas ? currentMonthFc.qtdTransacoesRealizadas.toLocaleString('pt-BR') : null, c: 'text-accent-soft' },
            { l: 'Faturamento Previsto', v: formatCurrency(currentMonthFc.faturamentoPrevisto), r: null, c: 'text-pos' },
            { l: 'Margem Prevista', v: formatPercent(currentMonthFc.margemPrevista, 2), r: currentMonthFc.margemRealizada != null ? formatPercent(currentMonthFc.margemRealizada, 2) : null, c: 'text-warn' },
          ].map(k => (
            <div key={k.l} className="bg-surface border border-line rounded-xl p-4">
              <p className="text-subtle text-xs mb-1.5">{k.l}</p>
              <p className={`text-xl font-bold tnum ${k.c}`}>{k.v}</p>
              {k.r && <p className="text-xs text-subtle mt-0.5">Realizado: <span className="text-muted">{k.r}</span></p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-5">
        <input type="month" value={mesFilter} onChange={e => setMesFilter(e.target.value)}
          className="bp-field text-sm" />
        {mesFilter && (
          <button onClick={() => setMesFilter('')} className="text-subtle hover:text-muted text-sm px-3">Limpar</button>
        )}
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              {['Mês', 'Lançamento', 'TPV Previsto', 'TPV Realizado', 'Qtd. Tx', 'Qtd. MED', 'Rec. Tarif. WL', 'Margem Prev.', 'Margem Real.', ''].map(h => (
                <th key={h} className={`t-label text-subtle py-3 whitespace-nowrap ${h === 'Mês' || h === '' ? 'text-left px-5' : 'text-right px-3'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center text-subtle py-12 text-sm">Carregando...</td></tr>
            ) : forecasts.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-subtle py-12 text-sm">Nenhum forecast cadastrado</td></tr>
            ) : forecasts.map(fc => {
              const medPct = fc.qtdMedRealizada != null && fc.qtdTransacoesRealizadas && fc.qtdTransacoesRealizadas > 0
                ? (fc.qtdMedRealizada / fc.qtdTransacoesRealizadas) * 100 : null
              return (
                <tr key={fc.id} className="border-b border-line hover:bg-[var(--bp-hover)]">
                  <td className="px-5 py-3 text-sm font-semibold text-fg whitespace-nowrap">{formatMesRef(fc.mesRef)}</td>
                  <td className="px-3 py-3 text-right text-xs text-subtle whitespace-nowrap">
                    {fc.dataLancamento ? formatDate(fc.dataLancamento) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-accent-soft whitespace-nowrap">{formatTPV(fc.tpvPrevisto)}</td>
                  <td className="px-3 py-3 text-right text-sm text-accent-soft whitespace-nowrap">{fc.tpvRealizado != null ? formatTPV(fc.tpvRealizado) : <span className="text-subtle">—</span>}</td>
                  <td className="px-3 py-3 text-right text-sm text-accent-soft whitespace-nowrap">
                    {fc.qtdTransacoesPrevista.toLocaleString('pt-BR')}
                    {fc.qtdTransacoesRealizadas != null && <span className="text-subtle text-xs"> / {fc.qtdTransacoesRealizadas.toLocaleString('pt-BR')}</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm whitespace-nowrap">
                    {fc.qtdMedRealizada != null
                      ? <span className="text-accent-soft">{fc.qtdMedRealizada.toLocaleString('pt-BR')}{medPct !== null && <span className="text-subtle text-xs ml-1">({medPct.toFixed(1)}%)</span>}</span>
                      : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-pos whitespace-nowrap">
                    {fc.receitaTarifariaWl != null ? formatCurrency(fc.receitaTarifariaWl) : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-warn whitespace-nowrap">{formatPercent(fc.margemPrevista, 2)}</td>
                  <td className="px-3 py-3 text-right text-sm text-warn whitespace-nowrap">
                    {fc.margemRealizada != null ? formatPercent(fc.margemRealizada, 2) : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => openEdit(fc)} className="text-xs text-subtle hover:text-muted transition-colors">Editar</button>
                      <button onClick={() => handleDelete(fc)} className="text-xs text-neg hover:text-neg transition-colors">Excluir</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-surface border border-line-2 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">{editingId ? 'Editar Forecast' : 'Novo Forecast'}</h2>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Mês de Referência *</label>
                  <input required type="month" value={form.mesRef} onChange={f('mesRef')} disabled={!!editingId} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Data do Lançamento</label>
                  <input type="date" value={form.dataLancamento} onChange={f('dataLancamento')} className={inp} />
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <p className="text-xs text-subtle font-semibold tracking-wider mb-3">PREVISTO</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={lbl}>TPV Previsto (R$)</label><input type="number" step="0.01" value={form.tpvPrevisto} onChange={f('tpvPrevisto')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. Transações Prevista</label><input type="number" value={form.qtdTransacoesPrevista} onChange={f('qtdTransacoesPrevista')} className={inp} /></div>
                  <div><label className={lbl}>Faturamento Previsto (R$)</label><input type="number" step="0.01" value={form.faturamentoPrevisto} onChange={f('faturamentoPrevisto')} className={inp} /></div>
                  <div><label className={lbl}>Margem Prevista (%)</label><input type="number" step="0.01" min="0" max="100" value={form.margemPrevista} onChange={f('margemPrevista')} className={inp} /></div>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <p className="text-xs text-subtle font-semibold tracking-wider mb-3">REALIZADO (opcional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={lbl}>TPV Realizado (R$)</label><input type="number" step="0.01" value={form.tpvRealizado} onChange={f('tpvRealizado')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. Transações Realizadas</label><input type="number" value={form.qtdTransacoesRealizadas} onChange={f('qtdTransacoesRealizadas')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. MED Realizadas</label><input type="number" value={form.qtdMedRealizada} onChange={f('qtdMedRealizada')} className={inp} placeholder="Qtd. de transações MED" /></div>
                  <div><label className={lbl}>Rec. Tarifária WL (R$)</label><input type="number" step="0.01" value={form.receitaTarifariaWl} onChange={f('receitaTarifariaWl')} className={inp} placeholder="Tarifas cobradas dos WL" /></div>
                  <div><label className={lbl}>Margem Realizada (%)</label><input type="number" step="0.01" min="0" max="100" value={form.margemRealizada} onChange={f('margemRealizada')} className={inp} /></div>
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={form.notas} onChange={f('notas')} className={inp + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-subtle border border-line-2 hover:text-fg text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="bp-btn-primary px-4 py-2 text-sm font-medium rounded-lg transition-all">
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
