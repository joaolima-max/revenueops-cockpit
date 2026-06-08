'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatMesRef, getCurrentMonth, PEDIDO_STATUS_LABELS, PEDIDO_STATUS_COLORS } from '@/lib/utils'

interface Pedido {
  id: string
  tipo: string
  descricao?: string | null
  valor: number
  mesRef: string
  status: string
  cliente: { id: string; nome: string }
  createdAt: string
}

interface Cliente { id: string; nome: string }

interface Props {
  initial: Pedido[]
  clientes: Cliente[]
}

const TIPOS = ['Certificado de Integração', 'Solicitação de Background Check', 'Abertura de Segunda Conta']
const STATUS_LIST = ['PENDENTE', 'FATURADO', 'PAGO', 'CANCELADO']
const NOVO_TIPO_SENTINEL = '+ Novo tipo...'

function loadCustomTipos(): string[] {
  try {
    const raw = localStorage.getItem('pedido_tipos')
    if (raw) return JSON.parse(raw) as string[]
  } catch {}
  return []
}

export default function PedidosClient({ initial, clientes }: Props) {
  const [pedidos, setPedidos] = useState(initial)
  const [filterStatus, setFilterStatus] = useState('')
  const [mesRef, setMesRef] = useState(getCurrentMonth())
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ clienteId: '', tipo: TIPOS[0], descricao: '', valor: '', mesRef: getCurrentMonth() })
  const [saving, setSaving] = useState(false)

  const [customTipos, setCustomTipos] = useState<string[]>([])
  const [newTipoInput, setNewTipoInput] = useState('')

  // Load custom tipos from localStorage after mount (client-only)
  useEffect(() => {
    setCustomTipos(loadCustomTipos())
  }, [])

  const allTipos = [...TIPOS, ...customTipos, NOVO_TIPO_SENTINEL]
  const isNewTipo = form.tipo === NOVO_TIPO_SENTINEL

  function handleAddCustomTipo() {
    const trimmed = newTipoInput.trim()
    if (!trimmed) return
    const updated = [...customTipos, trimmed]
    setCustomTipos(updated)
    localStorage.setItem('pedido_tipos', JSON.stringify(updated))
    setForm(p => ({ ...p, tipo: trimmed }))
    setNewTipoInput('')
  }

  const filtered = pedidos.filter(p =>
    (!filterStatus || p.status === filterStatus) &&
    (!mesRef || p.mesRef === mesRef)
  )

  const totalPendente = filtered.filter(p => p.status === 'PENDENTE').reduce((s, p) => s + p.valor, 0)
  const totalFaturado = filtered.filter(p => p.status === 'FATURADO').reduce((s, p) => s + p.valor, 0)
  const totalPago = filtered.filter(p => p.status === 'PAGO').reduce((s, p) => s + p.valor, 0)
  const totalGeral = totalPendente + totalFaturado + totalPago

  async function handleCreate() {
    if (!form.clienteId || !form.tipo || form.tipo === NOVO_TIPO_SENTINEL || !form.valor) return
    setSaving(true)
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const { pedido } = await res.json()
      setPedidos(p => [pedido, ...p])
      setModal(false)
      setForm({ clienteId: '', tipo: TIPOS[0], descricao: '', valor: '', mesRef: getCurrentMonth() })
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/pedidos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const { pedido } = await res.json()
      setPedidos(p => p.map(x => x.id === id ? { ...x, ...pedido } : x))
    }
  }

  async function deletePedido(id: string) {
    if (!confirm('Excluir pedido?')) return
    const res = await fetch(`/api/pedidos/${id}`, { method: 'DELETE' })
    if (res.ok) setPedidos(p => p.filter(x => x.id !== id))
  }

  const printDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      {/* Print styles */}
      <style media="print">{`
        @page { size: A4 landscape; margin: 1cm; }
        body * { visibility: hidden; }
        #pedidos-print-area, #pedidos-print-area * { visibility: visible; }
        #pedidos-print-area { position: fixed; top: 0; left: 0; width: 100%; }
        #pedidos-print-header { display: block !important; margin-bottom: 16px; }
        #pedidos-print-header h1 { font-size: 18pt; font-weight: bold; color: #000; margin: 0 0 4px 0; }
        #pedidos-print-header p { font-size: 10pt; color: #555; margin: 0; }
        #pedidos-print-table { width: 100%; border-collapse: collapse; }
        #pedidos-print-table th {
          background: #f5f5f5; color: #333; font-size: 9pt;
          font-weight: 600; padding: 6px 10px; border: 1px solid #ddd; text-align: left;
        }
        #pedidos-print-table th.right { text-align: right; }
        #pedidos-print-table td {
          font-size: 9pt; color: #111; padding: 5px 10px;
          border: 1px solid #eee; background: #fff;
        }
        #pedidos-print-table td.right { text-align: right; }
        #pedidos-print-table td.muted { color: #666; }
        #pedidos-print-totals { margin-top: 14px; display: flex; gap: 32px; }
        #pedidos-print-totals div { font-size: 10pt; }
        #pedidos-print-totals span { font-weight: bold; }
        .no-print { display: none !important; }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-lg font-bold text-white">Pedidos Cobráveis</h1>
          <p className="text-gray-600 text-sm mt-0.5">Itens extras faturáveis por cliente</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-300 border border-gray-700 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 12H2a1 1 0 00-1 1v4a1 1 0 001 1h2M20 12h2a1 1 0 011 1v4a1 1 0 01-1 1h-2" />
            </svg>
            Exportar PDF
          </button>
          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
          >
            + Novo Pedido
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 no-print">
        {[
          { label: 'Pendente', value: totalPendente, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Faturado', value: totalFaturado, color: 'text-sky-400', bg: 'bg-sky-500/10' },
          { label: 'Pago', value: totalPago, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-4`}>
            <p className="text-gray-500 text-xs mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{formatCurrency(k.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap no-print">
        <input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500">
          <option value="">Todos os status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{PEDIDO_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {/* Printable area */}
      <div id="pedidos-print-area">
        <div id="pedidos-print-header" style={{ display: 'none' }}>
          <h1>XDEAL — Relatório de Pedidos</h1>
          <p>Gerado em {printDate}{mesRef ? ` · Mês: ${formatMesRef(mesRef)}` : ''}{filterStatus ? ` · Status: ${PEDIDO_STATUS_LABELS[filterStatus]}` : ''}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table id="pedidos-print-table" className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Cliente', 'Tipo', 'Descrição', 'Mês Ref', 'Valor', 'Status', 'Ações'].map(h => (
                  <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${h === 'Valor' || h === 'Ações' ? 'text-right right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-800/50">
                  <td className="px-4 py-3 text-white font-medium">{p.cliente.nome}</td>
                  <td className="px-4 py-3 text-gray-400">{p.tipo}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs muted">{p.descricao || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatMesRef(p.mesRef)}</td>
                  <td className="px-4 py-3 text-right right text-emerald-400 font-semibold">{formatCurrency(p.valor)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PEDIDO_STATUS_COLORS[p.status]}`}>
                      {PEDIDO_STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right no-print">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === 'PENDENTE' && (
                        <button onClick={() => updateStatus(p.id, 'FATURADO')}
                          className="text-xs px-2 py-1 bg-sky-500/10 text-sky-400 rounded hover:bg-sky-500/20">
                          Faturar
                        </button>
                      )}
                      {p.status === 'FATURADO' && (
                        <button onClick={() => updateStatus(p.id, 'PAGO')}
                          className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20">
                          Pago
                        </button>
                      )}
                      <button onClick={() => deletePedido(p.id)}
                        className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-600">Nenhum pedido encontrado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Print totals */}
        <div id="pedidos-print-totals" style={{ display: 'none' }}>
          <div>Pendente: <span>{formatCurrency(totalPendente)}</span></div>
          <div>Faturado: <span>{formatCurrency(totalFaturado)}</span></div>
          <div>Pago: <span>{formatCurrency(totalPago)}</span></div>
          <div>Total: <span>{formatCurrency(totalGeral)}</span></div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-base font-bold text-white">Novo Pedido Cobrável</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Cliente *</label>
                <select value={form.clienteId} onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                  <option value="">Selecione um cliente</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tipo *</label>
                <select
                  value={form.tipo}
                  onChange={e => { setForm(p => ({ ...p, tipo: e.target.value })); setNewTipoInput('') }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {allTipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {isNewTipo && (
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newTipoInput}
                      onChange={e => setNewTipoInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomTipo())}
                      placeholder="Nome do novo tipo..."
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTipo}
                      disabled={!newTipoInput.trim()}
                      className="px-3 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
                    >
                      Adicionar
                    </button>
                  </div>
                )}
              </div>
              <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição (opcional)" rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Valor (R$) *</label>
                  <input type="number" step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                    placeholder="0,00"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Mês Ref *</label>
                  <input type="month" value={form.mesRef} onChange={e => setForm(p => ({ ...p, mesRef: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(false); setNewTipoInput('') }}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800">
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.clienteId || !form.valor || isNewTipo}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
              >
                {saving ? 'Salvando...' : 'Criar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
