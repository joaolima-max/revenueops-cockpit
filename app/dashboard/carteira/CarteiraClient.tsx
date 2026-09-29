'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import {
  formatCurrency,
  CLIENTE_STATUS_LABELS,
  MODELO_OPERACIONAL_LABELS,
  SEGMENTO_CRM_LABELS,
} from '@/lib/utils'
import MovimentoDias from '@/components/carteira/MovimentoDias'
import { serieDoCliente, type EstadoDia } from '@/lib/carteira'

/**
 * CADASTRO COMERCIAL ENXUTO (§2).
 *
 * São oito campos: nome, CNPJ, modelo operacional, e-mail, telefone,
 * segmento, data de fechamento e mensalidade de API. Saíram os campos de
 * expectativa financeira, o Score de Risco e a caixa de marcação "Operações".
 *
 * Saiu também a criação de segmento/operação personalizados, que gravava o
 * valor dentro de `notas` e fazia a mesma informação existir em dois lugares.
 * O segmento agora é sempre a taxonomia comercial de SEGMENTO_CRM_LABELS.
 */
interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null
  telefone: string | null
  modeloOperacional: string; status: string
  segmento: string | null
  mensalidadeApi: number | null; dataFechamento: string | null
  notas: string | null
  owner: { name: string }
  gestor: { id: string; name: string } | null
}

const emptyForm = {
  nome: '', cnpj: '', email: '', telefone: '', modeloOperacional: 'API',
  segmento: '', mensalidadeApi: '', dataFechamento: '', notas: '',
}

/** Os três modelos operacionais do produto. */
const MODELOS = ['API', 'BAAS', 'WHITE_LABEL'] as const

export default function CarteiraClient({ role }: { role: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  // Indicador operacional dos ultimos 5 dias. Carregado a parte para nao
  // atrasar a lista de clientes, que e o conteudo principal da tela.
  const [dias, setDias] = useState<string[]>([])
  const [movimentos, setMovimentos] = useState<Array<{ clienteId: string; data: string; movimentou: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
  const [segFilter, setSegFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const fetchClientes = useCallback(async () => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (statusFilter) p.set('status', statusFilter)
    if (modeloFilter) p.set('modelo', modeloFilter)
    if (segFilter) p.set('segmento', segFilter)
    const res = await fetch(`/api/clientes?${p}`)
    if (res.ok) { const data = await res.json(); setClientes(data.clientes) }
    setLoading(false)
  }, [search, statusFilter, modeloFilter, segFilter])

  useEffect(() => {
    let vivo = true
    fetch('/api/clientes/movimento?dias=5')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setDias(d.dias ?? [])
        setMovimentos(d.registros ?? [])
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  async function marcarDia(clienteId: string, data: string, movimentou: boolean) {
    setMovimentos((p) => [
      ...p.filter((m) => !(m.clienteId === clienteId && m.data === data)),
      { clienteId, data, movimentou },
    ])
    await fetch('/api/clientes/movimento', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, data, movimentou }),
    }).catch(() => {})
  }

  useEffect(() => { fetchClientes() }, [fetchClientes])

  function resetModal() {
    setShowModal(false)
    setForm(emptyForm)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)

    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        segmento: form.segmento || null,
        mensalidadeApi: form.mensalidadeApi ? parseFloat(form.mensalidadeApi) : null,
        dataFechamento: form.dataFechamento || null,
        notas: form.notas || null,
      }),
    })
    if (res.ok) { resetModal(); fetchClientes() }
    setSaving(false)
  }

  // Mensalidade de API da carteira — é UMA das quatro parcelas do MRR, não o
  // MRR inteiro. O MRR completo (com sustentação e API dos parceiros) está no
  // Financeiro, que é onde ele é calculado.
  const mensalidades = clientes.filter(c => c.status === 'ATIVO').reduce((s, c) => s + (c.mensalidadeApi || 0), 0)
  const ativos = clientes.filter(c => c.status === 'ATIVO').length

  const input = 'bp-field'
  const lbl = 'bp-field-label'

  const STATUS_TONE: Record<string, BadgeTone> = {
    ATIVO: 'pos', PROSPECCAO: 'accent', INATIVO: 'neutral', ENCERRADO: 'neutral',
  }
  const filtro = 'bp-field w-auto'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Carteira de Clientes"
        sub={`${ativos} ativos · Mensalidades de API ${formatCurrency(mensalidades)}`}
        actions={<Button variant="primary" onClick={() => setShowModal(true)}>Novo cliente</Button>}
      />

      {/* Filtros numa barra única, em vez de quatro campos soltos. */}
      <Panel className="flex gap-3 flex-wrap items-center" padded={false}>
        <div className="flex gap-3 flex-wrap w-full p-3">
          <input
            type="text" placeholder="Buscar cliente…" value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${filtro} flex-1 min-w-[12rem]`}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={filtro}>
            <option value="">Todos os status</option>
            <option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option>
            <option value="PROSPECCAO">Prospecção</option><option value="ENCERRADO">Encerrado</option>
          </select>
          <select value={modeloFilter} onChange={e => setModeloFilter(e.target.value)} className={filtro}>
            <option value="">Todos os modelos</option>
            {MODELOS.map(m => <option key={m} value={m}>{MODELO_OPERACIONAL_LABELS[m]}</option>)}
          </select>
          <select value={segFilter} onChange={e => setSegFilter(e.target.value)} className={filtro}>
            <option value="">Todos os segmentos</option>
            {Object.entries(SEGMENTO_CRM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th>Cliente</Th>
              <Th>Segmento</Th>
              <Th>Modelo</Th>
              <Th>Status</Th>
              <Th align="right">Mensalidade API</Th>
              <Th>Gestor</Th>
              <Th>Últimos 5 dias</Th>
            </HeadRow>
          </THead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={7}>Carregando…</EmptyRow>
            ) : clientes.length === 0 ? (
              <EmptyRow colSpan={7}>Nenhum cliente encontrado com esses filtros.</EmptyRow>
            ) : clientes.map(c => (
              <Row key={c.id}>
                <Td className="pl-5">
                  <Link href={`/dashboard/carteira/${c.id}`} className="group block">
                    <span className="block t-body font-medium text-fg group-hover:text-accent-soft transition-colors duration-[180ms]">{c.nome}</span>
                    {c.cnpj && <span className="block t-mono text-subtle mt-1">{c.cnpj}</span>}
                  </Link>
                </Td>
                {/* Segmento e modelo são categorias, não status: tom neutro. */}
                <Td>
                  {c.segmento
                    ? <Badge>{SEGMENTO_CRM_LABELS[c.segmento] ?? c.segmento}</Badge>
                    : <span className="text-subtle">—</span>}
                </Td>
                <Td><Badge>{MODELO_OPERACIONAL_LABELS[c.modeloOperacional]}</Badge></Td>
                <Td><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{CLIENTE_STATUS_LABELS[c.status]}</Badge></Td>
                <Td align="right" numeric className="text-fg">
                  {c.mensalidadeApi ? formatCurrency(c.mensalidadeApi) : <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-subtle">
                  {c.gestor?.name ?? <span className="text-subtle">{c.owner.name}</span>}
                </Td>
                <Td>
                  {dias.length > 0
                    ? <MovimentoDias
                        serie={serieDoCliente(c.id, movimentos, dias) as Array<{ data: string; estado: EstadoDia }>}
                        onToggle={(data, proximo) => marcarDia(c.id, data, proximo)} />
                    : <span className="text-subtle">—</span>}
                </Td>
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {showModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && resetModal()}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Novo Cliente</h2>
              <button onClick={resetModal} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2"><label className={lbl}>Nome *</label><input required value={form.nome} onChange={f('nome')} className={input} /></div>
                <div><label className={lbl}>CNPJ</label><input value={form.cnpj} onChange={f('cnpj')} placeholder="00.000.000/0001-00" className={input} /></div>
                <div>
                  <label className={lbl}>Modelo Operacional *</label>
                  <select required value={form.modeloOperacional} onChange={f('modeloOperacional')} className={input}>
                    {MODELOS.map(m => <option key={m} value={m}>{MODELO_OPERACIONAL_LABELS[m]}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>E-mail</label><input type="email" value={form.email} onChange={f('email')} className={input} /></div>
                <div><label className={lbl}>Telefone</label><input value={form.telefone} onChange={f('telefone')} className={input} /></div>
                <div>
                  <label className={lbl}>Segmento</label>
                  <select value={form.segmento} onChange={f('segmento')} className={input}>
                    <option value="">Selecione</option>
                    {Object.entries(SEGMENTO_CRM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Data de Fechamento</label><input type="date" value={form.dataFechamento} onChange={f('dataFechamento')} className={input} /></div>
                <div className="col-span-2">
                  <label className={lbl}>Mensalidade de API (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.mensalidadeApi} onChange={f('mensalidadeApi')} className={input} />
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={form.notas} onChange={f('notas')} className={input + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={resetModal} className="px-4 py-2 text-subtle border border-line-2 hover:border-line-2 hover:text-fg text-sm rounded-lg transition-colors">Cancelar</button>
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
