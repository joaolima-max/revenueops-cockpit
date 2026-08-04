'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatCurrency, formatTPV, formatPercent, formatDate, formatMesRef,
  CLIENTE_STATUS_LABELS, CLIENTE_STATUS_COLORS, MODELO_OPERACIONAL_LABELS,
  SEGMENTO_LABELS, SEGMENTO_COLORS, OPERACAO_LABELS, SCORE_RISCO_LABELS, SCORE_RISCO_COLORS,
} from '@/lib/utils'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Proc { id: string; mesRef: string; tpv: number; qtdTransacoes: number; qtdMed: number; receitaTarifaria: number; floating: number }
interface ForecastItem { id: string; mesRef: string; tpvPrevisto: number; receitaPrevista: number; tpvRealizado: number | null; receitaRealizada: number | null }
interface TarefaItem { id: string; titulo: string; status: string; prioridade: string; dueDate: string | null; responsavel: { id: string; name: string }; criadoPor: { id: string; name: string } }
interface PedidoItem { id: string; tipo: string; descricao: string | null; valor: number; mesRef: string; status: string }
interface IncidenteItem { incidenteId: string; incidente: { id: string; titulo: string; criticidade: string; inicio: string; fim: string | null; downtimeMins: number | null } }
interface ContaItem { id: string; descricao: string; tipo: string; valor: number; dataVenc: string; status: string; dataPago: string | null }
interface FollowUpItem { id: string; titulo: string; descricao: string | null; tipo: string; proximoContato: string | null; ultimoContato: string | null; notas: string | null }

interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null; telefone: string | null
  modeloOperacional: string; status: string; segmento: string | null; operacao: string | null; scoreRisco: string | null
  dataFechamento: string | null; dataEncerramento: string | null
  mensalidadeApi: number | null; sustentacaoWhiteLabel: number | null; setup: number | null
  tpvEsperado: number | null; qtdTransacoesEsperada: number | null; qtdMedEsperada: number | null
  receitaPrevistaMensal: number | null; volumeMinimo: number | null
  descontoPercent: number | null; overpricePercent: number | null; notas: string | null
  owner: { id: string; name: string }
  processamentos: Proc[]; forecasts: ForecastItem[]
  tarefas: TarefaItem[]; pedidos: PedidoItem[]
  incidentes: IncidenteItem[]; contasReceber: ContaItem[]; followUps: FollowUpItem[]
}

interface User { id: string; name: string; role: string }
type Tab = 'visao-geral' | 'financeiro' | 'forecast' | 'relacionamento' | 'inteligencia'

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'relacionamento', label: 'Relacionamento' },
  { id: 'inteligencia', label: 'Inteligência' },
]
const SEGMENTOS = ['IGAMING', 'ECOMMERCE', 'SAAS', 'ERP', 'TELECOM', 'CRIPTOMOEDAS', 'VAREJO', 'OUTROS']
const OPERACOES = ['CASH_IN', 'CASH_OUT', 'BAAS', 'WHITE_LABEL']
const SCORES = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO']
const PRIORIDADE_COLORS: Record<string, string> = { CRITICA: 'text-red-400', ALTA: 'text-amber-400', MEDIA: 'text-blue-400', BAIXA: 'text-gray-500' }
const STATUS_TAREFA_LABELS: Record<string, string> = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' }
const CRITICIDADE_COLORS: Record<string, string> = { BAIXA: 'text-gray-400', MEDIA: 'text-amber-400', ALTA: 'text-orange-400', CRITICA: 'text-red-400' }
const PEDIDO_STATUS_COLORS: Record<string, string> = { PENDENTE: 'text-amber-400', PAGO: 'text-emerald-400', CANCELADO: 'text-gray-500' }
const CONTA_STATUS_COLORS: Record<string, string> = { PENDENTE: 'text-amber-400', FATURADO: 'text-blue-400', PAGO: 'text-emerald-400', INADIMPLENTE: 'text-red-400' }

const emptyProc = { mesRef: '', tpv: '', qtdTransacoes: '', qtdMed: '', receitaTarifaria: '', floating: '' }

function toEditForm(c: Cliente) {
  return {
    nome: c.nome, cnpj: c.cnpj || '', email: c.email || '', telefone: c.telefone || '',
    modeloOperacional: c.modeloOperacional, segmento: c.segmento || '', operacao: c.operacao || '',
    scoreRisco: c.scoreRisco || '',
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClienteDetailClient({
  cliente: initial, users, role, currentUserId,
  ltv, cac, ltvMeses, rankingPosition, totalClientes, healthScore, mesAtual,
}: {
  cliente: Cliente; users: User[]; role: string; currentUserId: string
  ltv: number; cac: number; ltvMeses: number
  rankingPosition: number | null; totalClientes: number; healthScore: number; mesAtual: string
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('visao-geral')
  const [cliente, setCliente] = useState(initial)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showProcModal, setShowProcModal] = useState(false)
  const [showTarefaModal, setShowTarefaModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusEdit, setStatusEdit] = useState(cliente.status)
  const [editForm, setEditForm] = useState(toEditForm(initial))
  const [procForm, setProcForm] = useState(emptyProc)
  const [tarefaForm, setTarefaForm] = useState({ titulo: '', prioridade: 'MEDIA', dueDate: '', responsavelId: currentUserId })

  const lastProc = cliente.processamentos[0]
  const takeRate = lastProc?.tpv > 0 ? (lastProc.receitaTarifaria / lastProc.tpv) * 100 : null
  const med = lastProc?.qtdTransacoes > 0 ? (lastProc.qtdMed / lastProc.qtdTransacoes) * 100 : null
  const mrr = (cliente.mensalidadeApi || 0) + (cliente.sustentacaoWhiteLabel || 0)

  const inp = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500'
  const lbl = 'block text-xs text-gray-500 mb-1'
  const ef = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditForm(p => ({ ...p, [f]: e.target.value }))
  const pf = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => setProcForm(p => ({ ...p, [f]: e.target.value }))

  const healthLabel = healthScore >= 80 ? 'Saudável' : healthScore >= 60 ? 'Estável' : healthScore >= 40 ? 'Atenção' : 'Risco'
  const healthColor = healthScore >= 80 ? '#10b981' : healthScore >= 60 ? '#f59e0b' : healthScore >= 40 ? '#f97316' : '#ef4444'
  const healthTextColor = healthScore >= 80 ? 'text-emerald-400' : healthScore >= 60 ? 'text-amber-400' : healthScore >= 40 ? 'text-orange-400' : 'text-red-400'

  // Insights derivados
  const insights: string[] = []
  const procs = cliente.processamentos
  if (procs.length >= 2 && procs[1].tpv > 0) {
    const g = ((procs[0].tpv - procs[1].tpv) / procs[1].tpv) * 100
    if (Math.abs(g) > 0.5) insights.push(`TPV ${g >= 0 ? 'cresceu' : 'caiu'} ${Math.abs(g).toFixed(1)}% vs mês anterior`)
  }
  if (cliente.dataFechamento) {
    const months = Math.floor((Date.now() - new Date(cliente.dataFechamento).getTime()) / (30 * 24 * 60 * 60 * 1000))
    if (months > 0) insights.push(`Cliente ativo há ${months} meses`)
  }
  const totalReceita = procs.reduce((s, p) => s + p.receitaTarifaria + p.floating, 0)
  if (totalReceita > 0) insights.push(`Receita total histórica: ${formatCurrency(totalReceita)}`)
  const fwReal = cliente.forecasts.filter(f => f.receitaRealizada && f.receitaPrevista > 0)
  if (fwReal.length > 0) {
    const prec = fwReal.reduce((s, f) => s + (f.receitaRealizada! / f.receitaPrevista) * 100, 0) / fwReal.length
    insights.push(`Precisão média de forecast: ${formatPercent(prec, 1)}`)
  }
  const inadimplentes = cliente.contasReceber.filter(c => c.status === 'INADIMPLENTE')
  if (inadimplentes.length > 0) insights.push(`⚠ Inadimplência: ${formatCurrency(inadimplentes.reduce((s, c) => s + c.valor, 0))}`)
  const openContas = cliente.contasReceber.filter(c => c.status === 'PENDENTE' || c.status === 'FATURADO')
  if (openContas.length > 0) insights.push(`${openContas.length} cobrança(s) em aberto: ${formatCurrency(openContas.reduce((s, c) => s + c.valor, 0))}`)
  if (cliente.tpvEsperado && lastProc) insights.push(`Atingimento TPV esperado: ${((lastProc.tpv / cliente.tpvEsperado) * 100).toFixed(0)}%`)

  // ─── Handlers ───────────────────────────────────────────────────────────────

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
        nome: editForm.nome, cnpj: editForm.cnpj || null, email: editForm.email || null,
        telefone: editForm.telefone || null, modeloOperacional: editForm.modeloOperacional,
        segmento: editForm.segmento || null, operacao: editForm.operacao || null,
        scoreRisco: editForm.scoreRisco || null,
        mensalidadeApi: n(editForm.mensalidadeApi), sustentacaoWhiteLabel: n(editForm.sustentacaoWhiteLabel),
        setup: n(editForm.setup), tpvEsperado: n(editForm.tpvEsperado),
        qtdTransacoesEsperada: ni(editForm.qtdTransacoesEsperada), qtdMedEsperada: ni(editForm.qtdMedEsperada),
        receitaPrevistaMensal: n(editForm.receitaPrevistaMensal), volumeMinimo: n(editForm.volumeMinimo),
        descontoPercent: n(editForm.descontoPercent), overpricePercent: n(editForm.overpricePercent),
        dataFechamento: editForm.dataFechamento || null, notas: editForm.notas || null, ownerId: editForm.ownerId,
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
    if (!confirm(`Excluir permanentemente "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return
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
        mesRef: procForm.mesRef, tpv: parseFloat(procForm.tpv) || 0,
        qtdTransacoes: parseInt(procForm.qtdTransacoes) || 0, qtdMed: parseInt(procForm.qtdMed) || 0,
        receitaTarifaria: parseFloat(procForm.receitaTarifaria) || 0, floating: parseFloat(procForm.floating) || 0,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const exists = cliente.processamentos.findIndex(p => p.mesRef === data.processamento.mesRef)
      const updated = exists >= 0
        ? cliente.processamentos.map((p, i) => i === exists ? data.processamento : p)
        : [data.processamento, ...cliente.processamentos].sort((a, b) => b.mesRef.localeCompare(a.mesRef))
      setCliente(prev => ({ ...prev, processamentos: updated }))
      setShowProcModal(false); setProcForm(emptyProc)
    }
    setSaving(false)
  }

  async function handleAddTarefa(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    const res = await fetch('/api/tarefas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: tarefaForm.titulo, prioridade: tarefaForm.prioridade,
        dueDate: tarefaForm.dueDate || null, clienteId: cliente.id,
        responsavelId: tarefaForm.responsavelId,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const responsavel = users.find(u => u.id === tarefaForm.responsavelId) || { id: tarefaForm.responsavelId, name: '—' }
      const criadoPor = users.find(u => u.id === currentUserId) || { id: currentUserId, name: '—' }
      setCliente(prev => ({ ...prev, tarefas: [{ ...data.tarefa, responsavel, criadoPor }, ...prev.tarefas] }))
      setShowTarefaModal(false)
      setTarefaForm({ titulo: '', prioridade: 'MEDIA', dueDate: '', responsavelId: currentUserId })
    }
    setSaving(false)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/40">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="min-w-0">
              <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-400 text-xs mb-2 block">← Carteira</button>
              <h1 className="text-xl font-bold text-white truncate">{cliente.nome}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLIENTE_STATUS_COLORS[statusEdit]}`}>{CLIENTE_STATUS_LABELS[statusEdit]}</span>
                <span className="text-xs text-gray-600">{MODELO_OPERACIONAL_LABELS[cliente.modeloOperacional]}</span>
                {cliente.segmento && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEGMENTO_COLORS[cliente.segmento]}`}>{SEGMENTO_LABELS[cliente.segmento]}</span>}
                {cliente.scoreRisco && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SCORE_RISCO_COLORS[cliente.scoreRisco]}`}>{SCORE_RISCO_LABELS[cliente.scoreRisco]}</span>}
                {cliente.cnpj && <span className="text-xs text-gray-600">{cliente.cnpj}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
              <button onClick={() => setShowTarefaModal(true)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors">+ Tarefa</button>
              <button onClick={() => { setProcForm({ ...emptyProc, mesRef: mesAtual }); setShowProcModal(true) }}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors">+ Processamento</button>
              <select value={statusEdit} onChange={e => handleStatusChange(e.target.value)}
                className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500">
                <option value="PROSPECCAO">Prospecção</option>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
                <option value="ENCERRADO">Encerrado</option>
              </select>
              <button onClick={() => { setEditForm(toEditForm(cliente)); setShowEditModal(true) }}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors">Editar</button>
              {role === 'ADMIN' && (
                <button onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded-lg border border-red-500/20 transition-colors disabled:opacity-50">
                  {deleting ? '...' : 'Excluir'}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 -mb-px overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">

        {/* ── VISÃO GERAL ──────────────────────────────────────────────────── */}
        {tab === 'visao-geral' && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
              {[
                { label: 'TPV', value: lastProc ? formatTPV(lastProc.tpv) : '—', color: 'text-sky-400' },
                { label: 'Receita Tarifária', value: lastProc ? formatCurrency(lastProc.receitaTarifaria) : '—', color: 'text-indigo-400' },
                { label: 'Take Rate', value: takeRate !== null ? formatPercent(takeRate, 3) : '—', color: 'text-amber-400' },
                { label: 'MED', value: med !== null ? formatPercent(med, 2) : '—', color: 'text-violet-400' },
                { label: 'MRR', value: mrr > 0 ? formatCurrency(mrr) : '—', color: 'text-emerald-400' },
                { label: 'Floating', value: lastProc?.floating > 0 ? formatCurrency(lastProc.floating) : '—', color: 'text-teal-400' },
              ].map(k => (
                <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1.5">{k.label}</p>
                  <p className={`text-lg font-bold leading-none ${k.color}`}>{k.value}</p>
                  {k.label === 'TPV' && lastProc && <p className="text-[10px] text-gray-700 mt-1">{formatMesRef(lastProc.mesRef)}</p>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {/* Informações */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Informações</h3>
                <div className="space-y-2.5 text-sm">
                  {([
                    { l: 'Responsável', v: cliente.owner.name },
                    { l: 'Email', v: cliente.email },
                    { l: 'Telefone', v: cliente.telefone },
                    { l: 'Operação', v: cliente.operacao ? OPERACAO_LABELS[cliente.operacao] : null },
                    { l: 'Fechamento', v: cliente.dataFechamento ? formatDate(cliente.dataFechamento) : null },
                    { l: 'MRR', v: mrr > 0 ? formatCurrency(mrr) : null },
                    { l: 'TPV Esperado', v: cliente.tpvEsperado ? formatTPV(cliente.tpvEsperado) : null },
                    { l: 'Receita Prevista/Mês', v: cliente.receitaPrevistaMensal ? formatCurrency(cliente.receitaPrevistaMensal) : null },
                    { l: 'Desconto', v: cliente.descontoPercent ? `${cliente.descontoPercent}%` : null },
                  ] as { l: string; v: string | null }[]).filter(r => r.v).map(({ l, v }) => (
                    <div key={l} className="flex justify-between gap-3">
                      <span className="text-gray-600 flex-shrink-0">{l}</span>
                      <span className="text-gray-300 text-right truncate">{v}</span>
                    </div>
                  ))}
                </div>
                {cliente.notas && <p className="mt-3 text-xs text-gray-600 border-t border-gray-800 pt-3">{cliente.notas}</p>}
              </div>

              {/* Health Score */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Saúde do Cliente</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#1f2937" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke={healthColor} strokeWidth="3"
                        strokeDasharray={`${(healthScore / 100) * 97.4} 97.4`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-lg font-bold ${healthTextColor}`}>{healthScore}</span>
                    </div>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${healthTextColor}`}>{healthLabel}</p>
                    <p className="text-xs text-gray-600 mt-0.5">Score de saúde</p>
                    {rankingPosition && (
                      <p className="text-xs text-gray-500 mt-2">
                        Ranking <span className="text-white font-semibold">#{rankingPosition}</span>
                        <span className="text-gray-700"> / {totalClientes}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 border-t border-gray-800 pt-3">
                  {insights.slice(0, 4).map((ins, i) => (
                    <p key={i} className="text-xs text-gray-500">{ins}</p>
                  ))}
                </div>
              </div>

              {/* Tarefas pendentes */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Tarefas Abertas</h3>
                  <button onClick={() => setShowTarefaModal(true)} className="text-xs text-emerald-500 hover:text-emerald-400">+ Nova</button>
                </div>
                {cliente.tarefas.filter(t => t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA').length === 0 ? (
                  <p className="text-xs text-gray-700">Nenhuma tarefa pendente</p>
                ) : (
                  <div className="space-y-2.5">
                    {cliente.tarefas.filter(t => t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA').slice(0, 5).map(t => (
                      <div key={t.id} className="flex items-start gap-2">
                        <span className={`text-xs mt-0.5 flex-shrink-0 ${PRIORIDADE_COLORS[t.prioridade] || 'text-gray-500'}`}>●</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300 truncate">{t.titulo}</p>
                          <p className="text-[10px] text-gray-600">{t.responsavel.name}{t.dueDate ? ` · ${formatDate(t.dueDate)}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Follow-ups */}
                {cliente.followUps.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-800">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide mb-2">Próximo Follow-up</p>
                    {cliente.followUps.filter(f => f.proximoContato).slice(0, 1).map(f => (
                      <div key={f.id}>
                        <p className="text-xs text-gray-300">{f.titulo}</p>
                        <p className="text-[10px] text-gray-600">{f.proximoContato ? formatDate(f.proximoContato) : '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── FINANCEIRO ──────────────────────────────────────────────────── */}
        {tab === 'financeiro' && (
          <>
            {/* Processamentos */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Processamentos</h3>
                <button onClick={() => { setProcForm({ ...emptyProc, mesRef: mesAtual }); setShowProcModal(true) }}
                  className="text-xs px-3 py-1.5 text-white rounded-lg" style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  + Lançar
                </button>
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
                    ) : cliente.processamentos.map((p, i) => {
                      const tr = p.tpv > 0 ? (p.receitaTarifaria / p.tpv) * 100 : 0
                      const prevTpv = cliente.processamentos[i + 1]?.tpv
                      const tpvDelta = prevTpv && prevTpv > 0 ? ((p.tpv - prevTpv) / prevTpv) * 100 : null
                      return (
                        <tr key={p.id} className="border-b border-gray-800/50">
                          <td className="py-2.5 text-gray-300 font-medium">{formatMesRef(p.mesRef)}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-sky-400">{formatTPV(p.tpv)}</span>
                            {tpvDelta !== null && (
                              <span className={`text-[10px] ml-1.5 ${tpvDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {tpvDelta >= 0 ? '▲' : '▼'}{Math.abs(tpvDelta).toFixed(0)}%
                              </span>
                            )}
                          </td>
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

            {/* Pedidos */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Pedidos Cobráveis</h3>
              {cliente.pedidos.length === 0 ? (
                <p className="text-xs text-gray-700">Nenhum pedido registrado</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Mês', 'Tipo', 'Descrição', 'Valor', 'Status'].map(h => (
                          <th key={h} className="text-xs font-medium text-gray-600 pb-2 text-right first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.pedidos.map(p => (
                        <tr key={p.id} className="border-b border-gray-800/50">
                          <td className="py-2.5 text-gray-300">{formatMesRef(p.mesRef)}</td>
                          <td className="py-2.5 text-right text-gray-400 text-xs">{p.tipo}</td>
                          <td className="py-2.5 text-right text-gray-500 text-xs">{p.descricao || '—'}</td>
                          <td className="py-2.5 text-right text-emerald-400">{formatCurrency(p.valor)}</td>
                          <td className={`py-2.5 text-right text-xs font-medium ${PEDIDO_STATUS_COLORS[p.status] || 'text-gray-500'}`}>{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Contas a Receber */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Contas a Receber</h3>
              {cliente.contasReceber.length === 0 ? (
                <p className="text-xs text-gray-700">Nenhuma conta registrada</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Descrição', 'Tipo', 'Vencimento', 'Valor', 'Status'].map(h => (
                          <th key={h} className="text-xs font-medium text-gray-600 pb-2 text-right first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.contasReceber.map(c => (
                        <tr key={c.id} className={`border-b border-gray-800/50 ${c.status === 'INADIMPLENTE' ? 'bg-red-500/5' : ''}`}>
                          <td className="py-2.5 text-gray-300 text-xs">{c.descricao}</td>
                          <td className="py-2.5 text-right text-gray-500 text-xs">{c.tipo}</td>
                          <td className="py-2.5 text-right text-gray-400 text-xs">{formatDate(c.dataVenc)}</td>
                          <td className="py-2.5 text-right text-emerald-400">{formatCurrency(c.valor)}</td>
                          <td className={`py-2.5 text-right text-xs font-medium ${CONTA_STATUS_COLORS[c.status] || 'text-gray-500'}`}>{c.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── FORECAST ────────────────────────────────────────────────────── */}
        {tab === 'forecast' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Forecast do Cliente</h3>
            {cliente.forecasts.length === 0 ? (
              <p className="text-xs text-gray-700">Nenhum forecast registrado para este cliente</p>
            ) : (
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
                          <td className="py-2.5 text-right text-sky-400">{formatTPV(fc.tpvPrevisto)}</td>
                          <td className="py-2.5 text-right text-violet-400">{formatCurrency(fc.receitaPrevista)}</td>
                          <td className="py-2.5 text-right text-sky-300">{fc.tpvRealizado != null ? formatTPV(fc.tpvRealizado) : <span className="text-gray-700">—</span>}</td>
                          <td className="py-2.5 text-right text-emerald-300">{fc.receitaRealizada != null ? formatCurrency(fc.receitaRealizada) : <span className="text-gray-700">—</span>}</td>
                          <td className={`py-2.5 text-right font-medium ${prec === null ? 'text-gray-700' : prec >= 90 ? 'text-emerald-400' : prec >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                            {prec !== null ? formatPercent(prec, 1) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── RELACIONAMENTO ──────────────────────────────────────────────── */}
        {tab === 'relacionamento' && (
          <>
            {/* Follow-ups */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Follow-ups</h3>
              {cliente.followUps.length === 0 ? (
                <p className="text-xs text-gray-700">Nenhum follow-up registrado</p>
              ) : (
                <div className="space-y-3">
                  {cliente.followUps.map(f => (
                    <div key={f.id} className="border border-gray-800 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm text-white font-medium">{f.titulo}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{f.tipo}</p>
                          {f.descricao && <p className="text-xs text-gray-500 mt-1">{f.descricao}</p>}
                        </div>
                        <div className="text-right text-xs text-gray-600 flex-shrink-0">
                          {f.proximoContato && <p>Próximo: {formatDate(f.proximoContato)}</p>}
                          {f.ultimoContato && <p>Último: {formatDate(f.ultimoContato)}</p>}
                        </div>
                      </div>
                      {f.notas && <p className="mt-2 text-xs text-gray-600 border-t border-gray-800 pt-2">{f.notas}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tarefas */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Tarefas</h3>
                <button onClick={() => setShowTarefaModal(true)} className="text-xs px-3 py-1.5 text-white rounded-lg" style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>+ Nova</button>
              </div>
              {cliente.tarefas.length === 0 ? (
                <p className="text-xs text-gray-700">Nenhuma tarefa registrada</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Tarefa', 'Prioridade', 'Status', 'Responsável', 'Prazo'].map(h => (
                          <th key={h} className="text-xs font-medium text-gray-600 pb-2 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cliente.tarefas.map(t => (
                        <tr key={t.id} className="border-b border-gray-800/50">
                          <td className="py-2.5 text-gray-300 text-xs max-w-[200px] truncate">{t.titulo}</td>
                          <td className={`py-2.5 text-xs font-medium ${PRIORIDADE_COLORS[t.prioridade] || 'text-gray-500'}`}>{t.prioridade}</td>
                          <td className="py-2.5 text-xs text-gray-400">{STATUS_TAREFA_LABELS[t.status] || t.status}</td>
                          <td className="py-2.5 text-xs text-gray-400">{t.responsavel.name}</td>
                          <td className="py-2.5 text-xs text-gray-600">{t.dueDate ? formatDate(t.dueDate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Incidentes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Incidentes</h3>
              {cliente.incidentes.length === 0 ? (
                <p className="text-xs text-gray-700">Nenhum incidente registrado</p>
              ) : (
                <div className="space-y-2.5">
                  {cliente.incidentes.map(ic => (
                    <div key={ic.incidenteId} className="border border-gray-800 rounded-lg p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-white">{ic.incidente.titulo}</p>
                        <p className={`text-xs mt-0.5 ${CRITICIDADE_COLORS[ic.incidente.criticidade] || 'text-gray-500'}`}>
                          {ic.incidente.criticidade}
                          {ic.incidente.downtimeMins ? ` · ${ic.incidente.downtimeMins} min downtime` : ''}
                        </p>
                      </div>
                      <div className="text-right text-xs flex-shrink-0">
                        <p className="text-gray-600">{formatDate(ic.incidente.inicio)}</p>
                        <p className={ic.incidente.fim ? 'text-emerald-600' : 'text-red-500'}>
                          {ic.incidente.fim ? 'Resolvido' : 'Em aberto'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── INTELIGÊNCIA ────────────────────────────────────────────────── */}
        {tab === 'inteligencia' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">LTV Projetado</p>
                <p className="text-2xl font-bold text-emerald-400">{ltv > 0 ? formatCurrency(ltv) : '—'}</p>
                <p className="text-xs text-gray-600 mt-1.5">Projeção de {ltvMeses} meses</p>
                <p className="text-xs text-gray-700 mt-0.5">MRR + receita tarifária média × tempo</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">CAC</p>
                <p className="text-2xl font-bold text-violet-400">{cac > 0 ? formatCurrency(cac) : '—'}</p>
                <p className="text-xs text-gray-600 mt-1.5">Custo de aquisição</p>
                <p className="text-xs text-gray-700 mt-0.5">Configurado em Parâmetros</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">LTV / CAC</p>
                {ltv > 0 && cac > 0 ? (
                  <>
                    <p className={`text-2xl font-bold ${(ltv / cac) >= 3 ? 'text-emerald-400' : (ltv / cac) >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
                      {(ltv / cac).toFixed(1)}x
                    </p>
                    <p className="text-xs text-gray-600 mt-1.5">
                      {(ltv / cac) >= 3 ? 'Excelente' : (ltv / cac) >= 1.5 ? 'Adequado' : 'Abaixo do ideal'}
                    </p>
                    <p className="text-xs text-gray-700 mt-0.5">Referência: ≥ 3x</p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-600">—</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-3">Ranking por TPV</p>
                {rankingPosition ? (
                  <>
                    <div className="flex items-end gap-2">
                      <p className="text-4xl font-bold text-white">#{rankingPosition}</p>
                      <p className="text-gray-600 text-sm mb-1">de {totalClientes} clientes ativos</p>
                    </div>
                    <p className="text-xs text-gray-700 mt-2">Referência: {lastProc ? formatMesRef(lastProc.mesRef) : '—'}</p>
                  </>
                ) : (
                  <p className="text-gray-600 text-sm">Sem dados de processamento</p>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-3">Health Score</p>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-2.5 rounded-full" style={{ width: `${healthScore}%`, background: healthColor }} />
                  </div>
                  <span className={`text-xl font-bold ${healthTextColor} w-10 text-right`}>{healthScore}</span>
                </div>
                <p className={`text-sm font-medium ${healthTextColor}`}>{healthLabel}</p>
                <p className="text-xs text-gray-700 mt-1">Baseado em status, TPV, incidentes e inadimplência</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Insights</h3>
              {insights.length === 0 ? (
                <p className="text-xs text-gray-700">Dados insuficientes para gerar insights</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2 bg-gray-800/50 rounded-lg p-3">
                      <span className="text-emerald-500 text-xs mt-0.5 flex-shrink-0">→</span>
                      <p className="text-xs text-gray-400">{ins}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* ── MODAL: Editar Cliente ─────────────────────────────────────────── */}
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
                <div><label className={lbl}>Modelo *</label>
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
                <div><label className={lbl}>Operação</label>
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
                <div><label className={lbl}>Responsável</label>
                  <select value={editForm.ownerId} onChange={ef('ownerId')} className={inp}>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Email</label><input type="email" value={editForm.email} onChange={ef('email')} className={inp} /></div>
                <div><label className={lbl}>Telefone</label><input value={editForm.telefone} onChange={ef('telefone')} className={inp} /></div>
                <div><label className={lbl}>Data de Fechamento</label><input type="date" value={editForm.dataFechamento} onChange={ef('dataFechamento')} className={inp} /></div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <p className="text-[10px] text-gray-600 font-semibold tracking-widest mb-3">FINANCEIRO</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={lbl}>Mensalidade API (R$)</label><input type="number" step="0.01" value={editForm.mensalidadeApi} onChange={ef('mensalidadeApi')} className={inp} /></div>
                  <div><label className={lbl}>Sustentação WL (R$)</label><input type="number" step="0.01" value={editForm.sustentacaoWhiteLabel} onChange={ef('sustentacaoWhiteLabel')} className={inp} /></div>
                  <div><label className={lbl}>Setup (R$)</label><input type="number" step="0.01" value={editForm.setup} onChange={ef('setup')} className={inp} /></div>
                  <div><label className={lbl}>Receita Prevista/Mês (R$)</label><input type="number" step="0.01" value={editForm.receitaPrevistaMensal} onChange={ef('receitaPrevistaMensal')} className={inp} /></div>
                  <div><label className={lbl}>TPV Esperado (R$)</label><input type="number" step="0.01" value={editForm.tpvEsperado} onChange={ef('tpvEsperado')} className={inp} /></div>
                  <div><label className={lbl}>Volume Mínimo (R$)</label><input type="number" step="0.01" value={editForm.volumeMinimo} onChange={ef('volumeMinimo')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. Transações/Mês</label><input type="number" value={editForm.qtdTransacoesEsperada} onChange={ef('qtdTransacoesEsperada')} className={inp} /></div>
                  <div><label className={lbl}>Qtd. MED/Mês</label><input type="number" value={editForm.qtdMedEsperada} onChange={ef('qtdMedEsperada')} className={inp} /></div>
                  <div><label className={lbl}>Desconto (%)</label><input type="number" step="0.01" min="0" max="100" value={editForm.descontoPercent} onChange={ef('descontoPercent')} className={inp} /></div>
                  <div><label className={lbl}>Overprice (%)</label><input type="number" step="0.01" min="0" value={editForm.overpricePercent} onChange={ef('overpricePercent')} className={inp} /></div>
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={editForm.notas} onChange={ef('notas')} className={inp + ' resize-none'} /></div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:border-gray-600 hover:text-white text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg" style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Lançar Processamento ──────────────────────────────────── */}
      {showProcModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowProcModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Lançar Processamento</h2>
              <button onClick={() => setShowProcModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddProc} className="p-5 space-y-4">
              <div><label className={lbl}>Mês de Referência *</label><input required value={procForm.mesRef} onChange={pf('mesRef')} placeholder="2025-06" pattern="\d{4}-\d{2}" className={inp} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={lbl}>TPV (R$)</label><input type="number" step="0.01" value={procForm.tpv} onChange={pf('tpv')} className={inp} /></div>
                <div><label className={lbl}>Receita Tarifária (R$)</label><input type="number" step="0.01" value={procForm.receitaTarifaria} onChange={pf('receitaTarifaria')} className={inp} /></div>
                <div><label className={lbl}>Floating (R$)</label><input type="number" step="0.01" value={procForm.floating} onChange={pf('floating')} className={inp} /></div>
                <div><label className={lbl}>Qtd. Transações</label><input type="number" value={procForm.qtdTransacoes} onChange={pf('qtdTransacoes')} className={inp} /></div>
                <div><label className={lbl}>Qtd. MED</label><input type="number" value={procForm.qtdMed} onChange={pf('qtdMed')} className={inp} /></div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowProcModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:text-white text-sm rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg" style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Nova Tarefa ───────────────────────────────────────────── */}
      {showTarefaModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowTarefaModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-base font-semibold text-white">Nova Tarefa</h2>
              <button onClick={() => setShowTarefaModal(false)} className="text-gray-600 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddTarefa} className="p-5 space-y-4">
              <div><label className={lbl}>Título *</label><input required value={tarefaForm.titulo} onChange={e => setTarefaForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Revisar contrato" className={inp} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={lbl}>Prioridade</label>
                  <select value={tarefaForm.prioridade} onChange={e => setTarefaForm(p => ({ ...p, prioridade: e.target.value }))} className={inp}>
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="CRITICA">Crítica</option>
                  </select>
                </div>
                <div><label className={lbl}>Prazo</label><input type="date" value={tarefaForm.dueDate} onChange={e => setTarefaForm(p => ({ ...p, dueDate: e.target.value }))} className={inp} /></div>
              </div>
              <div><label className={lbl}>Responsável</label>
                <select value={tarefaForm.responsavelId} onChange={e => setTarefaForm(p => ({ ...p, responsavelId: e.target.value }))} className={inp}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowTarefaModal(false)} className="px-4 py-2 text-gray-500 border border-gray-700 hover:text-white text-sm rounded-lg">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 disabled:opacity-50 text-white text-sm font-medium rounded-lg" style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}>
                  {saving ? 'Salvando...' : 'Criar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
