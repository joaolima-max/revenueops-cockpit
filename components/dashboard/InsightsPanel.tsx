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
  positive: { dot: 'bg-pos', text: 'text-pos', bg: 'bg-pos/5 border border-pos/15' },
  negative: { dot: 'bg-neg', text: 'text-neg', bg: 'bg-neg/5 border border-neg/15' },
  warning: { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/5 border border-warn/15' },
  neutral: { dot: 'bg-accent', text: 'text-accent-soft', bg: 'bg-accent/5 border border-accent/15' },
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
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="t-h3 text-fg">Insights</h2>
        <span className="text-xs text-subtle">· Regras de negócio sobre o lançamento diário</span>
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
