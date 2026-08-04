import { prisma } from '@/lib/prisma'
import { getLast12Months, getCurrentMonth, SEGMENTO_LABELS } from '@/lib/utils'
import {
  type Insight, type InsightType,
  ruleReceitaMoM, ruleTakeRateMoM, ruleSegmentoTop,
  ruleConcentracaoTop5, ruleFloatingTrend, ruleForecastPrecisao,
  ruleInadimplencia, ruleNovosClientes, ruleChurn,
} from '@/lib/insights'

const TYPE_STYLE: Record<InsightType, { dot: string; text: string; bg: string }> = {
  positive: { dot: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500/5 border border-emerald-500/15' },
  negative: { dot: 'bg-red-500', text: 'text-red-300', bg: 'bg-red-500/5 border border-red-500/15' },
  warning:  { dot: 'bg-amber-400', text: 'text-amber-300', bg: 'bg-amber-400/5 border border-amber-400/15' },
  neutral:  { dot: 'bg-sky-500', text: 'text-sky-300', bg: 'bg-sky-500/5 border border-sky-500/15' },
}

async function getInsightData() {
  const meses = getLast12Months()
  const mesAtual = getCurrentMonth()
  const [ano, mes] = mesAtual.split('-').map(Number)
  const inicioMes = new Date(ano, mes - 1, 1)
  const fimMes = new Date(ano, mes, 1)
  const prevMesDate = new Date(ano, mes - 2, 1)
  const mesAnterior = `${prevMesDate.getFullYear()}-${String(prevMesDate.getMonth() + 1).padStart(2, '0')}`

  const [
    proc3M, procMesByCliente, procPrevByCliente,
    clienteSegmentos, forecasts, inadimplentesRaw,
    novosClientes, churnCount, recMes, recPrev, procSegMes,
  ] = await Promise.all([
    prisma.processamento.groupBy({
      by: ['mesRef'], where: { mesRef: { in: meses.slice(-3) } },
      _sum: { floating: true, tpv: true, receitaTarifaria: true }, orderBy: { mesRef: 'asc' },
    }),
    prisma.processamento.groupBy({ by: ['clienteId'], where: { mesRef: mesAtual }, _sum: { receitaTarifaria: true } }),
    prisma.processamento.groupBy({ by: ['clienteId'], where: { mesRef: mesAnterior }, _sum: { receitaTarifaria: true } }),
    prisma.cliente.findMany({ where: { status: 'ATIVO' }, select: { id: true, segmento: true } }),
    prisma.forecastGeral.findMany({
      where: { mesRef: { in: meses } }, orderBy: { mesRef: 'asc' },
      select: { mesRef: true, faturamentoPrevisto: true, faturamentoRealizado: true },
    }),
    prisma.contaReceber.findMany({
      where: { status: { not: 'PAGO' }, dataVenc: { gte: inicioMes, lt: fimMes } },
      select: { clienteId: true }, distinct: ['clienteId'],
    }),
    prisma.cliente.count({ where: { dataFechamento: { gte: inicioMes, lt: fimMes } } }),
    prisma.cliente.count({ where: { status: 'ENCERRADO', dataEncerramento: { gte: inicioMes, lt: fimMes } } }),
    prisma.receitaRealizada.findFirst({ where: { mesRef: mesAtual } }),
    prisma.receitaRealizada.findFirst({ where: { mesRef: mesAnterior } }),
    prisma.processamento.groupBy({ by: ['clienteId'], where: { mesRef: mesAtual }, _sum: { receitaTarifaria: true } }),
  ])

  const mesAtualProc = proc3M.find(p => p.mesRef === mesAtual)
  const mesAntProc = proc3M.find(p => p.mesRef === mesAnterior)
  const recAtual = (mesAtualProc?._sum.receitaTarifaria ?? 0) > 0 ? (mesAtualProc!._sum.receitaTarifaria ?? 0) : (recMes?.receitaTarifaria ?? 0)
  const recAnterior = (mesAntProc?._sum.receitaTarifaria ?? 0) > 0 ? (mesAntProc!._sum.receitaTarifaria ?? 0) : (recPrev?.receitaTarifaria ?? 0)
  const tpvAtual = mesAtualProc?._sum.tpv ?? 0
  const tpvAnterior = mesAntProc?._sum.tpv ?? 0

  const fgComReal = forecasts.filter(f => f.faturamentoPrevisto > 0 && f.faturamentoRealizado != null && f.faturamentoRealizado > 0)
  const precisao = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => a + ((f.faturamentoRealizado! / f.faturamentoPrevisto) * 100), 0) / fgComReal.length
    : 0

  const segmentoMap = new Map(clienteSegmentos.map(c => [c.id, c.segmento ?? 'OUTROS']))
  const segReceita: Record<string, number> = {}
  for (const p of procSegMes) {
    const seg = segmentoMap.get(p.clienteId) ?? 'OUTROS'
    segReceita[seg] = (segReceita[seg] ?? 0) + (p._sum.receitaTarifaria ?? 0)
  }
  const totalSegReceita = Object.values(segReceita).reduce((a, b) => a + b, 0)
  const receitaPorSegmento = Object.entries(segReceita).map(([segmento, receita]) => ({ segmento, receita }))

  const sortDesc = (arr: Array<{ clienteId: string; _sum: { receitaTarifaria: number | null } }>) =>
    [...arr].sort((a, b) => (b._sum.receitaTarifaria ?? 0) - (a._sum.receitaTarifaria ?? 0))
  const top5Mes = sortDesc(procMesByCliente).slice(0, 5)
  const top5Prev = sortDesc(procPrevByCliente).slice(0, 5)
  const totalMes = procMesByCliente.reduce((a, p) => a + (p._sum.receitaTarifaria ?? 0), 0)
  const totalPrevC = procPrevByCliente.reduce((a, p) => a + (p._sum.receitaTarifaria ?? 0), 0)
  const shareTop5Mes = totalMes > 0 ? (top5Mes.reduce((a, p) => a + (p._sum.receitaTarifaria ?? 0), 0) / totalMes) * 100 : 0
  const shareTop5Prev = totalPrevC > 0 ? (top5Prev.reduce((a, p) => a + (p._sum.receitaTarifaria ?? 0), 0) / totalPrevC) * 100 : 0

  return {
    hasMesData: recAtual > 0 || tpvAtual > 0,
    recAtual, recAnterior, tpvAtual, tpvAnterior,
    precisao, mesesAnalisados: fgComReal.length,
    receitaPorSegmento, totalSegReceita,
    shareTop5Mes, shareTop5Prev,
    floatings: proc3M.map(p => p._sum.floating ?? 0),
    inadimplentes: inadimplentesRaw.length,
    novosClientes, churnCount,
  }
}

export default async function InsightsPanel() {
  const data = await getInsightData()
  const insights: Insight[] = []
  const push = (i: Insight | null) => { if (i) insights.push(i) }

  if (data.hasMesData) {
    push(ruleReceitaMoM(data.recAtual, data.recAnterior))
    push(ruleTakeRateMoM(data.tpvAtual, data.recAtual, data.tpvAnterior, data.recAnterior))
    push(ruleConcentracaoTop5(data.shareTop5Mes, data.shareTop5Prev))
    push(ruleSegmentoTop(data.receitaPorSegmento, data.totalSegReceita, SEGMENTO_LABELS))
  }
  push(ruleFloatingTrend(data.floatings))
  push(ruleForecastPrecisao(data.precisao, data.mesesAnalisados))
  push(ruleInadimplencia(data.inadimplentes))
  push(ruleNovosClientes(data.novosClientes))
  push(ruleChurn(data.churnCount))

  if (insights.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">Insights</h2>
        <span className="text-xs text-gray-600">· Interpretação automática · Regras de negócio</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {insights.map(insight => {
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
