'use client'

import { useState } from 'react'
import { formatCurrency, DEAL_STAGE_LABELS } from '@/lib/utils'

interface Deal {
  id: string; title: string; value: number; stage: string; probability: number
  owner: { name: string }
  lead: { name: string; company: string | null } | null
}
interface Lead { id: string; name: string; company: string | null }

const STAGES = ['PROSPECCAO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'FECHAMENTO']

const STAGE_ACCENT: Record<string, string> = {
  PROSPECCAO: 'border-t-gray-500', QUALIFICACAO: 'border-t-sky-500',
  PROPOSTA: 'border-t-amber-500', NEGOCIACAO: 'border-t-orange-500', FECHAMENTO: 'border-t-violet-500',
}
const CARD_BORDER: Record<string, string> = {
  PROSPECCAO: 'border-l-gray-500', QUALIFICACAO: 'border-l-sky-500',
  PROPOSTA: 'border-l-amber-500', NEGOCIACAO: 'border-l-orange-500', FECHAMENTO: 'border-l-violet-500',
}
const DOT: Record<string, string> = {
  PROSPECCAO: 'bg-gray-400', QUALIFICACAO: 'bg-sky-400',
  PROPOSTA: 'bg-amber-400', NEGOCIACAO: 'bg-orange-400', FECHAMENTO: 'bg-violet-400',
}

const emptyForm = { title: '', value: '', probability: '30', leadId: '' }

export default function PipelineClient({ deals: initial, leads, userId, role }: {
  deals: Deal[]; leads: Lead[]; userId: string; role: string
}) {
  const [deals, setDeals] = useState(initial)
  const [dragging, setDragging] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function moveDeal(dealId: string, newStage: string) {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d))
    await fetch(`/api/deals/${dealId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    })
  }

  async function handleCreate(stage: string) {
    if (!form.title || !form.value) return
    setSaving(true)
    const res = await fetch('/api/deals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title, value: parseFloat(form.value),
        probability: parseInt(form.probability) || 0,
        leadId: form.leadId || null, stage,
      }),
    })
    if (res.ok) {
      const deal = await res.json()
      setDeals(prev => [deal, ...prev])
      setAddingTo(null)
      setForm(emptyForm)
    }
    setSaving(false)
  }

  async function deleteDeal(id: string) {
    if (!confirm('Excluir negócio?')) return
    const res = await fetch(`/api/deals/${id}`, { method: 'DELETE' })
    if (res.ok) setDeals(prev => prev.filter(d => d.id !== id))
  }

  const totalPonderado = deals.reduce((s, d) => s + d.value * (d.probability / 100), 0)

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-white">Pipeline</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          {deals.length} negócios · Valor ponderado {formatCurrency(totalPonderado)}
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {STAGES.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage)
          const stageTotal = stageDeals.reduce((s, d) => s + d.value, 0)
          const isAdding = addingTo === stage

          return (
            <div key={stage} className="flex-shrink-0 w-64"
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragging) { moveDeal(dragging, stage); setDragging(null) } }}
            >
              <div className={`border-t-2 ${STAGE_ACCENT[stage]} bg-gray-900 border-x border-gray-800 rounded-t-xl px-3 py-2.5 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${DOT[stage]}`} />
                  <span className="text-xs font-semibold text-white">{DEAL_STAGE_LABELS[stage]}</span>
                  <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">{stageDeals.length}</span>
                </div>
                <span className="text-xs text-gray-600">{formatCurrency(stageTotal)}</span>
              </div>

              <div className="bg-gray-900 border-x border-b border-gray-800 rounded-b-xl p-2 space-y-2 min-h-20">
                {stageDeals.map(deal => (
                  <div key={deal.id} draggable onDragStart={() => setDragging(deal.id)}
                    className={`bg-gray-800/50 border border-gray-700/40 border-l-2 ${CARD_BORDER[deal.stage]} rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-gray-800 transition-colors group`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-medium text-white leading-tight flex-1">{deal.title}</p>
                      {(role === 'ADMIN') && (
                        <button onClick={() => deleteDeal(deal.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition-opacity flex-shrink-0">✕</button>
                      )}
                    </div>
                    {deal.lead && (
                      <p className="text-xs text-gray-600 mt-0.5 truncate">{deal.lead.company || deal.lead.name}</p>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs font-bold text-emerald-400">{formatCurrency(deal.value)}</span>
                      <span className="text-xs text-gray-600">{deal.probability}%</span>
                    </div>
                    <p className="text-xs text-gray-700 mt-0.5">{deal.owner.name}</p>
                  </div>
                ))}

                {isAdding ? (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-2.5 space-y-2">
                    <input autoFocus value={form.title}
                      onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="Título *"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                    <input type="number" value={form.value}
                      onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                      placeholder="Valor R$ *"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input type="number" min="0" max="100" value={form.probability}
                        onChange={e => setForm(p => ({ ...p, probability: e.target.value }))}
                        placeholder="% prob."
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                      <select value={form.leadId}
                        onChange={e => setForm(p => ({ ...p, leadId: e.target.value }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500">
                        <option value="">Lead opt.</option>
                        {leads.map(l => <option key={l.id} value={l.id}>{l.company || l.name}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setAddingTo(null); setForm(emptyForm) }}
                        className="flex-1 py-1.5 text-xs text-gray-500 border border-gray-600 rounded hover:bg-gray-700">
                        Cancelar
                      </button>
                      <button onClick={() => handleCreate(stage)} disabled={saving || !form.title || !form.value}
                        className="flex-1 py-1.5 text-xs font-medium text-white rounded disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                        {saving ? '...' : 'Criar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setAddingTo(stage); setForm(emptyForm) }}
                    className="w-full py-2 text-xs text-gray-600 hover:text-gray-400 hover:bg-gray-800/50 rounded-lg transition-colors flex items-center justify-center gap-1">
                    + Adicionar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
