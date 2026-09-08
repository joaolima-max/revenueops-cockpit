'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, LEAD_STATUS_LABELS, cn } from '@/lib/utils'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'

interface Lead {
  id: string; name: string; email: string | null; phone: string | null
  company: string | null; source: string | null; status: string
  value: number | null; createdAt: Date; owner: { id: string; name: string }
}

const STATUSES = ['', 'NOVO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO']

/** O funil progride em intensidade do accent — só o desfecho usa semântica. */
const FUNNEL_DOT: Record<string, string> = {
  NOVO: 'bg-accent/30', QUALIFICADO: 'bg-accent/50', PROPOSTA: 'bg-accent/70',
  NEGOCIACAO: 'bg-accent', GANHO: 'bg-pos', PERDIDO: 'bg-neg',
}
const FUNNEL_TEXT: Record<string, string> = {
  NOVO: 'text-subtle', QUALIFICADO: 'text-muted', PROPOSTA: 'text-accent-soft',
  NEGOCIACAO: 'text-accent-soft', GANHO: 'text-pos', PERDIDO: 'text-neg',
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

  const inp = 'w-full bg-surface-2 border border-line text-fg t-body rounded-lg px-3.5 py-2.5 transition-colors duration-[180ms] focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Leads"
        sub={`${filtered.length} leads · ${ganhos} ganhos · Potencial ${formatCurrency(potencial)}`}
        actions={<Button variant="primary" onClick={() => setShowModal(true)}>Novo lead</Button>}
      />

      <Panel padded={false}>
        <div className="flex gap-3 flex-wrap p-3">
          <input
            type="text" placeholder="Buscar leads…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[12rem] bg-surface-2 border border-line text-fg rounded-lg px-3.5 py-2.5 t-body transition-colors duration-[180ms] focus:outline-none focus:border-accent"
          />
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-surface-2 border border-line text-muted rounded-lg px-3.5 py-2.5 t-body transition-colors duration-[180ms] focus:outline-none focus:border-accent"
          >
            {STATUSES.map(s => <option key={s} value={s}>{s ? LEAD_STATUS_LABELS[s] : 'Todos os status'}</option>)}
          </select>
        </div>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Nome</Th>
              <Th>Empresa</Th>
              <Th>Origem</Th>
              <Th>Status</Th>
              <Th align="right">Valor Potencial</Th>
              <Th>Responsável</Th>
              <Th>Criado</Th>
            </HeadRow>
          </THead>
          <tbody>
            {filtered.map(lead => (
              <Row
                key={lead.id}
                onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                className="cursor-pointer"
              >
                <Td className="pl-5">
                  <span className="block t-body font-medium text-fg">{lead.name}</span>
                  {lead.email && <span className="block t-mono text-subtle mt-1">{lead.email}</span>}
                </Td>
                <Td>{lead.company || <span className="text-subtle">—</span>}</Td>
                <Td className="text-subtle">{lead.source || '—'}</Td>
                {/* Funil lido por intensidade do accent, não por arco-íris de matizes. */}
                <Td>
                  <span className={cn(
                    'inline-flex items-center gap-2 t-label whitespace-nowrap',
                    FUNNEL_TEXT[lead.status] ?? 'text-muted'
                  )}>
                    <span aria-hidden className={cn('w-[5px] h-[5px] rotate-45 rounded-[1px]', FUNNEL_DOT[lead.status] ?? 'bg-subtle')} />
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </Td>
                <Td align="right" numeric className="text-fg font-medium">
                  {lead.value ? formatCurrency(lead.value) : <span className="text-subtle font-normal">—</span>}
                </Td>
                <Td className="text-subtle">{lead.owner.name}</Td>
                <Td className="text-subtle tabular-nums">{formatDate(lead.createdAt)}</Td>
              </Row>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={7}>Nenhum lead encontrado com esses filtros.</EmptyRow>
            )}
          </tbody>
        </Table>
      </TableShell>

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
                  style={{ background: '#2F6BFF' }}>
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
