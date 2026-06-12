'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency, formatMesRef } from '@/lib/utils'

interface Cliente { id: string; nome: string; modeloOperacional: string }

interface ContaReceber {
  id: string
  descricao: string
  tipo: string
  valor: number
  parcela: number | null
  totalParcel: number | null
  dataVenc: string
  dataFatura: string | null
  dataPago: string | null
  status: string
  notas: string | null
  cliente: { id: string; nome: string; modeloOperacional: string }
}

interface Props { clientes: (Cliente & { status: string })[] }

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente', FATURADO: 'Faturado', PAGO: 'Pago', INADIMPLENTE: 'Inadimplente',
}
const STATUS_COLORS: Record<string, string> = {
  PENDENTE: 'bg-amber-500/10 text-amber-400',
  FATURADO: 'bg-sky-500/10 text-sky-400',
  PAGO: 'bg-emerald-500/10 text-emerald-400',
  INADIMPLENTE: 'bg-red-500/10 text-red-400',
}
const TIPOS = ['Mensalidade API', 'Sustentação White Label', 'Setup', 'Setup Parcelado', 'Pedido Extra', 'Outro']

const emptyForm = {
  clienteId: '', descricao: '', tipo: TIPOS[0], valor: '',
  dataVenc: '', parcela: '', totalParcel: '', notas: '',
}

function isVencida(conta: ContaReceber): boolean {
  if (conta.status === 'PAGO' || conta.status === 'INADIMPLENTE') return false
  return new Date(conta.dataVenc) < new Date()
}

export default function FinanceiroClient({ clientes }: Props) {
  const [contas, setContas] = useState<ContaReceber[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMes, setFilterMes] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'lista' | 'inadimplentes' | 'calendario'>('lista')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filterStatus) p.set('status', filterStatus)
    if (filterMes) p.set('mes', filterMes)
    const res = await fetch(`/api/financeiro?${p}`)
    if (res.ok) { const d = await res.json(); setContas(d.contas) }
    setLoading(false)
  }, [filterStatus, filterMes])

  useEffect(() => { fetchData() }, [fetchData])

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  function openNew() { setEditingId(null); setForm(emptyForm); setShowModal(true) }
  function openEdit(c: ContaReceber) {
    setEditingId(c.id)
    setForm({
      clienteId: c.cliente.id, descricao: c.descricao, tipo: c.tipo, valor: String(c.valor),
      dataVenc: c.dataVenc.split('T')[0], parcela: c.parcela ? String(c.parcela) : '',
      totalParcel: c.totalParcel ? String(c.totalParcel) : '', notas: c.notas || '',
    })
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    if (editingId) {
      const res = await fetch(`/api/financeiro/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: form.descricao, valor: form.valor, dataVenc: form.dataVenc, notas: form.notas }),
      })
      if (res.ok) { const d = await res.json(); setContas(p => p.map(c => c.id === editingId ? d.conta : c)) }
    } else {
      const res = await fetch('/api/financeiro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { const d = await res.json(); setContas(p => [d.conta, ...p]) }
    }
    setShowModal(false); setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/financeiro/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) { const d = await res.json(); setContas(p => p.map(c => c.id === id ? d.conta : c)) }
  }

  async function deleteConta(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    const res = await fetch(`/api/financeiro/${id}`, { method: 'DELETE' })
    if (res.ok) setContas(p => p.filter(c => c.id !== id))
  }

  const inadimplentes = contas.filter(c => c.status === 'INADIMPLENTE')
  const vencidas = contas.filter(c => isVencida(c) && c.status !== 'INADIMPLENTE')

  const totalPendente = contas.filter(c => c.status === 'PENDENTE').reduce((s, c) => s + c.valor, 0)
  const totalFaturado = contas.filter(c => c.status === 'FATURADO').reduce((s, c) => s + c.valor, 0)
  const totalPago = contas.filter(c => c.status === 'PAGO').reduce((s, c) => s + c.valor, 0)
  const totalInadimp = inadimplentes.reduce((s, c) => s + c.valor, 0)

  // Calendar: group contas by day
  const now = new Date()
  const calYear = now.getFullYear(), calMonth = now.getMonth()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const calendarContas = contas.filter(c => {
    const d = new Date(c.dataVenc)
    return d.getFullYear() === calYear && d.getMonth() === calMonth
  })
  const byDay: Record<number, ContaReceber[]> = {}
  calendarContas.forEach(c => {
    const day = new Date(c.dataVenc).getDate()
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(c)
  })

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Financeiro</h1>
          <p className="text-gray-600 text-sm mt-0.5">Fluxo de recebimentos e inadimplência</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
          + Novo Lançamento
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'A Receber (Pendente)', value: totalPendente, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Faturado (Aguard. Pgto)', value: totalFaturado, color: 'text-sky-400', bg: 'bg-sky-500/10' },
          { label: 'Recebido (Pago)', value: totalPago, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Inadimplência', value: totalInadimp, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-4`}>
            <p className="text-gray-500 text-xs mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{formatCurrency(k.value)}</p>
          </div>
        ))}
      </div>

      {/* Vencidas Alert */}
      {vencidas.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <span className="text-amber-400 text-lg">⚠</span>
          <div>
            <p className="text-amber-400 text-sm font-semibold">{vencidas.length} lançamento(s) vencido(s) sem pagamento</p>
            <p className="text-gray-500 text-xs mt-0.5">Total: {formatCurrency(vencidas.reduce((s, c) => s + c.valor, 0))} — Marque como Inadimplente se necessário</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['lista', 'inadimplentes', 'calendario'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-600 hover:text-gray-400'}`}>
            {t === 'lista' ? 'Lista' : t === 'inadimplentes' ? `Inadimplentes${inadimplentes.length > 0 ? ` (${inadimplentes.length})` : ''}` : 'Calendário'}
          </button>
        ))}
      </div>

      {/* Filters (lista tab only) */}
      {tab === 'lista' && (
        <div className="flex gap-3 flex-wrap">
          <input type="month" value={filterMes} onChange={e => setFilterMes(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500">
            <option value="">Todos os status</option>
            {Object.keys(STATUS_LABELS).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {(filterMes || filterStatus) && (
            <button onClick={() => { setFilterMes(''); setFilterStatus('') }}
              className="text-gray-600 hover:text-gray-400 text-sm px-3">Limpar</button>
          )}
        </div>
      )}

      {/* Lista Tab */}
      {tab === 'lista' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Cliente', 'Descrição', 'Tipo', 'Vencimento', 'Valor', 'Status', 'Ações'].map(h => (
                  <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${h === 'Valor' || h === 'Ações' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-gray-700 py-12 text-sm">Carregando...</td></tr>
              ) : contas.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-700 py-12 text-sm">Nenhum lançamento encontrado</td></tr>
              ) : contas.map(c => {
                const vencida = isVencida(c)
                const dateStr = new Date(c.dataVenc).toLocaleDateString('pt-BR')
                return (
                  <tr key={c.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${vencida ? 'bg-amber-500/5' : ''}`}>
                    <td className="px-4 py-3 text-white font-medium">{c.cliente.nome}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {c.descricao}
                      {c.parcela && c.totalParcel && <span className="text-gray-600 text-xs ml-1">({c.parcela}/{c.totalParcel})</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.tipo}</td>
                    <td className="px-4 py-3">
                      <span className={vencida ? 'text-amber-400 font-semibold' : 'text-gray-400'}>{dateStr}</span>
                      {vencida && <span className="ml-1 text-xs text-amber-600">Vencida</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{formatCurrency(c.valor)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === 'PENDENTE' && (
                          <button onClick={() => updateStatus(c.id, 'FATURADO')}
                            className="text-xs px-2 py-1 bg-sky-500/10 text-sky-400 rounded hover:bg-sky-500/20">Faturar</button>
                        )}
                        {(c.status === 'PENDENTE' || c.status === 'FATURADO') && (
                          <button onClick={() => updateStatus(c.id, 'PAGO')}
                            className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20">Pago</button>
                        )}
                        {(c.status === 'PENDENTE' || c.status === 'FATURADO') && vencida && (
                          <button onClick={() => updateStatus(c.id, 'INADIMPLENTE')}
                            className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">Inadimplente</button>
                        )}
                        <button onClick={() => openEdit(c)}
                          className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700">Editar</button>
                        <button onClick={() => deleteConta(c.id)}
                          className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inadimplentes Tab */}
      {tab === 'inadimplentes' && (
        <div className="space-y-3">
          {inadimplentes.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <p className="text-emerald-400 font-semibold">Nenhum inadimplente</p>
              <p className="text-gray-600 text-sm mt-1">Todos os clientes estão em dia</p>
            </div>
          ) : inadimplentes.map(c => (
            <div key={c.id} className="bg-gray-900 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold">{c.cliente.nome}</p>
                  <p className="text-gray-500 text-sm">{c.descricao} · Venc: {new Date(c.dataVenc).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-red-400 font-bold text-lg">{formatCurrency(c.valor)}</p>
                  <button onClick={() => updateStatus(c.id, 'PAGO')}
                    className="mt-1 text-xs px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20">
                    Marcar Pago
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendário Tab */}
      {tab === 'calendario' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            {new Date(calYear, calMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-center text-xs text-gray-600 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayContas = byDay[day] || []
              const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear()
              const hasContas = dayContas.length > 0
              const totalDay = dayContas.reduce((s, c) => s + c.valor, 0)
              return (
                <div key={day}
                  className={`rounded-lg p-1.5 min-h-[52px] border ${isToday ? 'border-emerald-500/40 bg-emerald-500/5' : hasContas ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800/50'}`}>
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-emerald-400' : 'text-gray-500'}`}>{day}</div>
                  {dayContas.slice(0, 2).map(c => (
                    <div key={c.id} className={`text-xs px-1 rounded mb-0.5 truncate ${STATUS_COLORS[c.status]}`} title={`${c.cliente.nome}: ${formatCurrency(c.valor)}`}>
                      {c.cliente.nome.split(' ')[0]}
                    </div>
                  ))}
                  {hasContas && (
                    <div className="text-xs text-gray-600 mt-0.5">{formatCurrency(totalDay)}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">{editingId ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {!editingId && (
                <div>
                  <label className={lbl}>Cliente *</label>
                  <select required value={form.clienteId} onChange={f('clienteId')} className={inp}>
                    <option value="">Selecione...</option>
                    {clientes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nome}{c.status !== 'ATIVO' ? ` (${c.status === 'ENCERRADO' ? 'Encerrado' : c.status === 'INATIVO' ? 'Inativo' : c.status})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={lbl}>Descrição *</label>
                <input required type="text" value={form.descricao} onChange={f('descricao')} className={inp} placeholder="Ex: Mensalidade Janeiro/2026" />
              </div>
              {!editingId && (
                <div>
                  <label className={lbl}>Tipo</label>
                  <select value={form.tipo} onChange={f('tipo')} className={inp}>
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Valor (R$) *</label>
                  <input required type="number" step="0.01" value={form.valor} onChange={f('valor')} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Data de Vencimento *</label>
                  <input required type="date" value={form.dataVenc} onChange={f('dataVenc')} className={inp} />
                </div>
              </div>
              {!editingId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Parcela nº</label>
                    <input type="number" value={form.parcela} onChange={f('parcela')} className={inp} placeholder="1" />
                  </div>
                  <div>
                    <label className={lbl}>Total de Parcelas</label>
                    <input type="number" value={form.totalParcel} onChange={f('totalParcel')} className={inp} placeholder="12" />
                  </div>
                </div>
              )}
              <div>
                <label className={lbl}>Notas</label>
                <textarea value={form.notas} onChange={f('notas')} rows={2} className={inp + ' resize-none'} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
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
