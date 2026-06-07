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
}

const ROLES = ['ADMIN', 'OPERACIONAL', 'COMERCIAL']

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-red-500/10 text-red-400 border border-red-500/20',
  OPERACIONAL: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  COMERCIAL: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
}

export default function UsersClient({ users: initialUsers }: { users: User[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', role: 'COMERCIAL', password: '' })
  const [editForm, setEditForm] = useState<{ role: string }>({ role: 'COMERCIAL' })

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
    </div>
  )
}
