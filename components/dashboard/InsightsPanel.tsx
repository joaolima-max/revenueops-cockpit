import { prisma } from '@/lib/prisma'
import {
  kpisDoPeriodo, volumetriaDoPeriodo, periodoAtual, ultimosPeriodos, intervaloMes,
} from '@/lib/kpi'
import {
  type Insight, type InsightType,
  ruleReceitaMoM, ruleTakeRateMoM, ruleFloatTrend, ruleVolumetria,
  ruleDiasSemLancamento, ruleInadimplencia, ruleNovosClientes, ruleChurn,
} from '@/lib/insights'

const TYPE_STYLE: Record<InsightType, { dot: string; text: string; bg: string }> = {
  positive: { dot: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500/5 border border-emerald-500/15' },
  negative: { dot: 'bg-red-500', text: 'text-red-300', bg: 'bg-red-500/5 border border-red-500/15' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-400/5 border border-amber-400/15' },
  neutral: { dot: 'bg-sky-500', text: 'text-sky-300', bg: 'bg-sky-500/5 border border-sky-500/15' },
}

export default async function InsightsPanel() {
  const periodo = periodoAtual()
  const periodos = ultimosPeriodos(3)
  const anterior = periodos[periodos.length - 2]
  const { inicio, fim } = intervaloMes(periodo)

  const [kpis, kpisPrev, serie, volumetria, inadimplentes, novos, churn] = await Promise.all([
    kpisDoPeriodo(periodo),
    kpisDoPeriodo(anterior),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
    volumetriaDoPeriodo(periodo),
    prisma.contaReceber.findMany({
      where: { status: { not: 'PAGO' }, dataVenc: { gte: inicio, lt: fim } },
      select: { clienteId: true }, distinct: ['clienteId'],
    }),
    prisma.cliente.count({ where: { dataFechamento: { gte: inicio, lt: fim } } }),
    prisma.cliente.count({ where: { status: 'ENCERRADO', dataEncerramento: { gte: inicio, lt: fim } } }),
  ])

  const insights: Insight[] = []
  const add = (i: Insight | null) => { if (i) insights.push(i) }

  if (kpis.temDados) {
    if (kpis.receitaTarifaria !== null && kpisPrev.receitaTarifaria !== null) {
      add(ruleReceitaMoM(kpis.receitaTarifaria, kpisPrev.receitaTarifaria))
    }
    add(ruleTakeRateMoM(kpis.takeRate, kpisPrev.takeRate))

    const decorridos = Math.min(
      new Date().getUTCDate(),
      new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0)).getUTCDate()
    )
    add(ruleDiasSemLancamento(kpis.diasLancados, decorridos))
  }

  const floats = serie.filter((k) => k.float !== null).map((k) => k.float as number)
  add(ruleFloatTrend(floats))

  if (volumetria) add(ruleVolumetria(volumetria.status, volumetria.qtdMinima, volumetria.realizado))
  add(ruleInadimplencia(inadimplentes.length))
  add(ruleNovosClientes(novos))
  add(ruleChurn(churn))

  if (insights.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">Insights</h2>
        <span className="text-xs text-gray-600">· Regras de negócio sobre o lançamento diário</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {insights.map((insight) => {
          const s = TYPE_STYLE[insight.type]
          return (
            <div key={insight.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${s.bg}`}>
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <span className={s.text}>{insight.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
