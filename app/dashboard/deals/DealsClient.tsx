'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from '@/lib/utils'

interface Deal {
  id: string
  title: string
  value: number
  stage: string
  probability: number
  expectedAt: Date | null
  closedAt: Date | null
  createdAt: Date
  owner: { id: string; name: string }
  lead: { id: string; name: string; company: string | null } | null
}

interface LeadOption {
  id: string
  name: string
  company: string | null
}

interface Props {
  deals: Deal[]
  leads: LeadOption[]
  role: string
}

const STAGES = ['', 'PROSPECCAO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'FECHAMENTO', 'GANHO', 'PERDIDO']

export default function DealsClient({ deals: initialDeals, leads, role }: Props) {
  const router = useRouter()
  const [deals, setDeals] = useState(initialDeals)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: '', value: '', stage: 'PROSPECCAO', probability: '0',
    leadId: '', expectedAt: '', notes: '',
  })

  const filtered = deals.filter((d) => {
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase())
    const matchStage = !stageFilter || d.stage === stageFilter
    return matchSearch && matchStage
  })

  const totalValue = filtered.reduce((sum, d) => sum + d.value, 0)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const deal = await res.json()
        setDeals([deal, ...deals])
        setShowModal(false)
        setForm({ title: '', value: '', stage: 'PROSPECCAO', probability: '0', leadId: '', expectedAt: '', notes: '' })
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Negócios</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} negócio(s) · {formatCurrency(totalValue)} total
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Novo Negócio
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <input
            type="text"
            placeholder="Buscar negócios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>{s ? DEAL_STAGE_LABELS[s] : 'Todos os estágios'}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Negócio</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Lead</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Estágio</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Valor</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Prob.</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Responsável</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Previsão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{deal.title}</p>
                    <p className="text-xs text-gray-400">{formatDate(deal.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {deal.lead ? (deal.lead.company || deal.lead.name) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEAL_STAGE_COLORS[deal.stage]}`}>
                      {DEAL_STAGE_LABELS[deal.stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    {formatCurrency(deal.value)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{deal.probability}%</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{deal.owner.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {deal.expectedAt ? formatDate(deal.expectedAt) : '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhum negócio encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Novo Negócio</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Probabilidade (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.probability}
                    onChange={(e) => setForm({ ...form, probability: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estágio</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {STAGES.slice(1).map((s) => (
                      <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Vinculado</label>
                  <select
                    value={form.leadId}
                    onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Nenhum</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}{l.company ? ` — ${l.company}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Previsão de Fechamento</label>
                  <input
                    type="date"
                    value={form.expectedAt}
                    onChange={(e) => setForm({ ...form, expectedAt: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Criar Negócio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
