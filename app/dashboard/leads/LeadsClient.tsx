'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/utils'

interface Lead {
  id: string; name: string; email: string | null; phone: string | null
  company: string | null; source: string | null; status: string
  value: number | null; createdAt: Date; owner: { id: string; name: string }
}

const STATUSES = ['', 'NOVO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO']

const STATUS_DOT: Record<string, string> = {
  NOVO: 'bg-sky-400', QUALIFICADO: 'bg-violet-400', PROPOSTA: 'bg-amber-400',
  NEGOCIACAO: 'bg-orange-400', GANHO: 'bg-emerald-400', PERDIDO: 'bg-red-400',
}

export default function LeadsClient({ leads: initialLeads, role }: { leads: Lead[]; role: string; userId?: string }) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', position: '', source: '', value: '', notes: '' })

  const filtered = leads.filter(l => {
    const matchSearch = !search || [l.name, l.email, l.company].some(f => f?.toLowerCase().includes(search.toLowerCase()))
    return matchSearch && (!statusFilter || l.status === statusFilter)
  })

  const ganhos = leads.filter(l => l.status === 'GANHO').length
  const potencial = filtered.reduce((s, l) => s + (l.value || 0), 0)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const lead = await res.json()
        setLeads([lead, ...leads])
        setShowModal(false)
        setForm({ name: '', email: '', phone: '', company: '', position: '', source: '', value: '', notes: '' })
      }
    } finally { setLoading(false) }
  }

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Leads</h1>
          <p className="text-gray-600 text-sm mt-0.5">
            {filtered.length} leads · {ganhos} ganhos · Potencial {formatCurrency(potencial)}
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
          + Novo Lead
        </button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Buscar leads..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-gray-900 border border-gray-800 text-white placeholder-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
          {STATUSES.map(s => <option key={s} value={s}>{s ? LEAD_STATUS_LABELS[s] : 'Todos os status'}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Nome', 'Empresa', 'Origem', 'Status', 'Valor Potencial', 'Responsável', 'Criado'].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 py-3 px-4 ${h === 'Nome' ? 'pl-5' : ''} ${h === 'Valor Potencial' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(lead => (
              <tr key={lead.id} onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors">
                <td className="pl-5 pr-4 py-3.5">
                  <p className="text-sm font-medium text-white">{lead.name}</p>
                  {lead.email && <p className="text-xs text-gray-700">{lead.email}</p>}
                </td>
                <td className="px-4 py-3.5 text-sm text-gray-400">{lead.company || <span className="text-gray-700">—</span>}</td>
                <td className="px-4 py-3.5 text-xs text-gray-600">{lead.source || <span className="text-gray-700">—</span>}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[lead.status]}`} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_COLORS[lead.status]}`}>
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-400">
                  {lead.value ? <span className="text-emerald-400 font-medium">{formatCurrency(lead.value)}</span> : <span className="text-gray-700">—</span>}
                </td>
                <td className="px-4 py-3.5 text-sm text-gray-600">{lead.owner.name}</td>
                <td className="px-4 py-3.5 text-sm text-gray-700">{formatDate(lead.createdAt)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-700 text-sm">Nenhum lead encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Novo Lead</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={lbl}>Nome *</label><input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Telefone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Empresa</label><input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Cargo</label><input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Origem</label><input placeholder="LinkedIn, Indicação..." value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Valor Potencial (R$)</label><input type="number" min="0" step="0.01" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} className={inp} /></div>
                <div className="col-span-2"><label className={lbl}>Notas</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inp + ' resize-none'} /></div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-700 text-gray-500 hover:text-white text-sm rounded-lg">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {loading ? 'Salvando...' : 'Criar Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
