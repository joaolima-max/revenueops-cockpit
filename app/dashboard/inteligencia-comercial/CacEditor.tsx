'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface CacEditorProps {
  parametroId: string | null
  cacAtual: number
  isAdmin: boolean
}

export default function CacEditor({ parametroId, cacAtual, isAdmin }: CacEditorProps) {
  const [valor, setValor] = useState(String(cacAtual))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  async function handleSave() {
    if (!parametroId) return
    const num = parseFloat(valor)
    if (isNaN(num) || num < 0) { setError('Valor inválido'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/parametros/${parametroId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: num }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Erro ao salvar')
      } else {
        setSaved(true)
        setEditing(false)
        setTimeout(() => setSaved(false), 2500)
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setValor(String(cacAtual))
    setEditing(false)
    setError(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">CAC Estimado atual</p>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(cacAtual)}</p>
        </div>
        {isAdmin && !editing && (
          <button
            onClick={() => { setEditing(true); setSaved(false) }}
            className="text-xs px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Atualizar CAC
          </button>
        )}
      </div>

      {isAdmin && editing && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Novo valor (R$)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={valor}
              onChange={e => setValor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
              autoFocus
              className="w-full bg-gray-800 border border-emerald-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-gray-600"
              placeholder="Ex: 3500"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={handleCancel}
              className="text-xs px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {saved && (
        <p className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">
          CAC atualizado com sucesso.
        </p>
      )}

      {!parametroId && (
        <p className="text-xs text-gray-600 bg-gray-800/50 px-3 py-2 rounded-lg">
          Parâmetro <code className="font-mono">CAC_ESTIMADO</code> não encontrado. Cadastre-o em Parâmetros do Sistema.
        </p>
      )}
    </div>
  )
}
