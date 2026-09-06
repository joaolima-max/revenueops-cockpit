import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, contagensClientes,
  volumetriaDoPeriodo, periodoAtual, ultimosPeriodos,
} from '@/lib/kpi'

/** Todos os números do cockpit vêm daqui, e daqui vêm de uma fonte só cada um. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const periodo = request.nextUrl.searchParams.get('periodo') || periodoAtual()
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const periodos = ultimosPeriodos(12)
  const [kpis, receita, metas, clientes, volumetria, serie] = await Promise.all([
    kpisDoPeriodo(periodo),
    linhasReceita(periodo),
    metasDoPeriodo(periodo),
    contagensClientes(),
    volumetriaDoPeriodo(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  return NextResponse.json({
    periodo, kpis, receita, metas, clientes, volumetria,
    evolucao: serie.map((k) => ({
      periodo: k.periodo,
      temDados: k.temDados,
      tpv: k.tpv,
      receitaTarifaria: k.receitaTarifaria,
      float: k.float,
      qtdTransacoes: k.qtdTransacoes,
      takeRate: k.takeRate,
    })),
  })
}
