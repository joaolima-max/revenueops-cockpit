export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { intervaloMes, periodoAtual } from '@/lib/periodo'
import CalendarioLancamentos from '@/components/forecast/CalendarioLancamentos'

/**
 * LANÇAMENTO DIÁRIO — tela de entrada do realizado.
 *
 * Só o calendário e os lançamentos do mês. Os KPIs derivados saíram do topo
 * desta tela: vivem no Cockpit e no Conselho, calculados da mesma fonte, e não
 * havia motivo para uma terceira leitura deles dentro do fluxo de digitação.
 */
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const session = await getSession()
  const params = await searchParams
  const periodo = /^\d{4}-\d{2}$/.test(params.periodo ?? '') ? params.periodo! : periodoAtual()

  const { inicio, fim } = intervaloMes(periodo)
  const lancamentos = await prisma.lancamentoDiario.findMany({
    where: { data: { gte: inicio, lt: fim } },
    orderBy: { data: 'asc' },
  })

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
        clientesAtivos: l.clientesAtivos,
        notas: l.notas,
      }))}
    />
  )
}
