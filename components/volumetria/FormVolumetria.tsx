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
    <form onSubmit={salvar} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Definir volumetria mínima</h3>
      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-xs mb-3">{erro}</div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Período</label>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            required
            className="px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Quantidade mínima de transações</label>
          <input
            type="number"
            min="0"
            step="1"
            value={qtdMinima}
            onChange={(e) => setQtdMinima(e.target.value)}
            required
            placeholder="Ex.: 1.500.000"
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={salvando}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
