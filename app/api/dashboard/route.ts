import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { getLast12Months, getCurrentMonth } from '@/lib/utils'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const meses = getLast12Months()
  const mesAtual = getCurrentMonth()
  const anoAtual = new Date().getFullYear().toString()

  const [
    clientesAtivos,
    clientesEncerradosMes,
    processamentosMesAtual,
    processamentos12M,
    receitaRealizada12M,
    forecasts12M,
    mrrData,
    metaReceita,
    metaTPV,
    metaMRR,
  ] = await Promise.all([
    prisma.cliente.count({ where: { status: 'ATIVO' } }),
    prisma.cliente.count({
      where: {
        status: 'ENCERRADO',
        dataEncerramento: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
    prisma.processamento.aggregate({
      where: { mesRef: mesAtual },
      _sum: { tpv: true, receitaTarifaria: true, floating: true, qtdMed: true, qtdTransacoes: true },
    }),
    prisma.processamento.groupBy({
      by: ['mesRef'],
      where: { mesRef: { in: meses } },
      _sum: { tpv: true, receitaTarifaria: true, floating: true, qtdMed: true, qtdTransacoes: true },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.receitaRealizada.findMany({
      where: { mesRef: { in: meses } },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.forecast.groupBy({
      by: ['mesRef'],
      where: { mesRef: { in: meses } },
      _sum: { receitaPrevista: true, receitaRealizada: true, tpvPrevisto: true, tpvRealizado: true },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.cliente.aggregate({
      where: { status: 'ATIVO' },
      _sum: { mensalidadeApi: true, sustentacaoWhiteLabel: true },
    }),
    prisma.meta.findFirst({ where: { tipo: 'RECEITA', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'TPV', periodo: mesAtual } }),
    prisma.meta.findFirst({ where: { tipo: 'MRR', periodo: mesAtual } }),
  ])

  const tpvMesAtual = processamentosMesAtual._sum.tpv || 0
  const receitaTarifariaMes = processamentosMesAtual._sum.receitaTarifaria || 0
  const floatingMes = processamentosMesAtual._sum.floating || 0
  const qtdMedMes = processamentosMesAtual._sum.qtdMed || 0
  const qtdTransacoesMes = processamentosMesAtual._sum.qtdTransacoes || 0
  const mrr = (mrrData._sum.mensalidadeApi || 0) + (mrrData._sum.sustentacaoWhiteLabel || 0)
  const takeRateRealizado = tpvMesAtual > 0 ? (receitaTarifariaMes / tpvMesAtual) * 100 : 0
  const medMedio = qtdTransacoesMes > 0 ? (qtdMedMes / qtdTransacoesMes) * 100 : 0
  const receitaTotalAno = receitaRealizada12M
    .filter(r => r.mesRef.startsWith(anoAtual))
    .reduce((s, r) => s + r.receitaTarifaria + r.floatingRealizado, 0)
  const forecastsComRealizado = forecasts12M.filter(
    f => f._sum.receitaRealizada && f._sum.receitaPrevista && f._sum.receitaPrevista > 0
  )
  const precisaoForecast = forecastsComRealizado.length > 0
    ? forecastsComRealizado.reduce(
        (acc, f) => acc + (f._sum.receitaRealizada! / f._sum.receitaPrevista!) * 100, 0
      ) / forecastsComRealizado.length
    : 0

  const processamentosMap = new Map(processamentos12M.map(p => [p.mesRef, p._sum]))
  const receitaMap = new Map(receitaRealizada12M.map(r => [r.mesRef, r]))
  const forecastMap = new Map(forecasts12M.map(f => [f.mesRef, f._sum]))

  const chartData = meses.map(mes => {
    const proc = processamentosMap.get(mes)
    const rec = receitaMap.get(mes)
    const fc = forecastMap.get(mes)
    const tpv = proc?.tpv || 0
    const receita = rec?.receitaTarifaria || 0
    return {
      mes,
      receitaTarifaria: receita,
      floating: rec?.floatingRealizado || 0,
      tpv,
      receitaPrevista: fc?.receitaPrevista || 0,
      receitaRealizada: fc?.receitaRealizada || 0,
      takeRate: tpv > 0 ? (receita / tpv) * 100 : 0,
    }
  })

  return NextResponse.json({
    kpis: {
      clientesAtivos, mrr, tpvMesAtual, receitaTarifariaMes,
      floatingMes, takeRateRealizado, medMedio,
      churnMes: clientesEncerradosMes, receitaTotalAno, precisaoForecast,
    },
    metas: { receita: metaReceita, tpv: metaTPV, mrr: metaMRR },
    chartData,
    mrrEvolution: meses.map(mes => ({ mes, mrr })),
  })
}
