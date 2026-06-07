'use client'

import { useState } from 'react'
import { formatDate, ROLE_LABELS } from '@/lib/utils'

interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: Date
  permissoes?: string | null
}

const ROLES = ['ADMIN', 'OPERACIONAL', 'COMERCIAL']

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-red-500/10 text-red-400 border border-red-500/20',
  OPERACIONAL: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  COMERCIAL: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

// Permissions data inlined for client component use
const ALL_PERMISSIONS_CLIENT = [
  // Cockpit
  { key: 'view_dashboard',   label: 'Ver Dashboard',           group: 'Cockpit' },
  { key: 'view_carteira',    label: 'Ver Carteira',             group: 'Cockpit' },
  { key: 'manage_carteira',  label: 'Gerenciar Clientes',       group: 'Cockpit' },
  { key: 'view_forecast',    label: 'Ver Forecast',             group: 'Cockpit' },
  { key: 'manage_forecast',  label: 'Editar Forecast',          group: 'Cockpit' },
  // Financeiro
  { key: 'view_financeiro',  label: 'Ver Financeiro',           group: 'Financeiro' },
  { key: 'manage_financeiro',label: 'Gerenciar Financeiro',     group: 'Financeiro' },
  { key: 'view_receita',     label: 'Ver Receita',              group: 'Financeiro' },
  { key: 'manage_receita',   label: 'Editar Receita',           group: 'Financeiro' },
  { key: 'view_metas',       label: 'Ver Metas',                group: 'Financeiro' },
  { key: 'manage_metas',     label: 'Editar Metas',             group: 'Financeiro' },
  { key: 'view_pedidos',     label: 'Ver Pedidos',              group: 'Financeiro' },
  { key: 'manage_pedidos',   label: 'Gerenciar Pedidos',        group: 'Financeiro' },
  { key: 'view_relatorios',  label: 'Ver Relatórios',           group: 'Financeiro' },
  { key: 'view_metricas',    label: 'Ver Métricas',             group: 'Financeiro' },
  // Operacional
  { key: 'view_incidentes',  label: 'Ver Incidentes',           group: 'Operacional' },
  { key: 'manage_incidentes',label: 'Gerenciar Incidentes',     group: 'Operacional' },
  { key: 'view_tarefas',     label: 'Ver Tarefas',              group: 'Operacional' },
  { key: 'manage_tarefas',   label: 'Gerenciar Tarefas',        group: 'Operacional' },
  { key: 'view_ranking',     label: 'Ver Ranking',              group: 'Operacional' },
  { key: 'view_metricas_op', label: 'Ver Métricas Operacionais',group: 'Operacional' },
  { key: 'view_volumetria',  label: 'Ver Volumetria',           group: 'Operacional' },
  // CRM
  { key: 'view_leads',       label: 'Ver Leads',                group: 'CRM' },
  { key: 'manage_leads',     label: 'Gerenciar Leads',          group: 'CRM' },
  { key: 'view_pipeline',    label: 'Ver Pipeline',             group: 'CRM' },
  { key: 'manage_pipeline',  label: 'Gerenciar Pipeline',       group: 'CRM' },
  { key: 'view_followup',    label: 'Ver Follow-up',            group: 'CRM' },
  { key: 'manage_followup',  label: 'Gerenciar Follow-up',      group: 'CRM' },
  // Admin
  { key: 'view_alertas',     label: 'Ver Alertas',              group: 'Admin' },
  { key: 'manage_parametros',label: 'Gerenciar Parâmetros',     group: 'Admin' },
]

const DEFAULT_PERMISSIONS_CLIENT: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS_CLIENT.map(p => p.key),
  OPERACIONAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_receita', 'view_metas', 'view_pedidos', 'view_metricas',
    'view_incidentes', 'manage_incidentes', 'view_tarefas', 'manage_tarefas',
    'view_ranking', 'view_metricas_op', 'view_volumetria', 'view_alertas',
    'view_followup',
  ],
  COMERCIAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_metas', 'view_pedidos',
    'view_leads', 'manage_leads', 'view_pipeline', 'manage_pipeline',
    'view_followup', 'manage_followup',
  ],
}

const PERM_GROUPS = Array.from(new Set(ALL_PERMISSIONS_CLIENT.map(p => p.group)))

interface PermModal {
  userId: string
  userName: string
  current: string[]
  role: string
}

function parsePermissoes(raw: string | null | undefined, role: string): string[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    } catch {
      // fallback to defaults
    }
  }
  return DEFAULT_PERMISSIONS_CLIENT[role] || []
}

export default function UsersClient({ users: initialUsers }: { users: User[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'COMERCIAL', password: '' })
  const [editForm, setEditForm] = useState<{ role: string }>({ role: 'COMERCIAL' })

  // Permissions modal state
  const [permModal, setPermModal] = useState<PermModal | null>(null)
  const [permChecked, setPermChecked] = useState<string[]>([])
  const [permLoading, setPermLoading] = useState(false)
  const [permSaved, setPermSaved] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const user = await res.json()
        setUsers([user, ...users])
        setShowModal(false)
        setForm({ name: '', email: '', role: 'COMERCIAL', password: '' })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(user: User) {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(users.map((u) => (u.id === user.id ? updated : u)))
    }
  }

  async function handleEditRole(userId: string) {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editForm.role }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(users.map((u) => (u.id === userId ? updated : u)))
      setEditingId(null)
    }
  }

  function openEdit(user: User) {
    setEditingId(user.id)
    setEditForm({ role: user.role })
  }

  function openPermModal(user: User) {
    const current = parsePermissoes(user.permissoes, user.role)
    setPermModal({ userId: user.id, userName: user.name, current, role: user.role })
    setPermChecked(current)
    setPermSaved(false)
  }

  function closePermModal() {
    setPermModal(null)
    setPermChecked([])
    setPermSaved(false)
  }

  function togglePerm(key: string) {
    setPermChecked(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function toggleGroup(group: string) {
    const groupKeys = ALL_PERMISSIONS_CLIENT.filter(p => p.group === group).map(p => p.key)
    const allChecked = groupKeys.every(k => permChecked.includes(k))
    if (allChecked) {
      setPermChecked(prev => prev.filter(k => !groupKeys.includes(k)))
    } else {
      setPermChecked(prev => Array.from(new Set([...prev, ...groupKeys])))
    }
  }

  async function handleSavePermissions() {
    if (!permModal) return
    setPermLoading(true)
    try {
      const res = await fetch(`/api/users/${permModal.userId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissoes: permChecked }),
      })
      if (res.ok) {
        const updated = await res.json()
        setUsers(users.map(u => u.id === permModal.userId ? { ...u, permissoes: updated.permissoes } : u))
        setPermSaved(true)
        setTimeout(() => setPermSaved(false), 2500)
      }
    } finally {
      setPermLoading(false)
    }
  }

  return (
    <div className="p-8 bg-gray-950 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários</h1>
          <p className="text-gray-400 text-sm mt-1">{users.length} usuário(s) cadastrado(s)</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
        >
          + Novo Usuário
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-800">
            <tr>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Email</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Perfil</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Criado</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
                    >
                      <span className="text-white text-xs font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white">{user.name}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{user.email}</td>
                <td className="px-4 py-3">
                  {editingId === user.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ role: e.target.value })}
                        className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleEditRole(user.id)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[user.role] ?? 'bg-gray-500/10 text-gray-400'}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    user.active
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-gray-500/10 text-gray-500 border border-gray-700'
                  }`}>
                    {user.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(user)}
                      title="Editar perfil"
                      className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openPermModal(user)}
                      title="Configurar permissões"
                      className="text-xs text-gray-500 hover:text-violet-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleActive(user)}
                      title={user.active ? 'Desativar usuário' : 'Ativar usuário'}
                      className={`text-xs transition-colors ${user.active ? 'text-gray-500 hover:text-red-400' : 'text-gray-500 hover:text-emerald-400'}`}
                    >
                      {user.active ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Novo Usuário</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-600"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-600"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Senha <span className="text-gray-500 font-normal">(padrão: Revenue@2025)</span>
                </label>
                <input
                  type="password"
                  placeholder="Revenue@2025"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-600"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm({ name: '', email: '', role: 'COMERCIAL', password: '' }) }}
                  className="flex-1 px-4 py-2 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)' }}
                >
                  {loading ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {permModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-white">Permissões</h2>
                <p className="text-sm text-gray-400 mt-0.5">{permModal.userName}</p>
              </div>
              <button
                onClick={closePermModal}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {permModal.role === 'ADMIN' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-red-400">Administradores têm todas as permissões por padrão, independente das configurações abaixo.</p>
                </div>
              )}

              {PERM_GROUPS.map(group => {
                const groupPerms = ALL_PERMISSIONS_CLIENT.filter(p => p.group === group)
                const groupKeys = groupPerms.map(p => p.key)
                const allChecked = groupKeys.every(k => permChecked.includes(k))
                const someChecked = groupKeys.some(k => permChecked.includes(k))

                return (
                  <div key={group}>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group)}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          allChecked
                            ? 'bg-violet-500 border-violet-500'
                            : someChecked
                            ? 'bg-violet-500/40 border-violet-500/60'
                            : 'bg-transparent border-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {(allChecked || someChecked) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={allChecked ? "M5 13l4 4L19 7" : "M20 12H4"} />
                          </svg>
                        )}
                      </button>
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{group}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 ml-6">
                      {groupPerms.map(perm => (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2 cursor-pointer group"
                        >
                          <div
                            onClick={() => togglePerm(perm.key)}
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                              permChecked.includes(perm.key)
                                ? 'bg-violet-500 border-violet-500'
                                : 'bg-transparent border-gray-600 group-hover:border-gray-400'
                            }`}
                          >
                            {permChecked.includes(perm.key) && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span
                            onClick={() => togglePerm(perm.key)}
                            className="text-sm text-gray-300 group-hover:text-white transition-colors select-none"
                          >
                            {perm.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-6 border-t border-gray-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                {permSaved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Permissões salvas
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closePermModal}
                  className="px-4 py-2 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 rounded-lg text-sm transition-colors"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={permLoading}
                  className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}
                >
                  {permLoading ? 'Salvando...' : 'Salvar Permissões'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
