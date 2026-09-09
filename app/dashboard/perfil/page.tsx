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
        <p className="text-subtle text-sm">Carregando...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-neg text-sm">Não foi possível carregar o perfil.</p>
      </div>
    )
  }

  const initial = user.name.charAt(0).toUpperCase()

  return (
    <div className="space-y-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="t-h1 text-fg">Meu Perfil</h1>
          <p className="text-muted text-sm mt-1">Gerencie suas informações pessoais e senha</p>
        </div>

        {/* Avatar + basic info */}
        <div className="bg-surface border border-line rounded-xl p-6 flex items-center gap-4">
          <div
            className="bg-accent text-on-accent w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-bold"
          >
            {initial}
          </div>
          <div>
            <p className="text-fg font-semibold text-lg leading-tight">{user.name}</p>
            <p className="text-muted text-sm mt-0.5">{user.email}</p>
            <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium bg-pos/10 text-pos border border-pos/20">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </div>

        {/* Profile Info Section */}
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line">
            <h2 className="t-h3 text-fg">Informações do Perfil</h2>
          </div>
          <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
            <div>
              <label className="bp-field-label">Nome</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bp-field w-full t-body disabled:opacity-40"
                placeholder="Seu nome completo"
              />
            </div>
            <div>
              <label className="bp-field-label">Email</label>
              <input
                type="email"
                value={user.email}
                readOnly
                className="bp-field w-full text-sm"
              />
              <p className="text-xs text-subtle mt-1">O email não pode ser alterado.</p>
            </div>
            <div>
              <label className="bp-field-label">Perfil de Acesso</label>
              <input
                type="text"
                value={ROLE_LABELS[user.role] ?? user.role}
                readOnly
                className="bp-field w-full text-sm"
              />
            </div>

            {profileMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg ${profileMsg.type === 'success' ? 'bg-pos/10 text-pos border border-pos/20' : 'bg-neg/10 text-neg border border-neg/20'}`}>
                {profileMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingProfile}
              className="bp-btn-primary w-full py-2 rounded-lg text-sm font-medium"
            >
              {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>

        {/* Change Password Section */}
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line">
            <h2 className="t-h3 text-fg">Alterar Senha</h2>
          </div>
          <form onSubmit={handleSavePassword} className="p-6 space-y-4">
            <div>
              <label className="bp-field-label">Senha Atual</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="bp-field w-full t-body disabled:opacity-40"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="bp-field-label">Nova Senha</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bp-field w-full t-body disabled:opacity-40"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="bp-field-label">Confirmar Nova Senha</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bp-field w-full t-body disabled:opacity-40"
                placeholder="••••••••"
              />
            </div>

            {passwordMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg ${passwordMsg.type === 'success' ? 'bg-pos/10 text-pos border border-pos/20' : 'bg-neg/10 text-neg border border-neg/20'}`}>
                {passwordMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingPassword}
              className="bp-btn-primary w-full py-2 rounded-lg text-sm font-medium"
            >
              {savingPassword ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
