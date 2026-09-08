'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/ui/BrandMark'

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
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-6 text-fg">
              <BrandMark size={44} />
            </div>
            <h1 className="t-h1 text-fg">Bass Pago</h1>
            <p className="t-label text-subtle mt-2">RevOps</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-neg/10 border border-neg/25 text-neg px-4 py-3 rounded-lg t-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block t-label text-subtle mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-surface-2 border border-line rounded-lg t-body text-fg transition-colors duration-[180ms] focus:outline-none focus:border-accent"
                placeholder="seu@email.com.br"
              />
            </div>

            <div>
              <label className="block t-label text-subtle mb-2">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-surface-2 border border-line rounded-lg t-body text-fg transition-colors duration-[180ms] focus:outline-none focus:border-accent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg font-medium text-[0.875rem] text-white bg-accent hover:bg-accent-dark disabled:opacity-40 disabled:pointer-events-none transition-colors duration-[180ms]"
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
