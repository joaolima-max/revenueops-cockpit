'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, SEGMENTO_CRM_LABELS, CANAL_LABELS } from '@/lib/utils'
import { RESULTADO_LABEL } from '@/lib/pipeline'
import Badge from '@/components/ui/Badge'
import { TOM_RESULTADO } from '@/components/pipeline/CardDetalheModal'
import type { ResultadoCard } from '@/components/pipeline/tipos'

/** O card do pipeline NÃO tem valor financeiro — tem etapa e resultado. */
interface Deal {
  id: string
  title: string
  resultado: ResultadoCard
  etapa: { nome: string } | null
  funil: { nome: string } | null
  owner: { id: string; name: string }
}

interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  position: string | null
  source: string | null
  status: string
  cnpj: string | null
  canal: string | null
  segmento: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  owner: { id: string; name: string; email: string }
  deals: Deal[]
}

const STATUSES = ['NOVO', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO']

export default function LeadDetailClient({ lead: initial, role }: { lead: Lead; role: string }) {
  const router = useRouter()
  const [lead, setLead] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: lead.name,
    email: lead.email || '',
    phone: lead.phone || '',
    company: lead.company || '',
    position: lead.position || '',
    source: lead.source || '',
    cnpj: lead.cnpj || '',
    canal: lead.canal || '',
    segmento: lead.segmento || '',
    status: lead.status,
    notes: lead.notes || '',
  })

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const updated = await res.json()
        setLead({ ...lead, ...updated })
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  /**
   * A outra metade do botão quebrado: a resposta era IGNORADA.
   *
   * O código antigo navegava para a lista sempre, mesmo quando a API falhava —
   * então o usuário via a tela de leads e o lead ainda lá, sem explicação
   * nenhuma. Agora só sai da página quando a exclusão aconteceu de fato, e a
   * recusa aparece com o motivo (o 409 explica quantos cards bloqueiam).
   */
  async function handleDelete() {
    if (!confirm(`Excluir o lead ${lead.company ? `${lead.company} · ` : ''}${lead.name}? Esta ação não pode ser desfeita.`)) return

    setErroExclusao(null)
    setExcluindo(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/dashboard/leads')
        router.refresh()
        return
      }
      const corpo = await res.json().catch(() => ({}))
      setErroExclusao(corpo.error ?? 'Não foi possível excluir o lead.')
    } catch {
      setErroExclusao('Não foi possível excluir o lead. Verifique a conexão.')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-subtle hover:text-muted">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="t-h1 text-fg">{lead.name}</h1>
          <p className="text-subtle text-sm">{lead.company || 'Sem empresa'}</p>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 border border-line text-muted rounded-lg text-sm hover:bg-surface-2"
            >
              Editar
            </button>
          )}
          {role === 'ADMIN' && (
            <button
              onClick={handleDelete}
              disabled={excluindo}
              className="px-4 py-2 bg-neg/10 text-neg border border-neg/25 rounded-lg text-sm hover:bg-neg/10 disabled:opacity-50"
            >
              {excluindo ? 'Excluindo…' : 'Excluir'}
            </button>
          )}
        </div>
      </div>

      {/* A recusa aparece COM O MOTIVO. Antes a falha era silenciosa: a tela
          navegava para a lista e o lead continuava lá. */}
      {erroExclusao && (
        <div className="mb-6 rounded-lg border border-neg/25 bg-neg/10 px-4 py-3">
          <p className="t-sm text-neg">{erroExclusao}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface rounded-xl border border-line p-6">
            <h2 className="t-label text-subtle mb-4">Informações do Lead</h2>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* `obrigatorio` nos dois que o servidor exige — empresa e
                      executivo. A edição não pode esvaziar o que a criação
                      exigiu, senão o PUT viraria a porta de trás da regra. */}
                  {[
                    { label: 'Nome da empresa *', key: 'company', type: 'text', obrigatorio: true },
                    { label: 'Nome do executivo *', key: 'name', type: 'text', obrigatorio: true },
                    { label: 'CNPJ', key: 'cnpj', type: 'text' },
                    { label: 'Celular', key: 'phone', type: 'text' },
                    { label: 'E-mail', key: 'email', type: 'email' },
                    { label: 'Cargo', key: 'position', type: 'text' },
                  ].map(({ label, key, type, obrigatorio }) => (
                    <div key={key}>
                      <label className="bp-field-label">{label}</label>
                      <input
                        type={type}
                        required={obrigatorio}
                        value={form[key as keyof typeof form]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="bp-field w-full text-sm"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="bp-field-label">Segmento</label>
                    <select
                      value={form.segmento}
                      onChange={(e) => setForm({ ...form, segmento: e.target.value })}
                      className="bp-field w-full text-sm"
                    >
                      <option value="">Selecione…</option>
                      {Object.entries(SEGMENTO_CRM_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="bp-field-label">Canal</label>
                    <select
                      value={form.canal}
                      onChange={(e) => setForm({ ...form, canal: e.target.value })}
                      className="bp-field w-full text-sm"
                    >
                      <option value="">Selecione…</option>
                      {Object.entries(CANAL_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="bp-field-label">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="bp-field w-full text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="bp-field-label">Notas</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="bp-field w-full text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 border border-line text-muted rounded-lg text-sm hover:bg-surface-2"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bp-btn-primary px-4 py-2 rounded-lg text-sm"
                  >
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Email', value: lead.email },
                  { label: 'Telefone', value: lead.phone },
                  { label: 'Empresa', value: lead.company },
                  { label: 'Cargo', value: lead.position },
                  { label: 'Segmento', value: lead.segmento ? (SEGMENTO_CRM_LABELS[lead.segmento] ?? lead.segmento) : null },
                  { label: 'Canal', value: lead.canal ? (CANAL_LABELS[lead.canal] ?? lead.canal) : null },
                  { label: 'CNPJ', value: lead.cnpj },
                  { label: 'Criado', value: formatDate(lead.createdAt) },
                  { label: 'Atualizado', value: formatDate(lead.updatedAt) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-subtle">{label}</dt>
                    <dd className="text-sm text-fg mt-0.5">{value || '-'}</dd>
                  </div>
                ))}
                {lead.notes && (
                  <div className="col-span-2">
                    <dt className="text-xs text-subtle">Notas</dt>
                    <dd className="text-sm text-fg mt-0.5 whitespace-pre-wrap">{lead.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {lead.deals.length > 0 && (
            <div className="bg-surface rounded-xl border border-line p-6">
              <h2 className="t-label text-subtle mb-4">Negócios Vinculados</h2>
              <div className="space-y-2">
                {lead.deals.map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between gap-3 p-3 bg-surface-2 rounded-lg flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">{deal.title}</p>
                      <p className="text-xs text-subtle mt-0.5">
                        {deal.funil?.nome ?? '—'} · {deal.etapa?.nome ?? 'sem etapa'}
                      </p>
                    </div>
                    <Badge tone={TOM_RESULTADO[deal.resultado]}>
                      {RESULTADO_LABEL[deal.resultado]}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-line p-6">
            <h2 className="t-label text-subtle mb-3">Status</h2>
            <span className={`inline-flex text-sm px-3 py-1 rounded-full font-medium ${LEAD_STATUS_COLORS[lead.status]}`}>
              {LEAD_STATUS_LABELS[lead.status]}
            </span>
          </div>
          <div className="bg-surface rounded-xl border border-line p-6">
            <h2 className="t-label text-subtle mb-3">Responsável</h2>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center">
                <span className="text-accent-soft text-xs font-bold">
                  {lead.owner.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-fg">{lead.owner.name}</p>
                <p className="text-xs text-subtle">{lead.owner.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
