export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatTPV, formatPercent, getCurrentMonth, formatMesRef } from '@/lib/utils'

export default async function VolumetriaPage() {
  const mesAtual = getCurrentMonth()

  const clientes = await prisma.cliente.findMany({
    where: { status: 'ATIVO', volumeMinimo: { gt: 0 } },
    select: {
      id: true, nome: true, volumeMinimo: true, tpvEsperado: true, segmento: true,
      processamentos: {
        where: { mesRef: mesAtual },
        select: { tpv: true, mesRef: true },
        take: 1,
      },
    },
    orderBy: { nome: 'asc' },
  })

  const comVolume = clientes.map(c => {
    const tpvAtual = c.processamentos[0]?.tpv || 0
    const pct = c.volumeMinimo! > 0 ? (tpvAtual / c.volumeMinimo!) * 100 : 0
    return { ...c, tpvAtual, pct }
  }).sort((a, b) => a.pct - b.pct)

  const abaixo = comVolume.filter(c => c.pct < 100).length
  const acima = comVolume.filter(c => c.pct >= 100).length
  const semDados = comVolume.filter(c => c.tpvAtual === 0).length

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Controle de Volumetria Mínima</h1>
        <p className="text-gray-600 text-sm mt-0.5">Clientes com volume mínimo contratado · {formatMesRef(mesAtual)}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Acima do Volume', count: acima, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Abaixo do Volume', count: abaixo - semDados, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Sem Dados no Mês', count: semDados, color: 'text-gray-400', bg: 'bg-gray-800' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-4`}>
            <p className="text-gray-500 text-xs mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.count}</p>
          </div>
        ))}
      </div>

      {comVolume.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-600">Nenhum cliente ativo com volume mínimo cadastrado.</p>
          <p className="text-gray-700 text-sm mt-1">Configure o campo "Volume Mínimo Contratado" na Carteira de Clientes.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Cliente', 'Volume Mínimo', 'TPV ' + formatMesRef(mesAtual), '% Atingido', 'Status', 'Indicador'].map(h => (
                  <th key={h} className={`text-xs font-medium text-gray-600 px-4 py-3 ${['Volume Mínimo','TPV ' + formatMesRef(mesAtual),'% Atingido'].includes(h)?'text-right':'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comVolume.map(c => {
                const ok = c.tpvAtual > 0 && c.pct >= 100
                const warn = c.tpvAtual > 0 && c.pct >= 50 && c.pct < 100
                const bad = c.tpvAtual > 0 && c.pct < 50
                const noData = c.tpvAtual === 0
                const statusLabel = noData ? 'Sem dados' : ok ? 'Atingido' : warn ? 'Parcial' : 'Abaixo'
                const statusColor = noData ? 'bg-gray-800 text-gray-500' : ok ? 'bg-emerald-500/10 text-emerald-400' : warn ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                const barColor = noData ? '#374151' : ok ? '#10b981' : warn ? '#f59e0b' : '#ef4444'
                return (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="px-4 py-3.5 text-white font-medium">{c.nome}</td>
                    <td className="px-4 py-3.5 text-right text-gray-400">{formatTPV(c.volumeMinimo!)}</td>
                    <td className="px-4 py-3.5 text-right text-sky-400">{c.tpvAtual > 0 ? formatTPV(c.tpvAtual) : '—'}</td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`font-bold ${noData?'text-gray-600':ok?'text-emerald-400':warn?'text-amber-400':'text-red-400'}`}>
                        {noData ? '—' : `${c.pct.toFixed(0)}%`}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{statusLabel}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="w-32 h-2 bg-gray-800 rounded-full">
                        <div className="h-2 rounded-full" style={{width:`${Math.min(c.pct,100)}%`, background: barColor}} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
