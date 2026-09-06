export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { ultimosPeriodos, volumetriaDoPeriodo, type VolumetriaPeriodo } from '@/lib/kpi'
import { formatMesRef } from '@/lib/utils'
import FormVolumetria from '@/components/volumetria/FormVolumetria'

const ESTILO = {
  ATINGIDO: { label: 'Atingido', cls: 'bg-emerald-500/10 text-emerald-400' },
  NAO_ATINGIDO: { label: 'Não atingido', cls: 'bg-red-500/10 text-red-400' },
  EM_ACOMPANHAMENTO: { label: 'Em acompanhamento', cls: 'bg-amber-400/10 text-amber-300' },
  SEM_DADOS: { label: 'Sem dados', cls: 'bg-gray-800 text-gray-500' },
} as const

export default async function VolumetriaPage() {
  const session = await getSession()
  const periodos = ultimosPeriodos(12)
  const todos = await Promise.all(periodos.map((p) => volumetriaDoPeriodo(p)))
  const registros = todos.filter((v): v is VolumetriaPeriodo => v !== null).reverse()

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Volumetria Mínima Contratada</h1>
        <p className="text-gray-600 text-sm mt-0.5">
          Controle geral da empresa. O realizado vem do lançamento diário.
        </p>
      </div>

      {session?.role !== 'COMERCIAL' && <FormVolumetria />}

      {registros.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-white font-medium">Nenhuma volumetria mínima definida</p>
          <p className="text-gray-600 text-sm mt-1">
            Informe a quantidade mínima de transações contratada para um período acima.
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Período', 'Mínimo contratado', 'Realizado', 'Diferença', 'Status'].map((h, i) => (
                    <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'} ${h === 'Status' ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((v) => {
                  const e = ESTILO[v.status]
                  return (
                    <tr key={v.periodo} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-3 text-gray-300 font-medium">{formatMesRef(v.periodo)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                        {v.qtdMinima.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right text-white tabular-nums">
                        {v.realizado === null ? <span className="text-gray-700">—</span> : v.realizado.toLocaleString('pt-BR')}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${
                        v.diferenca === null ? 'text-gray-700' : v.diferenca >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {v.diferenca === null ? '—' : `${v.diferenca >= 0 ? '+' : ''}${v.diferenca.toLocaleString('pt-BR')}`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${e.cls}`}>{e.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
