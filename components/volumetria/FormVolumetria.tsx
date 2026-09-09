'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

function periodoAtual(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function FormVolumetria() {
  const router = useRouter()
  const [periodo, setPeriodo] = useState(periodoAtual())
  const [qtdMinima, setQtdMinima] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      const res = await fetch('/api/volumetria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, qtdMinima }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'Erro ao salvar'); return }
      setQtdMinima('')
      router.refresh()
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="bg-surface border border-line rounded-xl p-5">
      <h3 className="t-h3 text-fg mb-4">Definir volumetria mínima</h3>
      {erro && (
        <div className="bg-neg/10 border border-neg/20 text-neg px-3 py-2 rounded-lg text-xs mb-3">{erro}</div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="bp-field-label">Período</label>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            required
            className="bp-field text-sm"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="bp-field-label">Quantidade mínima de transações</label>
          <input
            type="number"
            min="0"
            step="1"
            value={qtdMinima}
            onChange={(e) => setQtdMinima(e.target.value)}
            required
            placeholder="Ex.: 1.500.000"
            className="bp-field w-full text-sm tabular-nums"
          />
        </div>
        <button
          type="submit"
          disabled={salvando}
          className="bp-btn-primary px-4 py-2 rounded-lg text-sm font-medium"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
