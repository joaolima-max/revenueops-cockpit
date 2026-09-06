export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'

const CRITICIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const

const COR_CRITICIDADE: Record<string, string> = {
  BAIXA: '#A7ACB4', MEDIA: '#E0A62B', ALTA: '#FF7A80', CRITICA: '#C4262E',
}

function formatDuracao(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

export default async function MetricasOpPage() {
  const incidentes = await prisma.incidente.findMany({ orderBy: { inicio: 'desc' } })

  if (incidentes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <h1 className="text-lg font-bold text-white">Métricas Operacionais</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center mt-5">
          <p className="text-white font-medium">Nenhum incidente registrado</p>
          <p className="text-gray-600 text-sm mt-1">
            Os indicadores desta tela são calculados a partir dos incidentes.
          </p>
        </div>
      </div>
    )
  }

  const abertos = incidentes.filter((i) => !i.fim)
  const fechados = incidentes.filter((i) => i.fim)
  const downtimeTotal = incidentes.reduce((s, i) => s + (i.downtimeMins ?? 0), 0)
  const comDowntime = incidentes.filter((i) => i.downtimeMins != null)
  const mttr = comDowntime.length > 0 ? downtimeTotal / comDowntime.length : null

  const porCriticidade = CRITICIDADES.map((c) => ({
    criticidade: c,
    total: incidentes.filter((i) => i.criticidade === c).length,
  }))
  const maxCrit = Math.max(...porCriticidade.map((p) => p.total), 1)

  // Últimos 6 meses de volume de incidentes
  const hoje = new Date()
  const meses = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (5 - k), 1))
    const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    const doMes = incidentes.filter((i) => i.inicio >= d && i.inicio < fim)
    return {
      rotulo: d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }),
      total: doMes.length,
      downtime: doMes.reduce((s, i) => s + (i.downtimeMins ?? 0), 0),
    }
  })
  const maxMes = Math.max(...meses.map((m) => m.total), 1)

  const cards = [
    { label: 'Incidentes no total', valor: String(incidentes.length), sub: `${fechados.length} encerrados` },
    { label: 'Em aberto', valor: String(abertos.length), sub: abertos.length > 0 ? 'Requer acompanhamento' : 'Nenhum pendente' },
    { label: 'Downtime acumulado', valor: formatDuracao(downtimeTotal), sub: `${comDowntime.length} com medição` },
    { label: 'MTTR', valor: mttr === null ? '—' : formatDuracao(mttr), sub: 'Tempo médio de resolução' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 p-6 space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white">Métricas Operacionais</h1>
        <p className="text-gray-600 text-sm mt-0.5">Indicadores derivados dos incidentes registrados.</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-gray-900 border border-gray-800/60 rounded-xl p-4">
            <p className="text-xs text-gray-600 mb-1.5">{c.label}</p>
            <p className="text-xl font-bold text-white leading-none tabular-nums">{c.valor}</p>
            <p className="text-[10px] text-gray-700 mt-1.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Incidentes por criticidade</h3>
          <div className="space-y-3">
            {porCriticidade.map((p) => (
              <div key={p.criticidade}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-gray-500">{p.criticidade}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{p.total}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full">
                  <div className="h-1.5 rounded-full transition-all"
                    style={{ width: `${(p.total / maxCrit) * 100}%`, background: COR_CRITICIDADE[p.criticidade] }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Volume nos últimos 6 meses</h3>
          <div className="flex items-end gap-2 h-32">
            {meses.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full bg-blue-600/70 rounded-t transition-all"
                  style={{ height: `${Math.max((m.total / maxMes) * 100, m.total > 0 ? 6 : 2)}%` }}
                  title={`${m.total} incidentes · ${formatDuracao(m.downtime)}`} />
                <span className="text-[10px] text-gray-600 tabular-nums">{m.total}</span>
                <span className="text-[9px] text-gray-700 capitalize">{m.rotulo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
