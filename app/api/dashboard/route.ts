import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, indicadoresEstrutura,
  periodoAtual, ultimosPeriodos,
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
  const [kpis, receita, metas, estrutura, serie] = await Promise.all([
    kpisDoPeriodo(periodo),
    linhasReceita(periodo),
    metasDoPeriodo(periodo),
    indicadoresEstrutura(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
  ])

  // A volumetria saiu do Cockpit (§10): continua no seu próprio ambiente, que
  // consulta /api/volumetria. Não é mais devolvida aqui.
  return NextResponse.json({
    periodo, kpis, receita, metas, estrutura,
    evolucao: serie.map((k) => ({
      periodo: k.periodo,
      temDados: k.temDados,
      tpv: k.tpv,
      receitaTarifaria: k.receitaTarifaria,
      float: k.float,
      qtdTransacoes: k.qtdTransacoes,
      takeRate: k.takeRate,
      clientesAtivos: k.clientesAtivos,
    })),
  })
}
