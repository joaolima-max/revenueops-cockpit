'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatCurrency, formatTPV, formatPercent, formatDate, formatMesRef,
  CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS, MODELO_OPERACIONAL_LABELS,
  SEGMENTO_LABELS, SEGMENTO_COLORS, OPERACAO_LABELS, SCORE_RISCO_LABELS, SCORE_RISCO_COLORS,
  SEGMENTO_COLORS as SC, SCORE_RISCO_COLORS as SRC,
} from '@/lib/utils'

interface Processamento { id: string; mesRef: string; tpv: number; qtdTransacoes: number; qtdMed: number; receitaTarifaria: number; floating: number }
interface Forecast { id: string; mesRef: string; tpvPrevisto: number; receitaPrevista: number; tpvRealizado: number | null; receitaRealizada: number | null }
interface User { id: string; name: string; role: string }
interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null; telefone: string | null
  modeloOperacional: string; status: string; dataFechamento: string | null; dataEncerramento: string | null
  segmento: string | null; operacao: string | null; scoreRisco: string | null
  mensalidadeApi: number | null; sustentacaoWhiteLabel: number | null; setup: number | null
  tpvEsperado: number | null; qtdTransacoesEsperada: number | null; qtdMedEsperada: number | null
  receitaPrevistaMensal: number | null; volumeMinimo: number | null
  descontoPercent: number | null; overpricePercent: number | null
  notas: string | null; owner: { id: string; name: string }
  processamentos: Processamento[]; forecasts: Forecast[]
}

const SEGMENTOS = ['IGAMING', 'ECOMMERCE', 'SAAS', 'ERP', 'TELECOM', 'CRIPTOMOEDAS', 'VAREJO', 'OUTROS']
const OPERACOES = ['CASH_IN', 'CASH_OUT', 'BAAS', 'WHITE_LABEL']
const SCORES = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']
const emptyProc = { mesRef: '', tpv: '', qtdTransacoes: '', qtdMed: '', receitaTarifaria: '', floating: '' }

function toEditForm(c: Cliente) {
  return {
    nome: c.nome, cnpj: c.cnpj || '', email: c.email || '', telefone: c.telefone || '',
    modeloOperacional: c.modeloOperacional,
    segmento: c.segmento || '', operacao: c.operacao || '', scoreRisco: c.scoreRisco || '',
    mensalidadeApi: c.mensalidadeApi != null ? String(c.mensalidadeApi) : '',
    sustentacaoWhiteLabel: c.sustentacaoWhiteLabel != null ? String(c.sustentacaoWhiteLabel) : '',
    setup: c.setup != null ? String(c.setup) : '',
    tpvEsperado: c.tpvEsperado != null ? String(c.tpvEsperado) : '',
    qtdTransacoesEsperada: c.qtdTransacoesEsperada != null ? String(c.qtdTransacoesEsperada) : '',
    qtdMedEsperada: c.qtdMedEsperada != null ? String(c.qtdMedEsperada) : '',
    receitaPrevistaMensal: c.receitaPrevistaMensal != null ? String(c.receitaPrevistaMensal) : '',
    volumeMinimo: c.volumeMinimo != null ? String(c.volumeMinimo) : '',
    descontoPercent: c.descontoPercent != null ? String(c.descontoPercent) : '',
    overpricePercent: c.overpricePercent != null ? String(c.overpricePercent) : '',
    dataFechamento: c.dataFechamento ? c.dataFechamento.slice(0, 10) : '',
    notas: c.notas || '',
    ownerId: c.owner.id,
  }
}

export default function ClienteDetailClient({ cliente: initial, users, role }: {
  cliente: Cliente; users: User[]; role: string
}) {
  const router = useRouter()
  const [cliente, setCliente] = useState(initial)
  const [showEditModal, setShowEditModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showProcModal, setShowProcModal] = useState(false)
  const [procForm, setProcForm] = useState(emptyProc)
  const [statusEdit, setStatusEdit] = useState(cliente.status)
  const [editForm, setEditForm] = useState(toEditForm(initial))

  const lastProc = cliente.processamentos[0]
  const takeRate = lastProc && lastProc.tpv > 0 ? (lastProc.receitaTarifaria / lastProc.tpv) * 100 : null
  const med = lastProc && lastProc.qtdTransacoes > 0 ? (lastProc.qtdMed / lastProc.qtdTransacoes) * 100 : null

  const ef = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm(p => ({ ...p, [field]: e.target.value }))

  async function handleStatusChange(newStatus: string) {
    setStatusEdit(newStatus)
    await fetch(`/api/clientes/${cliente.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, ...(newStatus === 'ENCERRADO' ? { dataEncerramento: new Date().toISOString() } : {}) }),
    })
    router.refresh()
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const n = (v: string) => v !== '' ? parseFloat(v) : null
    const ni = (v: string) => v !== '' ? parseInt(v) : null
    const res = await fetch(`/api/clientes/${cliente.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: editForm.nome,
        cnpj: editForm.cnpj || null,
        email: editForm.email || null,
        telefone: editForm.telefone || null,
        modeloOperacional: editForm.modeloOperacional,
        segmento: editForm.segmento || null,
        operacao: editForm.operacao || null,
        scoreRisco: editForm.scoreRisco || null,
        mensalidadeApi: n(editForm.mensalidadeApi),
        sustentacaoWhiteLabel: n(editForm.sustentacaoWhiteLabel),
        setup: n(editForm.setup),
        tpvEsperado: n(editForm.tpvEsperado),
        qtdTransacoesEsperada: ni(editForm.qtdTransacoesEsperada),
        qtdMedEsperada: ni(editForm.qtdMedEsperada),
        receitaPrevistaMensal: n(editForm.receitaPrevistaMensal),
        volumeMinimo: n(editForm.volumeMinimo),
        descontoPercent: n(editForm.descontoPercent),
        overpricePercent: n(editForm.overpricePercent),
        dataFechamento: editForm.dataFechamento || null,
        notas: editForm.notas || null,
        ownerId: editForm.ownerId,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setCliente(prev => ({ ...prev, ...data.cliente, owner: users.find(u => u.id === editForm.ownerId) || prev.owner }))
      setShowEditModal(false)
      router.refresh()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Excluir permanentemente o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    const res = await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/dashboard/carteira')
    else setDeleting(false)
  }

  async function handleAddProc(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await fetch(`/api/clientes/${cliente.id}/processamentos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesRef: procForm.mesRef,
        tpv: parseFloat(procForm.tpv) || 0,
        qtdTransacoes: parseInt(procForm.qtdTransacoes) || 0,
        qtdMed: parseInt(procForm.qtdMed) || 0,
        receitaTarifaria: parseFloat(procForm.receitaTarifaria) || 0,
        floating: parseFloat(procForm.floating) || 0,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const exists = cliente.processamentos.findIndex(p => p.mesRef === data.processamento.mesRef)
      const updated = exists >= 0
        ? cliente.processamentos.map((p, i) => i === exists ? data.processamento : p)
        : [data.processamento, ...cliente.processamentos].sort((a, b) => b.mesRef.localeCompare(a.mesRef))
      setCliente(prev => ({ ...prev, processamentos: updated }))
      setShowProcModal(false)
      setProcForm(emptyProc)
    }
    setSaving(false)
  }

  const pf = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => setProcForm(p => ({ ...p, [field]: e.target.value }))

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-400 text-sm">← Carteira</button>
          </div>
          <h1 className="text-xl font-bold text-white">{cliente.nome}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLIENTE_STATUS_COLORS[statusEdit]}`}>{CLIENTE_STATUS_LABELS[statusEdit]}</span>
            <span className="text-xs text-gray-600">{MODELO_OPERACIONAL_LABELS[cliente.modeloOperacional]}</span>
            {cliente.segmento && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEGMENTO_COLORS[cliente.segmento]}`}>
                {SEGMENTO_LABELS[cliente.segmento]}
              </span>
            )}
            {cliente.scoreRisco && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCORE_RISCO_COLORS[cliente.scoreRisco]}`}>
                {SCORE_RISCO_LABELS[cliente.scoreRisco]}
              </span>
            )}
            {cliente.cnpj && <span className="text-xs text-gray-600">{cliente.cnpj}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusEdit} onChange={e => handleStatusChange(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500">
            <option value="PROSPECCAO">Prospecção</option><option value="ATIVO">Ativo</option>
            <option value="INATIVO">Inativo</option><option value="ENCERRADO">Encerrado</option>
          </select>
          <button onClick={() => { setEditForm(toEditForm(cliente)); setShowEditModal(true) }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors border border-gray-700">
            Editar
          </button>
          {role === 'ADMIN' && (
            <button onClick={handleDelete} disabled={deleting}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-500/20 disabled:opacity-50">
              {deleting ? '...' : 'Deletar'}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'TPV Último Mês', value: lastProc ? formatTPV(lastProc.tpv) : '—', color: 'text-sky-400' },
          { label: 'Receita Tarifária', value: lastProc ? formatCurrency(lastProc.receitaTarifaria) : '—', color: 'text-indigo-400' },
          { label: 'Take Rate', value: takeRate !== null ? formatPercent(takeRate, 3) : '—', color: 'text-amber-400' },
          { label: 'MED', value: med !== null ? formatPercent(med, 2) : '—', color: 'text-emerald-400' },
        ].map(k => (
          <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-600 text-xs mb-1.5">{k.label}</p>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Info + Processamentos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Informações</h3>
          <div className="space-y-3 text-sm">
            {[
              { l: 'Responsável', v: cliente.owner.name },
              { l: 'Email', v: cliente.email },
              { l: 'Telefone', v: cliente.telefone },
              { l: 'Operação', v: cliente.operacao ? OPERACAO_LABELS[cliente.operacao] : null },
              { l: 'Fechamento', v: cliente.dataFechamento ? formatDate(cliente.dataFechamento) : null },
              { l: 'Mensalidade API', v: cliente.mensalidadeApi ? formatCurrency(cliente.mensalidadeApi) : null },
              { l: 'Sustentação WL', v: cliente.sustentacaoWhiteLabel ? formatCurrency(cliente.sustentacaoWhiteLabel) : null },
              { l: 'Setup', v: cliente.setup ? formatCurrency(cliente.setup) : null },
              { l: 'TPV Esperado', v: cliente.tpvEsperado ? formatTPV(cliente.tpvEsperado) : null },
              { l: 'Volume Mínimo', v: cliente.volumeMinimo ? formatTPV(cliente.volumeMinimo) : null },
              { l: 'Receita Prevista', v: cliente.receitaPrevistaMensal ? formatCurrency(cliente.receitaPrevistaMensal) : null },
              { l: 'Desconto', v: cliente.descontoPercent ? `${cliente.descontoPercent}%` : null },
              { l: 'Overprice', v: cliente.overpricePercent ? `${cliente.overpricePercent}%` : null },
            ].map(({ l, v }) => v ? (
              <div key={l} className="flex justify-between">
                <span className="text-gray-600">{l}</span>
                <span className="text-gray-300">{v}</span>
              </div>
            ) : null)}
          </div>
          {cliente.notas && <p className="mt-4 text-xs text-gray-600 border-t border-gray-800 pt-3">{cliente.notas}</p>}
        </div>

        <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Histórico de Processamentos</h3>
            <button onClick={() => setShowProcModal(true)} className="text-xs px-3 py-1.5 text-white rounded-lg transition-all" style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>+ Lançar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Mês', 'TPV', 'Transações', 'MED', 'Tarifária', 'Floating', 'Take Rate'].map(h => (
                    <th key={h} className="text-xs font-medium text-gray-600 pb-2 text-right first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cliente.processamentos.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-gray-700 py-8 text-xs">Nenhum processamento registrado</td></tr>
                ) : cliente.processamentos.map(p => {
                  const tr = p.tpv > 0 ? (p.receitaTarifaria / p.tpv) * 100 : 0
                  return (
                    <tr key={p.id} className="border-b border-gray-800/50">
                      <td className="py-2.5 text-gray-300 font-medium">{formatMesRef(p.mesRef)}</td>
                      <td className="py-2.5 text-right text-sky-400">{formatTPV(p.tpv)}</td>
                      <td className="py-2.5 text-right text-gray-400">{p.qtdTransacoes.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 text-right text-gray-400">{p.qtdMed.toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 text-right text-indigo-400">{formatCurrency(p.receitaTarifaria)}</td>
                      <td className="py-2.5 text-right text-emerald-400">{formatCurrency(p.floating)}</td>
                      <td className="py-2.5 text-right text-amber-400">{formatPercent(tr, 3)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Forecast */}
      {cliente.forecasts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Forecast</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Mês', 'TPV Previsto', 'Receita Prevista', 'TPV Realizado', 'Receita Realizada', 'Precisão'].map(h => (
                    <th key={h} className="text-xs font-medium text-gray-600 pb-2 text-right first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cliente.forecasts.map(fc => {
                  const prec = fc.receitaRealizada && fc.receitaPrevista > 0 ? (fc.receitaRealizada / fc.receitaPrevista) * 100 : null
                  return (
                    <tr key={fc.id} className="border-b border-gray-800/50">
                      <td className="py-2.5 text-gray-300 font-medium">{formatMesRef(fc.mesRef)}</td>
                      <td className="py-2.5 text-right text-gray-400">{formatTPV(fc.tpvPrevisto)}</td>
                      <td className="py-2.5 text-right text-violet-400">{formatCurrency(fc.receitaPrevista)}</td>
                      <td className="py-2.5 text-right text-gray-400">{fc.tpvRealizado ? formatTPV(fc.tpvRealizado) : '—'}</td>
                      <td className="py-2.5 text-right text-emerald-400">{fc.receitaRealizada ? formatCurrency(fc.receitaRealizada) : '—'}</td>
                      <td className={`py-2.5 text-right font-medium ${prec === null ? 'text-gray-700' : prec >= 90 ? 'text-emerald-400' : prec >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                        {prec !== null ? formatPercent(prec, 1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Editar Cliente</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={lbl}>Nome *</label><input required value={editForm.nome} onChange={ef('nome')} className={inp} /></div>
                <div><label className={lbl}>CNPJ</label><input value={editForm.cnpj} onChange={ef('cnpj')} placeholder="00.000.000/0001-00" className={inp} /></div>
                <div><label className={lbl}>Modelo Operacional *</label>
                  <select value={editForm.modeloOperacional} onChange={ef('modeloOperacional')} className={inp}>
                    <option value="API">API</option><option value="WHITE_LABEL">White Label</option>
                  </select>
                </div>
                <div><label className={lbl}>Segmento</label>
                  <select value={editForm.segmento} onChange={ef('segmento')} className={inp}>
                    <option value="">Selecione</option>
                    {SEGMENTOS.map(s => <option key={s} value={s}>{SEGMENTO_LABELS[s]}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Operação Principal</label>
                  <select value={editForm.operacao} onChange={ef('operacao')} className={inp}>
                    <option value="">Selecione</option>
                    {OPERACOES.map(o => <option key={o} value={o}>{OPERACAO_LABELS[o]}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Score de Risco</label>
                  <select value={editForm.scoreRisco} onChange={ef('scoreRisco')} className={inp}>
                    <option value="">Selecione</option>
                    {SCORES.map(s => <option key={s} value={s}>{SCORE_RISCO_LABELS[s]}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Email</label><input type="email" value={editForm.email} onChange={ef('email')} className={inp} /></div>
                <div><label className={lbl}>Telefone</label><input value={editForm.telefone} onChange={ef('telefone')} className={inp} /></div>
                <div><label className={lbl}>Data de Fechamento</label><input type="date" value={editForm.dataFechamento} onChange={ef('dataFechamento')} className={inp} /></div>
                <div><label className={lbl}>Responsável (Carteira)</label>
                  <select value={editForm.ownerId} onChange={ef('ownerId')} className={inp}>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-600 font-semibold tracking-wider mb-3">FINANCEIRO</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lbl}>Mensalidade API (R$)</label><input type="number" step="0.01" value={editForm.mensalidadeApi} onChange={ef('mensalidadeApi')} className={inp} /></div>
                  <div><label className={lbl}>Sustentação White Label (R$)</label><input type="number" step="0.01" value={editForm.sustentacaoWhiteLabel} onChange={ef('sustentacaoWhiteLabel')} className={inp} /></div>
                  <div><label className={lbl}>Setup (R$)</label><input type="number" step="0.01" value={editForm.setup} onChange={ef('setup')} className={inp} /></div>
                  <div><label className={lbl}>Receita Prevista/Mês (R$)</label><input type="number" step="0.01" value={editForm.receitaPrevistaMensal} onChange={ef('receitaPrevistaMensal')} className={inp} /></div>
                  <div><label className={lbl}>TPV Esperado (R$)</label><input type="number" step="0.01" value={editForm.tpvEsperado} onChange={ef('tpvEsperado')} className={inp} /></div>
                  <div><label className={lbl}>Volume Mínimo Contratado (R$)</label><input type="number" step="0.01" value={editForm.volumeMinimo} onChange={ef('volumeMinimo')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. Transações Esperada/Mês</label><input type="number" value={editForm.qtdTransacoesEsperada} onChange={ef('qtdTransacoesEsperada')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. MED Esperada/Mês</label><input type="number" value={editForm.qtdMedEsperada} onChange={ef('qtdMedEsperada')} className={inp} /></div>
                  <div><label className={lbl}>Desconto (%)</label><input type="number" step="0.01" min="0" max="100" value={editForm.descontoPercent} onChange={ef('descontoPercent')} className={inp} /></div>
                  <div><label className={lbl}>Overprice (%)</label><input type="number" step="0.01" min="0" value={editForm.overpricePercent} onChange={ef('overpricePercent')} className={inp} /></div>
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={editForm.notas} onChange={ef('notas')} className={inp + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-all"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Processamento Modal */}
      {showProcModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowProcModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Lançar Processamento</h2>
              <button onClick={() => setShowProcModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddProc} className="p-5 space-y-4">
              <div><label className={lbl}>Mês de Referência * (YYYY-MM)</label><input required value={procForm.mesRef} onChange={pf('mesRef')} placeholder="2025-06" pattern="\d{4}-\d{2}" className={inp} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={lbl}>TPV (R$)</label><input type="number" step="0.01" value={procForm.tpv} onChange={pf('tpv')} className={inp} /></div>
                <div><label className={lbl}>Receita Tarifária (R$)</label><input type="number" step="0.01" value={procForm.receitaTarifaria} onChange={pf('receitaTarifaria')} className={inp} /></div>
                <div><label className={lbl}>Floating (R$)</label><input type="number" step="0.01" value={procForm.floating} onChange={pf('floating')} className={inp} /></div>
                <div><label className={lbl}>Qtd. Transações</label><input type="number" value={procForm.qtdTransacoes} onChange={pf('qtdTransacoes')} className={inp} /></div>
                <div><label className={lbl}>Qtd. MED</label><input type="number" value={procForm.qtdMed} onChange={pf('qtdMed')} className={inp} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowProcModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
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
