'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, LEAD_STATUS_LABELS, SEGMENTO_CRM_LABELS, CANAL_LABELS, cn } from '@/lib/utils'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'

interface Lead {
  id: string; name: string; email: string | null; phone: string | null
  company: string | null; source: string | null; status: string
  cnpj: string | null; canal: string | null; segmento: string | null
  createdAt: Date; owner: { id: string; name: string }
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

export default function LeadsClient({ leads: initialLeads }: { leads: Lead[] }) {
  const router = useRouter()
  const [leads, setLeads] = useState(initialLeads)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', position: '', cnpj: '', canal: '', segmento: '', notes: '' })
  const [erro, setErro] = useState<string | null>(null)

  const filtered = leads.filter(l => {
    const matchSearch = !search || [l.name, l.email, l.company, l.cnpj].some(f => f?.toLowerCase().includes(search.toLowerCase()))
    return matchSearch && (!statusFilter || l.status === statusFilter)
  })

  const ganhos = leads.filter(l => l.status === 'GANHO').length

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErro(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const lead = await res.json()
        setLeads([lead, ...leads])
        setShowModal(false)
        setForm({ name: '', email: '', phone: '', company: '', position: '', cnpj: '', canal: '', segmento: '', notes: '' })
        return
      }
      // A recusa do servidor aparece. Falhar em silêncio deixava o modal
      // aberto sem dizer o que estava errado.
      const corpo = await res.json().catch(() => ({}))
      setErro(corpo.error ?? 'Não foi possível criar o lead.')
    } catch {
      setErro('Não foi possível criar o lead. Verifique a conexão.')
    } finally { setLoading(false) }
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Leads"
        sub={`${filtered.length} leads · ${ganhos} ganhos`}
        actions={<Button variant="primary" onClick={() => setShowModal(true)}>Novo lead</Button>}
      />

      <Panel padded={false}>
        <div className="flex gap-3 flex-wrap p-3">
          <input
            type="text" placeholder="Buscar leads…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="bp-field flex-1 min-w-[12rem] t-body"
          />
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bp-field t-body"
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
              <Th>Segmento</Th>
              <Th>Status</Th>
              <Th>Canal</Th>
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
                <Td className="t-sm text-muted">
                  {lead.segmento ? (SEGMENTO_CRM_LABELS[lead.segmento] ?? lead.segmento) : <span className="text-subtle">—</span>}
                </Td>
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
                <Td className="text-subtle">
                  {lead.canal ? (CANAL_LABELS[lead.canal] ?? lead.canal) : '—'}
                </Td>
                <Td className="text-subtle">{lead.owner.name}</Td>
                <Td className="text-subtle t-num">{formatDate(lead.createdAt)}</Td>
              </Row>
            ))}
            {filtered.length === 0 && (
              <EmptyRow colSpan={7}>Nenhum lead encontrado com esses filtros.</EmptyRow>
            )}
          </tbody>
        </Table>
      </TableShell>

      {showModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Novo Lead</h2>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {erro && (
                <div className="rounded-lg border border-neg/25 bg-neg/10 px-3 py-2">
                  <p className="t-sm text-neg">{erro}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* OS DOIS ÚNICOS OBRIGATÓRIOS. Todo o resto é opcional: um
                    lead nasce de uma conversa, e exigir CNPJ ou segmento na
                    criação faz o vendedor inventar valor para poder salvar. */}
                <div className="col-span-2"><label className={lbl}>Nome da empresa *</label><input required value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className={inp} /></div>
                <div className="col-span-2"><label className={lbl}>Nome do executivo *</label><input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>CNPJ</label><input value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Celular</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>E-mail</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Cargo</label><input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} className={inp} /></div>
                <div>
                  <label className={lbl}>Segmento</label>
                  <select value={form.segmento} onChange={e => setForm(p => ({ ...p, segmento: e.target.value }))} className={inp}>
                    <option value="">Selecione…</option>
                    {Object.entries(SEGMENTO_CRM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Canal</label>
                  <select value={form.canal} onChange={e => setForm(p => ({ ...p, canal: e.target.value }))} className={inp}>
                    <option value="">Selecione…</option>
                    {Object.entries(CANAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className={lbl}>Observações</label><textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inp + ' resize-none'} /></div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-line-2 text-subtle hover:text-fg text-sm rounded-lg">Cancelar</button>
                <button type="submit" disabled={loading}
                  className="bp-btn-primary flex-1 px-4 py-2 text-sm font-medium rounded-lg">
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
