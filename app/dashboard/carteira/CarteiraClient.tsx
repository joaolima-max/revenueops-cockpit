'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  formatCurrency, formatTPV,
  CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS,
  MODELO_OPERACIONAL_LABELS, MODELO_OPERACIONAL_COLORS,
  SEGMENTO_LABELS, SEGMENTO_COLORS,
  SCORE_RISCO_LABELS, SCORE_RISCO_COLORS,
  OPERACAO_LABELS,
} from '@/lib/utils'

interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null
  modeloOperacional: string; status: string; tpvEsperado: number | null
  segmento: string | null; operacao: string | null; scoreRisco: string | null
  mensalidadeApi: number | null; sustentacaoWhiteLabel: number | null
  receitaPrevistaMensal: number | null; dataFechamento: string | null
  descontoPercent: number | null; overpricePercent: number | null
  notas: string | null
  owner: { name: string }
}

function getSegmentLabel(segmento: string | null, notas: string | null): string {
  if (notas) {
    const match = notas.match(/Segmento: ([^\n]+)/)
    if (match) return match[1].trim()
  }
  return SEGMENTO_LABELS[segmento as string] || segmento || '—'
}

const emptyForm = {
  nome: '', cnpj: '', email: '', telefone: '', modeloOperacional: 'API',
  segmento: '', scoreRisco: '',
  mensalidadeApi: '', sustentacaoWhiteLabel: '', setup: '',
  tpvEsperado: '', qtdTransacoesEsperada: '', qtdMedEsperada: '',
  receitaPrevistaMensal: '', volumeMinimo: '',
  descontoPercent: '', overpricePercent: '',
  dataFechamento: '', notas: '',
}

const SEGMENTOS = ['IGAMING', 'ECOMMERCE', 'SAAS', 'ERP', 'TELECOM', 'CRIPTOMOEDAS', 'VAREJO', 'OUTROS']
const OPERACOES = ['CASH_IN', 'CASH_OUT', 'BAAS', 'WHITE_LABEL']
const SCORES = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']
const CRIAR_SEGMENTO_SENTINEL = '__CRIAR_SEGMENTO__'

function loadLocalArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as string[]
  } catch {}
  return []
}

export default function CarteiraClient({ role }: { role: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
  const [segFilter, setSegFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  // Multi-select operations state
  const [selectedOperacoes, setSelectedOperacoes] = useState<string[]>([])
  const [customOperacoes, setCustomOperacoes] = useState<string[]>([])
  const [showNewOp, setShowNewOp] = useState(false)
  const [newOpInput, setNewOpInput] = useState('')

  // Custom segments state
  const [customSegmentos, setCustomSegmentos] = useState<string[]>([])
  const [showNewSeg, setShowNewSeg] = useState(false)
  const [newSegInput, setNewSegInput] = useState('')

  useEffect(() => {
    setCustomOperacoes(loadLocalArray('cliente_custom_operacoes'))
    setCustomSegmentos(loadLocalArray('cliente_custom_segmentos'))
  }, [])

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  function toggleOperacao(op: string) {
    setSelectedOperacoes(prev =>
      prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op]
    )
  }

  function handleAddCustomOp() {
    const trimmed = newOpInput.trim().toUpperCase().replace(/\s+/g, '_')
    if (!trimmed) return
    const updated = [...customOperacoes, trimmed]
    setCustomOperacoes(updated)
    localStorage.setItem('cliente_custom_operacoes', JSON.stringify(updated))
    setSelectedOperacoes(prev => [...prev, trimmed])
    setNewOpInput('')
    setShowNewOp(false)
  }

  function handleSegmentoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === CRIAR_SEGMENTO_SENTINEL) {
      setShowNewSeg(true)
      setForm(prev => ({ ...prev, segmento: '' }))
    } else {
      setShowNewSeg(false)
      setForm(prev => ({ ...prev, segmento: val }))
    }
  }

  function handleAddCustomSeg() {
    const trimmed = newSegInput.trim()
    if (!trimmed) return
    const updated = [...customSegmentos, trimmed]
    setCustomSegmentos(updated)
    localStorage.setItem('cliente_custom_segmentos', JSON.stringify(updated))
    setForm(prev => ({ ...prev, segmento: CRIAR_SEGMENTO_SENTINEL + trimmed }))
    setNewSegInput('')
    setShowNewSeg(false)
  }

  // Determine if the current segmento value is a custom one
  const isCustomSeg = form.segmento.startsWith(CRIAR_SEGMENTO_SENTINEL)
  const customSegValue = isCustomSeg ? form.segmento.slice(CRIAR_SEGMENTO_SENTINEL.length) : ''

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

  useEffect(() => { fetchClientes() }, [fetchClientes])

  function resetModal() {
    setShowModal(false)
    setForm(emptyForm)
    setSelectedOperacoes([])
    setShowNewOp(false)
    setNewOpInput('')
    setShowNewSeg(false)
    setNewSegInput('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const n = (v: string) => v ? parseFloat(v) : null
    const ni = (v: string) => v ? parseInt(v) : null

    // Build operacao: first selected goes to the field; extras go to notas
    const primaryOp = selectedOperacoes[0] || null
    const extraOps = selectedOperacoes.slice(1)

    // Build notas additions
    const notasExtras: string[] = []
    if (extraOps.length > 0) {
      notasExtras.push(`Operações: ${selectedOperacoes.join(', ')}`)
    }

    // Segmento: if custom, store in notas and set segmento to null (or OUTROS if preferred)
    let segmentoVal: string | null = form.segmento || null
    if (isCustomSeg) {
      notasExtras.push(`Segmento: ${customSegValue}`)
      segmentoVal = 'OUTROS'
    }

    const combinedNotas = [form.notas, ...notasExtras].filter(Boolean).join('\n')

    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        segmento: segmentoVal,
        operacao: primaryOp,
        scoreRisco: form.scoreRisco || null,
        mensalidadeApi: n(form.mensalidadeApi), sustentacaoWhiteLabel: n(form.sustentacaoWhiteLabel),
        setup: n(form.setup), tpvEsperado: n(form.tpvEsperado),
        qtdTransacoesEsperada: ni(form.qtdTransacoesEsperada), qtdMedEsperada: ni(form.qtdMedEsperada),
        receitaPrevistaMensal: n(form.receitaPrevistaMensal),
        volumeMinimo: n(form.volumeMinimo),
        descontoPercent: n(form.descontoPercent),
        overpricePercent: n(form.overpricePercent),
        dataFechamento: form.dataFechamento || null,
        notas: combinedNotas || null,
      }),
    })
    if (res.ok) { resetModal(); fetchClientes() }
    setSaving(false)
  }

  const mrr = clientes.filter(c => c.status === 'ATIVO').reduce((s, c) => s + (c.mensalidadeApi || 0) + (c.sustentacaoWhiteLabel || 0), 0)
  const ativos = clientes.filter(c => c.status === 'ATIVO').length

  const input = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  const allOperacoes = [...OPERACOES, ...customOperacoes]
  const allSegmentos = [...SEGMENTOS, ...customSegmentos]

  // Determine current select value for segmento
  const segSelectVal = isCustomSeg
    ? (customSegmentos.includes(customSegValue) ? CRIAR_SEGMENTO_SENTINEL + customSegValue : '')
    : (form.segmento || '')

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold text-white">Carteira de Clientes</h1>
          <p className="text-gray-600 text-sm mt-0.5">{ativos} ativos · MRR {formatCurrency(mrr)}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-all"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
          + Novo Cliente
        </button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-white placeholder-gray-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:border-emerald-500" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
          <option value="">Todos os status</option>
          <option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option>
          <option value="PROSPECCAO">Prospecção</option><option value="ENCERRADO">Encerrado</option>
        </select>
        <select value={modeloFilter} onChange={e => setModeloFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
          <option value="">Todos os modelos</option>
          <option value="API">API</option><option value="WHITE_LABEL">White Label</option>
        </select>
        <select value={segFilter} onChange={e => setSegFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500">
          <option value="">Todos os segmentos</option>
          {SEGMENTOS.map(s => <option key={s} value={s}>{SEGMENTO_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {['Cliente', 'Segmento', 'Modelo', 'Score', 'Status', 'TPV Esperado', 'Receita Prevista', 'Responsável'].map(h => (
                <th key={h} className={`text-xs font-medium text-gray-600 py-3 ${['Cliente', 'Segmento', 'Modelo', 'Score', 'Status', 'Responsável'].includes(h) ? 'text-left px-4' : 'text-right px-4'} ${h === 'Cliente' ? 'pl-5' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center text-gray-700 py-16 text-sm">Carregando...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-gray-700 py-16 text-sm">Nenhum cliente encontrado</td></tr>
            ) : clientes.map(c => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                <td className="pl-5 pr-4 py-3.5">
                  <Link href={`/dashboard/carteira/${c.id}`}>
                    <p className="text-sm font-medium text-white hover:text-emerald-400 transition-colors">{c.nome}</p>
                    {c.cnpj && <p className="text-xs text-gray-700">{c.cnpj}</p>}
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  {c.segmento ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEGMENTO_COLORS[c.segmento] ?? 'bg-gray-500/10 text-gray-400'}`}>
                      {getSegmentLabel(c.segmento, c.notas)}
                    </span>
                  ) : <span className="text-gray-700 text-xs">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODELO_OPERACIONAL_COLORS[c.modeloOperacional]}`}>
                    {MODELO_OPERACIONAL_LABELS[c.modeloOperacional]}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  {c.scoreRisco ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCORE_RISCO_COLORS[c.scoreRisco]}`}>
                      {SCORE_RISCO_LABELS[c.scoreRisco]}
                    </span>
                  ) : <span className="text-gray-700 text-xs">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLIENTE_STATUS_COLORS[c.status]}`}>
                    {CLIENTE_STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-400">{c.tpvEsperado ? formatTPV(c.tpvEsperado) : '—'}</td>
                <td className="px-4 py-3.5 text-right text-sm text-gray-400">{c.receitaPrevistaMensal ? formatCurrency(c.receitaPrevistaMensal) : '—'}</td>
                <td className="px-4 py-3.5 text-sm text-gray-600">{c.owner.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && resetModal()}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Novo Cliente</h2>
              <button onClick={resetModal} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={lbl}>Nome *</label><input required value={form.nome} onChange={f('nome')} className={input} /></div>
                <div><label className={lbl}>CNPJ</label><input value={form.cnpj} onChange={f('cnpj')} placeholder="00.000.000/0001-00" className={input} /></div>
                <div><label className={lbl}>Modelo Operacional *</label>
                  <select required value={form.modeloOperacional} onChange={f('modeloOperacional')} className={input}>
                    <option value="API">API</option><option value="WHITE_LABEL">White Label</option>
                  </select>
                </div>

                {/* Segmento with custom option */}
                <div>
                  <label className={lbl}>Segmento</label>
                  <select
                    value={showNewSeg ? CRIAR_SEGMENTO_SENTINEL : (form.segmento || '')}
                    onChange={handleSegmentoChange}
                    className={input}
                  >
                    <option value="">Selecione</option>
                    {SEGMENTOS.map(s => <option key={s} value={s}>{SEGMENTO_LABELS[s]}</option>)}
                    {customSegmentos.map(s => (
                      <option key={CRIAR_SEGMENTO_SENTINEL + s} value={CRIAR_SEGMENTO_SENTINEL + s}>{s}</option>
                    ))}
                    <option value={CRIAR_SEGMENTO_SENTINEL}>+ Criar segmento...</option>
                  </select>
                  {showNewSeg && (
                    <div className="flex gap-2 mt-1.5">
                      <input
                        value={newSegInput}
                        onChange={e => setNewSegInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomSeg())}
                        placeholder="Nome do segmento..."
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomSeg}
                        disabled={!newSegInput.trim()}
                        className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
                      >
                        OK
                      </button>
                    </div>
                  )}
                </div>

                <div><label className={lbl}>Score de Risco</label>
                  <select value={form.scoreRisco} onChange={f('scoreRisco')} className={input}>
                    <option value="">Selecione</option>
                    {SCORES.map(s => <option key={s} value={s}>{SCORE_RISCO_LABELS[s]}</option>)}
                  </select>
                </div>

                <div><label className={lbl}>Email</label><input type="email" value={form.email} onChange={f('email')} className={input} /></div>
                <div><label className={lbl}>Telefone</label><input value={form.telefone} onChange={f('telefone')} className={input} /></div>
                <div><label className={lbl}>Data de Fechamento</label><input type="date" value={form.dataFechamento} onChange={f('dataFechamento')} className={input} /></div>
              </div>

              {/* Operations multi-select checkboxes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={lbl + ' mb-0'}>Operações</label>
                  <button
                    type="button"
                    onClick={() => setShowNewOp(v => !v)}
                    className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                  >
                    <span className="text-base leading-none">+</span> Personalizada
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allOperacoes.map(op => {
                    const checked = selectedOperacoes.includes(op)
                    return (
                      <button
                        key={op}
                        type="button"
                        onClick={() => toggleOperacao(op)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          checked
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                          checked ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600'
                        }`}>
                          {checked && (
                            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 10 10">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4" />
                            </svg>
                          )}
                        </span>
                        {OPERACAO_LABELS[op] ?? op}
                      </button>
                    )
                  })}
                </div>
                {showNewOp && (
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newOpInput}
                      onChange={e => setNewOpInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomOp())}
                      placeholder="Nome da operação..."
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomOp}
                      disabled={!newOpInput.trim()}
                      className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600 font-semibold tracking-wider mb-3">FINANCEIRO</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lbl}>Mensalidade API (R$)</label><input type="number" step="0.01" value={form.mensalidadeApi} onChange={f('mensalidadeApi')} className={input} /></div>
                  <div><label className={lbl}>Sustentação White Label (R$)</label><input type="number" step="0.01" value={form.sustentacaoWhiteLabel} onChange={f('sustentacaoWhiteLabel')} className={input} /></div>
                  <div><label className={lbl}>Setup (R$)</label><input type="number" step="0.01" value={form.setup} onChange={f('setup')} className={input} /></div>
                  <div><label className={lbl}>Receita Prevista/Mês (R$)</label><input type="number" step="0.01" value={form.receitaPrevistaMensal} onChange={f('receitaPrevistaMensal')} className={input} /></div>
                  <div><label className={lbl}>TPV Esperado (R$)</label><input type="number" step="0.01" value={form.tpvEsperado} onChange={f('tpvEsperado')} className={input} /></div>
                  <div><label className={lbl}>Volume Mínimo Contratado (R$)</label><input type="number" step="0.01" value={form.volumeMinimo} onChange={f('volumeMinimo')} className={input} /></div>
                  <div><label className={lbl}>Qtd. Transações Esperada/Mês</label><input type="number" value={form.qtdTransacoesEsperada} onChange={f('qtdTransacoesEsperada')} className={input} /></div>
                  <div><label className={lbl}>Qtd. MED Esperada/Mês</label><input type="number" value={form.qtdMedEsperada} onChange={f('qtdMedEsperada')} className={input} /></div>
                  <div><label className={lbl}>Desconto (%)</label><input type="number" step="0.01" min="0" max="100" value={form.descontoPercent} onChange={f('descontoPercent')} className={input} /></div>
                  <div><label className={lbl}>Overprice (%)</label><input type="number" step="0.01" min="0" value={form.overpricePercent} onChange={f('overpricePercent')} className={input} /></div>
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={form.notas} onChange={f('notas')} className={input + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={resetModal} className="px-4 py-2 text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
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
