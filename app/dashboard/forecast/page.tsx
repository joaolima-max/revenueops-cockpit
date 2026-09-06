export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { intervaloMes, periodoAtual, kpisDoPeriodo } from '@/lib/kpi'
import CalendarioLancamentos from '@/components/forecast/CalendarioLancamentos'

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const session = await getSession()
  const params = await searchParams
  const periodo = /^\d{4}-\d{2}$/.test(params.periodo ?? '') ? params.periodo! : periodoAtual()

  const { inicio, fim } = intervaloMes(periodo)
  const [lancamentos, kpis] = await Promise.all([
    prisma.lancamentoDiario.findMany({
      where: { data: { gte: inicio, lt: fim } },
      orderBy: { data: 'asc' },
    }),
    kpisDoPeriodo(periodo),
  ])

  return (
    <CalendarioLancamentos
      periodo={periodo}
      podeEditar={session?.role !== 'COMERCIAL'}
      podeExcluir={session?.role === 'ADMIN'}
      lancamentos={lancamentos.map((l) => ({
        data: l.data.toISOString().slice(0, 10),
        receitaTarifaria: l.receitaTarifaria,
        tpv: l.tpv,
        saldoEmConta: l.saldoEmConta,
        qtdTransacoes: l.qtdTransacoes,
        qtdMed: l.qtdMed,
        notas: l.notas,
      }))}
      kpis={{
        temDados: kpis.temDados,
        diasLancados: kpis.diasLancados,
        tpv: kpis.tpv,
        receitaTarifaria: kpis.receitaTarifaria,
        qtdTransacoes: kpis.qtdTransacoes,
        qtdMed: kpis.qtdMed,
        saldoMedio: kpis.saldoMedio,
        float: kpis.float,
        takeRate: kpis.takeRate,
        percentMed: kpis.percentMed,
      }}
    />
  )
}
