'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatCurrency, formatTPV, formatPercent, formatDate, formatMesRef,
  CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS, MODELO_OPERACIONAL_LABELS,
  SEGMENTO_LABELS, SEGMENTO_COLORS, OPERACAO_LABELS, SCORE_RISCO_LABELS, SCORE_RISCO_COLORS,
} from '@/lib/utils'

interface Processamento { id: string; mesRef: string; tpv: number; qtdTransacoes: number; qtdMed: number; receitaTarifaria: number; floating: number }
interface Forecast { id: string; mesRef: string; tpvPrevisto: number; receitaPrevista: number; tpvRealizado: number | null; receitaRealizada: number | null }
interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null; telefone: string | null
  modeloOperacional: string; status: string; dataFechamento: string | null; dataEncerramento: string | null
  segmento: string | null; operacao: string | null; scoreRisco: string | null
  mensalidadeApi: number | null; sustentacaoWhiteLabel: number | null; setup: number | null
  tpvEsperado: number | null; qtdTransacoesEsperada: number | null; qtdMedEsperada: number | null
  receitaPrevistaMensal: number | null; volumeMinimo: number | null
  descontoPercent: number | null; overpricePercent: number | null
  notas: string | null; owner: { name: string }
  processamentos: Processamento[]; forecasts: Forecast[]
}

const emptyProc = { mesRef: '', tpv: '', qtdTransacoes: '', qtdMed: '', receitaTarifaria: '', floating: '' }

export default function ClienteDetailClient({ cliente: initial }: { cliente: Cliente }) {
  const router = useRouter()
  const [cliente, setCliente] = useState(initial)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showProcModal, setShowProcModal] = useState(false)
  const [procForm, setProcForm] = useState(emptyProc)
  const [statusEdit, setStatusEdit] = useState(cliente.status)

  const lastProc = cliente.processamentos[0]
  const takeRate = lastProc && lastProc.tpv > 0 ? (lastProc.receitaTarifaria / lastProc.tpv) * 100 : null
  const med = lastProc && lastProc.qtdTransacoes > 0 ? (lastProc.qtdMed / lastProc.qtdTransacoes) * 100 : null

  async function handleStatusChange(newStatus: string) {
    setStatusEdit(newStatus)
    await fetch(`/api/clientes/${cliente.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, ...(newStatus === 'ENCERRADO' ? { dataEncerramento: new Date().toISOString() } : {}) }),
    })
    router.refresh()
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

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500'
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
        <select value={statusEdit} onChange={e => handleStatusChange(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500">
          <option value="PROSPECCAO">Prospecção</option><option value="ATIVO">Ativo</option>
          <option value="INATIVO">Inativo</option><option value="ENCERRADO">Encerrado</option>
        </select>
      </div>

      {/* KPI cards */}
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
              { l: 'Responsável', v: cliente.owner.name },
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
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
