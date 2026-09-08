'use client'

import { useState } from 'react'

interface Parametro {
  id: string; chave: string; valor: string; label: string
  descricao: string | null; grupo: string; tipo: string
}

const GRUPO_LABELS: Record<string, string> = {
  ALERTAS: 'Parâmetros de Alertas',
  RISCO: 'Critérios de Risco & Classificação',
  OPERACIONAL: 'Thresholds Operacionais',
}

export default function ParametrosClient({ parametros: initial, isAdmin }: { parametros: Parametro[]; isAdmin: boolean }) {
  const [parametros, setParametros] = useState(initial)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const grupos = [...new Set(parametros.map(p => p.grupo))].sort()

  async function save(p: Parametro) {
    const val = editing[p.id]
    if (val === undefined || val === p.valor) { cancel(p.id); return }
    setSaving(p.id)
    const res = await fetch(`/api/parametros/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: val }),
    })
    if (res.ok) {
      const { parametro } = await res.json()
      setParametros(prev => prev.map(x => x.id === p.id ? { ...x, valor: parametro.valor } : x))
      cancel(p.id)
    }
    setSaving(null)
  }

  function cancel(id: string) {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function fmtVal(p: Parametro) {
    return p.tipo === 'PERCENT' ? `${p.valor}%` : p.valor
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-bold text-white">Parâmetros do Sistema</h1>
        <p className="text-gray-600 text-sm mt-0.5">Critérios de risco, thresholds de alertas e parâmetros operacionais</p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
        <p className="text-amber-400 text-sm">
          <span className="font-semibold">Atenção:</span> Alterações aqui afetam diretamente os alertas automáticos e a classificação de risco da plataforma.
          {!isAdmin && ' Apenas administradores podem editar.'}
        </p>
      </div>

      {grupos.map(grupo => (
        <div key={grupo} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{GRUPO_LABELS[grupo] || grupo}</h3>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[40rem]">
            <thead>
              <tr className="border-b border-gray-800">
                {['Parâmetro', 'Descrição', 'Valor', 'Ação'].map(h => (
                  <th key={h} className="text-xs font-medium text-gray-600 px-5 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parametros.filter(p => p.grupo === grupo).map(p => {
                const isEdit = p.id in editing
                return (
                  <tr key={p.id} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                    <td className="px-5 py-3">
                      <p className="text-white text-sm font-medium">{p.label}</p>
                      <p className="text-gray-700 text-xs font-mono">{p.chave}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-xs">{p.descricao || '—'}</td>
                    <td className="px-5 py-3">
                      {isEdit ? (
                        <input type={p.tipo === 'TEXT' ? 'text' : 'number'} step="0.1"
                          value={editing[p.id]}
                          onChange={e => setEditing(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') save(p); if (e.key === 'Escape') cancel(p.id) }}
                          autoFocus
                          className="w-24 bg-gray-800 border border-emerald-500 rounded px-2 py-1 text-sm text-white focus:outline-none" />
                      ) : (
                        <span className="text-emerald-400 font-semibold text-sm">{fmtVal(p)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isAdmin && (isEdit ? (
                        <div className="flex gap-2">
                          <button onClick={() => save(p)} disabled={saving === p.id}
                            className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded hover:bg-emerald-500/20 disabled:opacity-50">
                            {saving === p.id ? '...' : 'Salvar'}
                          </button>
                          <button onClick={() => cancel(p.id)}
                            className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setEditing(prev => ({ ...prev, [p.id]: p.valor }))}
                          className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded hover:bg-gray-700">
                          Editar
                        </button>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      ))}
    </div>
  )
}
