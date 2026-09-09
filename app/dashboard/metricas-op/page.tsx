export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'

const CRITICIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const

/* Severidade crescente nos tokens semânticos — responde ao tema. */
const COR_CRITICIDADE: Record<string, string> = {
  BAIXA: 'bg-subtle', MEDIA: 'bg-warn', ALTA: 'bg-alert', CRITICA: 'bg-neg',
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
      <div className="space-y-8">
        <h1 className="t-h1 text-fg">Métricas Operacionais</h1>
        <div className="bg-surface border border-line rounded-xl p-8 text-center mt-5">
          <p className="text-fg font-medium">Nenhum incidente registrado</p>
          <p className="text-subtle text-sm mt-1">
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
    <div className="space-y-8">
      <div>
        <h1 className="t-h1 text-fg">Métricas Operacionais</h1>
        <p className="text-subtle text-sm mt-0.5">Indicadores derivados dos incidentes registrados.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-line rounded-xl p-4">
            <p className="text-xs text-subtle mb-1.5">{c.label}</p>
            <p className="t-figure-sm text-fg">{c.valor}</p>
            <p className="text-[10px] text-subtle mt-1.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-surface border border-line rounded-xl p-5">
          <h3 className="t-h3 text-fg mb-4">Incidentes por criticidade</h3>
          <div className="space-y-3">
            {porCriticidade.map((p) => (
              <div key={p.criticidade}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-subtle">{p.criticidade}</span>
                  <span className="t-sm text-muted t-num">{p.total}</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full">
                  <div className={`h-1.5 rounded-full transition-all ${COR_CRITICIDADE[p.criticidade]}`}
                    style={{ width: `${(p.total / maxCrit) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-xl p-5">
          <h3 className="t-h3 text-fg mb-4">Volume nos últimos 6 meses</h3>
          <div className="flex items-end gap-2 h-32">
            {meses.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full bg-accent/70 rounded-t transition-all"
                  style={{ height: `${Math.max((m.total / maxMes) * 100, m.total > 0 ? 6 : 2)}%` }}
                  title={`${m.total} incidentes · ${formatDuracao(m.downtime)}`} />
                <span className="t-mono text-subtle">{m.total}</span>
                <span className="text-[9px] text-subtle capitalize">{m.rotulo}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
