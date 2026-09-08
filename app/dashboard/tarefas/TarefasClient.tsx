'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import {
  TAREFA_STATUS_LABELS, TAREFA_STATUS_COLORS,
  TAREFA_PRIORIDADE_LABELS, TAREFA_PRIORIDADE_COLORS,
} from '@/lib/utils'

interface Tarefa {
  id: string
  titulo: string
  descricao?: string | null
  status: string
  prioridade: string
  dueDate?: string | null
  cliente?: { id: string; nome: string } | null
  responsavel: { id: string; name: string }
  criadoPor: { id: string; name: string }
  createdAt: string
}

interface User { id: string; name: string }
interface Cliente { id: string; nome: string }

interface Props {
  initial: Tarefa[]
  usuarios: User[]
  clientes: Cliente[]
  userId: string
}

const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']
const STATUS_LIST = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']

export default function TarefasClient({ initial, usuarios, clientes, userId }: Props) {
  const [tarefas, setTarefas] = useState(initial)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPrio, setFilterPrio] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', prioridade: 'MEDIA', dueDate: '', clienteId: '', responsavelId: userId })
  const [saving, setSaving] = useState(false)

  const filtered = tarefas.filter(t =>
    (!filterStatus || t.status === filterStatus) &&
    (!filterPrio || t.prioridade === filterPrio)
  )

  async function handleCreate() {
    if (!form.titulo || !form.responsavelId) return
    setSaving(true)
    const res = await fetch('/api/tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const { tarefa } = await res.json()
      setTarefas(p => [tarefa, ...p])
      setModal(false)
      setForm({ titulo: '', descricao: '', prioridade: 'MEDIA', dueDate: '', clienteId: '', responsavelId: userId })
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/tarefas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const { tarefa } = await res.json()
      setTarefas(p => p.map(t => t.id === id ? { ...t, ...tarefa } : t))
    }
  }

  async function deleteTarefa(id: string) {
    if (!confirm('Excluir tarefa?')) return
    const res = await fetch(`/api/tarefas/${id}`, { method: 'DELETE' })
    if (res.ok) setTarefas(p => p.filter(t => t.id !== id))
  }

  const counts = {
    PENDENTE: tarefas.filter(t => t.status === 'PENDENTE').length,
    EM_ANDAMENTO: tarefas.filter(t => t.status === 'EM_ANDAMENTO').length,
    CONCLUIDA: tarefas.filter(t => t.status === 'CONCLUIDA').length,
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Tarefas</h1>
          <p className="text-gray-600 text-sm mt-0.5">Gestão de tarefas e atividades</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
          style={{ background: '#2F6BFF' }}
        >
          + Nova Tarefa
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pendentes', count: counts.PENDENTE, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Em Andamento', count: counts.EM_ANDAMENTO, color: 'text-sky-400', bg: 'bg-sky-500/10' },
          { label: 'Concluídas', count: counts.CONCLUIDA, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-4`}>
            <p className="text-gray-500 text-xs mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.count}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-accent">
          <option value="">Todos os status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{TAREFA_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={filterPrio} onChange={e => setFilterPrio(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-accent">
          <option value="">Todas as prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{TAREFA_PRIORIDADE_LABELS[p]}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map(t => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAREFA_PRIORIDADE_COLORS[t.prioridade]}`}>
                  {TAREFA_PRIORIDADE_LABELS[t.prioridade]}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAREFA_STATUS_COLORS[t.status]}`}>
                  {TAREFA_STATUS_LABELS[t.status]}
                </span>
                {t.cliente && (
                  <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{t.cliente.nome}</span>
                )}
              </div>
              <p className="text-white text-sm font-medium">{t.titulo}</p>
              {t.descricao && <p className="text-gray-500 text-xs mt-0.5">{t.descricao}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                <span>Responsável: {t.responsavel.name}</span>
                {t.dueDate && <span>Prazo: {formatDate(t.dueDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {t.status === 'PENDENTE' && (
                <button onClick={() => updateStatus(t.id, 'EM_ANDAMENTO')}
                  className="text-xs px-2 py-1 bg-sky-500/10 text-sky-400 rounded-lg hover:bg-sky-500/20">
                  Iniciar
                </button>
              )}
              {t.status === 'EM_ANDAMENTO' && (
                <button onClick={() => updateStatus(t.id, 'CONCLUIDA')}
                  className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20">
                  Concluir
                </button>
              )}
              <button onClick={() => deleteTarefa(t.id)}
                className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20">
                Excluir
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600">Nenhuma tarefa encontrada</div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-base font-bold text-white">Nova Tarefa</h2>
            <div className="space-y-3">
              <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Título da tarefa *"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" />
              <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descrição (opcional)" rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Prioridade</label>
                  <select value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                    {PRIORIDADES.map(p => <option key={p} value={p}>{TAREFA_PRIORIDADE_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Prazo</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Responsável *</label>
                <select value={form.responsavelId} onChange={e => setForm(p => ({ ...p, responsavelId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Cliente (opcional)</label>
                <select value={form.clienteId} onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                  <option value="">Nenhum</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)}
                className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800">
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving || !form.titulo}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#2F6BFF' }}>
                {saving ? 'Salvando...' : 'Criar Tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
