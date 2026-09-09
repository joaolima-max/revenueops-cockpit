export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { ultimosPeriodos, volumetriaDoPeriodo, type VolumetriaPeriodo } from '@/lib/kpi'
import { formatMesRef } from '@/lib/utils'
import FormVolumetria from '@/components/volumetria/FormVolumetria'

const ESTILO = {
  ATINGIDO: { label: 'Atingido', cls: 'bg-pos/10 text-pos' },
  NAO_ATINGIDO: { label: 'Não atingido', cls: 'bg-neg/10 text-neg' },
  EM_ACOMPANHAMENTO: { label: 'Em acompanhamento', cls: 'bg-warn/10 text-warn' },
  SEM_DADOS: { label: 'Sem dados', cls: 'bg-surface-2 text-subtle' },
} as const

export default async function VolumetriaPage() {
  const session = await getSession()
  const periodos = ultimosPeriodos(12)
  const todos = await Promise.all(periodos.map((p) => volumetriaDoPeriodo(p)))
  const registros = todos.filter((v): v is VolumetriaPeriodo => v !== null).reverse()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="t-h1 text-fg">Volumetria Mínima Contratada</h1>
        <p className="text-subtle text-sm mt-0.5">
          Controle geral da empresa. O realizado vem do lançamento diário.
        </p>
      </div>

      {session?.role !== 'COMERCIAL' && <FormVolumetria />}

      {registros.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-8 text-center">
          <p className="text-fg font-medium">Nenhuma volumetria mínima definida</p>
          <p className="text-subtle text-sm mt-1">
            Informe a quantidade mínima de transações contratada para um período acima.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  {['Período', 'Mínimo contratado', 'Realizado', 'Diferença', 'Status'].map((h, i) => (
                    <th key={h} className={`t-label text-subtle px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'} ${h === 'Status' ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((v) => {
                  const e = ESTILO[v.status]
                  return (
                    <tr key={v.periodo} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-muted font-medium">{formatMesRef(v.periodo)}</td>
                      <td className="px-4 py-3 text-right text-muted t-num">
                        {v.qtdMinima.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right text-fg t-num">
                        {v.realizado === null ? <span className="text-subtle">—</span> : v.realizado.toLocaleString('pt-BR')}
                      </td>
                      <td className={`px-4 py-3 text-right t-num ${
                        v.diferenca === null ? 'text-subtle' : v.diferenca >= 0 ? 'text-pos' : 'text-neg'
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
