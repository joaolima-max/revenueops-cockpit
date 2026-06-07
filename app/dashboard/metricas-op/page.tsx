export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { INCIDENTE_CRITICIDADE_LABELS, INCIDENTE_CRITICIDADE_COLORS } from '@/lib/utils'

async function getData() {
  const [incidentes, clientesAfetados] = await Promise.all([
    prisma.incidente.findMany({
      orderBy: { inicio: 'desc' },
    }),
    prisma.incidenteCliente.findMany({
      include: {
        incidente: { select: { satisfacao: true, criticidade: true } },
        cliente: { select: { id: true, nome: true } },
      },
    }),
  ])

  const comSat = incidentes.filter(i => i.satisfacao !== null)
  const mediaGlobal = comSat.length > 0
    ? comSat.reduce((s, i) => s + i.satisfacao! * 10, 0) / comSat.length
    : null
  const downtimeTotal = incidentes.reduce((s, i) => s + (i.downtimeMins || 0), 0)
  const abertos = incidentes.filter(i => !i.fim).length

  const clienteSat: Record<string, { nome: string; scores: number[]; incidentes: number }> = {}
  for (const ca of clientesAfetados) {
    const id = ca.clienteId
    if (!clienteSat[id]) clienteSat[id] = { nome: ca.cliente.nome, scores: [], incidentes: 0 }
    clienteSat[id].incidentes++
    if (ca.incidente.satisfacao !== null) clienteSat[id].scores.push(ca.incidente.satisfacao * 10)
  }
  const rankingSat = Object.entries(clienteSat).map(([id, d]) => ({
    id, nome: d.nome, incidentes: d.incidentes,
    media: d.scores.length > 0 ? d.scores.reduce((s, v) => s + v, 0) / d.scores.length : null,
  })).sort((a, b) => (a.media ?? 101) - (b.media ?? 101))

  const byCrit: Record<string, number> = {}
  for (const i of incidentes) byCrit[i.criticidade] = (byCrit[i.criticidade] || 0) + 1

  const now = new Date()
  const byMonth: Record<string, number> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    byMonth[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0
  }
  for (const inc of incidentes) {
    const d = new Date(inc.inicio)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (k in byMonth) byMonth[k]++
  }

  return { incidentes, mediaGlobal, downtimeTotal, abertos, rankingSat, byCrit, byMonth }
}

export default async function MetricasOpPage() {
  const { incidentes, mediaGlobal, downtimeTotal, abertos, rankingSat, byCrit, byMonth } = await getData()
  const meses = Object.keys(byMonth)
  const maxMes = Math.max(...Object.values(byMonth), 1)
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Métricas Operacionais</h1>
        <p className="text-gray-600 text-sm mt-0.5">Desempenho operacional e índice de satisfação dos clientes</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Incidentes', value: String(incidentes.length), color: 'text-white', bg: 'bg-gray-800/50' },
          { label: 'Em Aberto', value: String(abertos), color: abertos > 0 ? 'text-red-400' : 'text-emerald-400', bg: 'bg-red-500/10' },
          { label: 'Downtime Total', value: `${Math.floor(downtimeTotal/60)}h ${downtimeTotal%60}m`, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          { label: 'Satisfação Global', value: mediaGlobal !== null ? `${mediaGlobal.toFixed(0)}%` : '—', color: mediaGlobal === null ? 'text-gray-600' : mediaGlobal >= 70 ? 'text-emerald-400' : mediaGlobal >= 50 ? 'text-amber-400' : 'text-red-400', bg: 'bg-emerald-500/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-gray-800 rounded-xl p-5`}>
            <p className="text-gray-500 text-xs mb-1.5">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Incidentes por Mês (últimos 6M)</h3>
          <div className="flex items-end gap-2" style={{height: '140px'}}>
            {meses.map(mes => {
              const count = byMonth[mes]
              const pct = (count / maxMes) * 100
              const mo = parseInt(mes.split('-')[1])
              return (
                <div key={mes} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  {count > 0 && <span className="text-xs text-gray-400">{count}</span>}
                  <div className="w-full rounded-t" style={{
                    height: `${Math.max(pct, 5)}%`,
                    background: count > 0 ? 'linear-gradient(180deg,#10b981,#0ea5e9)' : '#1f2937'
                  }} />
                  <span className="text-xs text-gray-600">{MONTHS[mo-1]}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Incidentes por Criticidade</h3>
          <div className="space-y-3">
            {['CRITICA','ALTA','MEDIA','BAIXA'].map(crit => {
              const count = byCrit[crit] || 0
              const pct = incidentes.length > 0 ? (count / incidentes.length) * 100 : 0
              const barColor = crit==='CRITICA'?'#ef4444':crit==='ALTA'?'#f97316':crit==='MEDIA'?'#f59e0b':'#10b981'
              return (
                <div key={crit}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INCIDENTE_CRITICIDADE_COLORS[crit]}`}>
                      {INCIDENTE_CRITICIDADE_LABELS[crit]}
                    </span>
                    <span className="text-sm font-semibold text-white">{count} <span className="text-gray-600 text-xs font-normal">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full">
                    <div className="h-1.5 rounded-full" style={{width:`${pct}%`, background: barColor}} />
                  </div>
                </div>
              )
            })}
            {incidentes.length === 0 && <p className="text-gray-600 text-sm text-center py-4">Nenhum incidente registrado</p>}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-1">Índice de Satisfação Operacional por Cliente</h3>
        <p className="text-gray-600 text-xs mb-4">Baseado nas avaliações de satisfação registradas nos incidentes (escala 0–10 convertida em %)</p>
        {rankingSat.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">Nenhum cliente afetado com registro de satisfação</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Cliente', 'Incidentes', 'Índice de Satisfação', 'Barra'].map(h => (
                    <th key={h} className={`text-xs font-medium text-gray-600 pb-2 ${h==='Incidentes'||h==='Índice de Satisfação'?'text-right':'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankingSat.map(row => {
                  const color = row.media===null?'text-gray-600':row.media>=80?'text-emerald-400':row.media>=60?'text-amber-400':'text-red-400'
                  const barColor = row.media===null?'#374151':row.media>=80?'#10b981':row.media>=60?'#f59e0b':'#ef4444'
                  return (
                    <tr key={row.id} className="border-b border-gray-800/50">
                      <td className="py-3 text-white font-medium">{row.nome}</td>
                      <td className="py-3 text-right text-gray-400">{row.incidentes}</td>
                      <td className={`py-3 text-right font-bold ${color}`}>
                        {row.media !== null ? `${row.media.toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-3">
                        <div className="w-32 h-2 bg-gray-800 rounded-full ml-auto">
                          <div className="h-2 rounded-full" style={{width:`${row.media??0}%`, background: barColor}} />
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
    </div>
  )
}
