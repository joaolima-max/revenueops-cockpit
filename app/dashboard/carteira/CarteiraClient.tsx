'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { formatCurrency, formatTPV, CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS, MODELO_OPERACIONAL_LABELS, MODELO_OPERACIONAL_COLORS } from '@/lib/utils'

interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null
  modeloOperacional: string; status: string; tpvEsperado: number | null
  mensalidadeApi: number | null; sustentacaoWhiteLabel: number | null
  receitaPrevistaMensal: number | null; dataFechamento: string | null
  owner: { name: string }
}

const emptyForm = {
  nome: '', cnpj: '', email: '', telefone: '', modeloOperacional: 'API',
  mensalidadeApi: '', sustentacaoWhiteLabel: '', setup: '',
  tpvEsperado: '', qtdTransacoesEsperada: '', qtdMedEsperada: '',
  receitaPrevistaMensal: '', dataFechamento: '', notas: '',
}

export default function CarteiraClient({ role }: { role: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
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
    const res = await fetch(`/api/clientes?${p}`)
    if (res.ok) { const data = await res.json(); setClientes(data.clientes) }
    setLoading(false)
  }, [search, statusFilter, modeloFilter])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const n = (v: string) => v ? parseFloat(v) : null
    const ni = (v: string) => v ? parseInt(v) : null
    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        mensalidadeApi: n(form.mensalidadeApi), sustentacaoWhiteLabel: n(form.sustentacaoWhiteLabel),
        setup: n(form.setup), tpvEsperado: n(form.tpvEsperado),
        qtdTransacoesEsperada: ni(form.qtdTransacoesEsperada), qtdMedEsperada: ni(form.qtdMedEsperada),
        receitaPrevistaMensal: n(form.receitaPrevistaMensal),
        dataFechamento: form.dataFechamento || null,
      }),
    })
    if (res.ok) { setShowModal(false); setForm(emptyForm); fetchClientes() }
    setSaving(false)
  }

  const mrr = clientes.filter(c => c.status === 'ATIVO').reduce((s, c) => s + (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0), 0)
  const ativos = clientes.filter(c => c.status === 'ATIVO').length

  const input = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500'
  const label = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Carteira de Clientes</h1>
          <p className="text-gray-600 text-sm mt-0.5">{ativos} ativos · MRR {formatCurrency(mrr)}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          + Novo Cliente
        </button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-white placeholder-gray-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:border-indigo-500" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">Todos os status</option>
          <option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option>
          <option value="PROSPECCAO">Prospecção</option><option value="ENCERRADO">Encerrado</option>
        </select>
        <select value={modeloFilter} onChange={e => setModeloFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">Todos os modelos</option>
          <option value="API">API</option><option value="WHITE_LABEL">White Label</option>
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Cliente', 'Modelo', 'Status', 'TPV Esperado', 'Receita Prevista', 'Mensalidade', 'Responsável'].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 py-3 ${h === 'Cliente' ? 'text-left px-5' : h === 'Responsável' || h === 'Modelo' || h === 'Status' ? 'text-left px-4' : 'text-right px-4'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-gray-700 py-16 text-sm">Carregando...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-700 py-16 text-sm">Nenhum cliente encontrado</td></tr>
            ) : clientes.map(c => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/carteira/${c.id}`}>
                    <p className="text-sm font-medium text-white hover:text-indigo-400 transition-colors">{c.nome}</p>
                    {c.cnpj && <p className="text-xs text-gray-700">{c.cnpj}</p>}
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODELO_OPERACIONAL_COLORS[c.modeloOperacional]}`}>{MODELO_OPERACIONAL_LABELS[c.modeloOperacional]}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLIENTE_STATUS_COLORS[c.status]}`}>{CLIENTE_STATUS_LABELS[c.status]}</span>
                </td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-400">{c.tpvEsperado ? formatTPV(c.tpvEsperado) : '—'}</td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-400">{c.receitaPrevistaMensal ? formatCurrency(c.receitaPrevistaMensal) : '—'}</td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-400">
                  {(c.mensalidadeApi || c.sustentacaoWhiteLabel) ? formatCurrency((c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0)) : '—'}
                </td>
                <td className="px-4 py-3.5 text-sm text-gray-600">{c.owner.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Novo Cliente</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={label}>Nome *</label><input required value={form.nome} onChange={f('nome')} className={input} /></div>
                <div><label className={label}>CNPJ</label><input value={form.cnpj} onChange={f('cnpj')} placeholder="00.000.000/0001-00" className={input} /></div>
                <div><label className={label}>Modelo Operacional *</label>
                  <select required value={form.modeloOperacional} onChange={f('modeloOperacional')} className={input}>
                    <option value="API">API</option><option value="WHITE_LABEL">White Label</option>
                  </select>
                </div>
                <div><label className={label}>Email</label><input type="email" value={form.email} onChange={f('email')} className={input} /></div>
                <div><label className={label}>Telefone</label><input value={form.telefone} onChange={f('telefone')} className={input} /></div>
                <div><label className={label}>Data de Fechamento</label><input type="date" value={form.dataFechamento} onChange={f('dataFechamento')} className={input} /></div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600 font-semibold tracking-wider mb-3">FINANCEIRO</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Mensalidade API (R$)</label><input type="number" step="0.01" value={form.mensalidadeApi} onChange={f('mensalidadeApi')} className={input} /></div>
                  <div><label className={label}>Sustentação White Label (R$)</label><input type="number" step="0.01" value={form.sustentacaoWhiteLabel} onChange={f('sustentacaoWhiteLabel')} className={input} /></div>
                  <div><label className={label}>Setup (R$)</label><input type="number" step="0.01" value={form.setup} onChange={f('setup')} className={input} /></div>
                  <div><label className={label}>Receita Prevista/Mês (R$)</label><input type="number" step="0.01" value={form.receitaPrevistaMensal} onChange={f('receitaPrevistaMensal')} className={input} /></div>
                  <div><label className={label}>TPV Esperado (R$)</label><input type="number" step="0.01" value={form.tpvEsperado} onChange={f('tpvEsperado')} className={input} /></div>
                  <div><label className={label}>Qtd. Transações Esperada/Mês</label><input type="number" value={form.qtdTransacoesEsperada} onChange={f('qtdTransacoesEsperada')} className={input} /></div>
                  <div><label className={label}>Qtd. MED Esperada/Mês</label><input type="number" value={form.qtdMedEsperada} onChange={f('qtdMedEsperada')} className={input} /></div>
                </div>
              </div>

              <div><label className={label}>Notas</label><textarea rows={2} value={form.notas} onChange={f('notas')} className={input + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
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
