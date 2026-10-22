import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, indicadoresEstrutura,
  baseTakeRate, periodoAtual, ultimosPeriodos,
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
  /**
   * O TAKE RATE VEM DE `baseTakeRate`, e não mais de `kpisDoPeriodo`.
   *
   * Ele saiu de `KpisPeriodo` porque deixou de depender só do Lançamento
   * Diário: é a receita elegível (tarifa sem o MRR embutido, mais os
   * lançamentos de BaaS) sobre o TPV. O campo `evolucao[].takeRate` continua
   * na resposta, com o número corrigido — a mesma função que o Cockpit e o
   * Conselho exibem.
   */
  const [kpis, receita, metas, estrutura, serie, takeRates] = await Promise.all([
    kpisDoPeriodo(periodo),
    linhasReceita(periodo),
    metasDoPeriodo(periodo),
    indicadoresEstrutura(periodo),
    Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
    Promise.all(periodos.map((p) => baseTakeRate(p))),
  ])

  // A volumetria saiu do Cockpit (§10): continua no seu próprio ambiente, que
  // consulta /api/volumetria. Não é mais devolvida aqui.
  return NextResponse.json({
    periodo, kpis, receita, metas, estrutura,
    evolucao: serie.map((k, i) => ({
      periodo: k.periodo,
      temDados: k.temDados,
      tpv: k.tpv,
      receitaTarifaria: k.receitaTarifaria,
      float: k.float,
      qtdTransacoes: k.qtdTransacoes,
      takeRate: takeRates[i].takeRate,
      clientesAtivos: k.clientesAtivos,
    })),
  })
}
