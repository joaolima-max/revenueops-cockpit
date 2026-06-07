'use client'

import { useState } from 'react'
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

export default function PedidosClient({ initial, clientes }: Props) {
  const [pedidos, setPedidos] = useState(initial)
  const [filterStatus, setFilterStatus] = useState('')
  const [mesRef, setMesRef] = useState(getCurrentMonth())
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ clienteId: '', tipo: TIPOS[0], descricao: '', valor: '', mesRef: getCurrentMonth() })
  const [saving, setSaving] = useState(false)

  const filtered = pedidos.filter(p =>
    (!filterStatus || p.status === filterStatus) &&
    (!mesRef || p.mesRef === mesRef)
  )

  const totalPendente = filtered.filter(p => p.status === 'PENDENTE').reduce((s, p) => s + p.valor, 0)
  const totalFaturado = filtered.filter(p => p.status === 'FATURADO').reduce((s, p) => s + p.valor, 0)
  const totalPago = filtered.filter(p => p.status === 'PAGO').reduce((s, p) => s + p.valor, 0)

  async function handleCreate() {
    if (!form.clienteId || !form.tipo || !form.valor) return
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

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Pedidos Cobráveis</h1>
          <p className="text-gray-600 text-sm mt-0.5">Itens extras faturáveis por cliente</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
        >
          + Novo Pedido
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
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

      <div className="flex gap-3 flex-wrap">
        <input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500">
          <option value="">Todos os status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{PEDIDO_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['Cliente', 'Tipo', 'Descrição', 'Mês Ref', 'Valor', 'Status', 'Ações'].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${h === 'Valor' || h === 'Ações' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-gray-800/50">
                <td className="px-4 py-3 text-white font-medium">{p.cliente.nome}</td>
                <td className="px-4 py-3 text-gray-400">{p.tipo}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.descricao || '—'}</td>
                <td className="px-4 py-3 text-gray-400">{formatMesRef(p.mesRef)}</td>
                <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{formatCurrency(p.valor)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PEDIDO_STATUS_COLORS[p.status]}`}>
                    {PEDIDO_STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
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
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
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
              <button onClick={() => setModal(false)}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving || !form.clienteId || !form.valor}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                {saving ? 'Salvando...' : 'Criar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
