'use client'

import { useState, useEffect } from 'react'
import { ROLE_LABELS } from '@/lib/utils'

interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  createdAt: string
}

export default function PerfilPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Profile form state
  const [name, setName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/perfil')
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
          setName(data.user.name)
        }
      })
      .finally(() => setLoadingProfile(false))
  }, [])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (res.ok) {
        setUser(data.user)
        setName(data.user.name)
        setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso.' })
      } else {
        setProfileMsg({ type: 'error', text: data.error || 'Erro ao salvar perfil.' })
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'Erro de conexão.' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMsg(null)
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'A nova senha e a confirmação não coincidem.' })
      return
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setPasswordMsg({ type: 'success', text: 'Senha alterada com sucesso.' })
      } else {
        setPasswordMsg({ type: 'error', text: data.error || 'Erro ao alterar senha.' })
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'Erro de conexão.' })
    } finally {
      setSavingPassword(false)
    }
  }

  if (loadingProfile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-red-400 text-sm">Não foi possível carregar o perfil.</p>
      </div>
    )
  }

  const initial = user.name.charAt(0).toUpperCase()

  return (
    <div className="space-y-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie suas informações pessoais e senha</p>
        </div>

        {/* Avatar + basic info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-white text-2xl font-bold"
            style={{ background: '#2F6BFF' }}
          >
            {initial}
          </div>
          <div>
            <p className="text-white font-semibold text-lg leading-tight">{user.name}</p>
            <p className="text-gray-400 text-sm mt-0.5">{user.email}</p>
            <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>

        {/* Profile Info Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-white font-semibold text-sm">Informações do Perfil</h2>
          </div>
          <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder-gray-600"
                placeholder="Seu nome completo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                value={user.email}
                readOnly
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 text-gray-500 rounded-lg text-sm cursor-not-allowed"
              />
              <p className="text-xs text-gray-600 mt-1">O email não pode ser alterado.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Perfil de Acesso</label>
              <input
                type="text"
                value={ROLE_LABELS[user.role] ?? user.role}
                readOnly
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 text-gray-500 rounded-lg text-sm cursor-not-allowed"
              />
            </div>

            {profileMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg ${profileMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {profileMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: '#2F6BFF' }}
            >
              {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>

        {/* Change Password Section */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-white font-semibold text-sm">Alterar Senha</h2>
          </div>
          <form onSubmit={handleSavePassword} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Senha Atual</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder-gray-600"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nova Senha</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder-gray-600"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent placeholder-gray-600"
                placeholder="••••••••"
              />
            </div>

            {passwordMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg ${passwordMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {passwordMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingPassword}
              className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: '#2F6BFF' }}
            >
              {savingPassword ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
