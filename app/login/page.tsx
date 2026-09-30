'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Logo from '@/components/ui/Logo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao fazer login')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md px-4">
        <div className="bg-surface border border-line rounded-3xl shadow-[var(--bp-shadow-overlay)] p-8 sm:p-10">
          {/* Só a logo oficial. O símbolo desenhado em SVG e o wordmark
              escrito saíram junto com o branding anterior. */}
          <div className="flex items-center justify-center mb-8">
            <Logo altura={34} />
            <h1 className="sr-only">Bass Pago</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-neg/10 border border-neg/25 text-neg px-4 py-3 rounded-lg t-sm">
                {error}
              </div>
            )}

            <div>
              <label className="bp-field-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bp-field w-full t-body"
                placeholder="seu@email.com.br"
              />
            </div>

            <div>
              <label className="bp-field-label">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bp-field w-full t-body"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bp-btn-primary w-full py-3 px-4 rounded-lg font-medium text-[0.875rem] disabled:pointer-events-none"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="mt-8 pt-6 border-t border-line t-label text-subtle text-center">
            Acesso restrito · Bass Pago RevOps
          </p>
        </div>
      </div>
    </div>
  )
}
