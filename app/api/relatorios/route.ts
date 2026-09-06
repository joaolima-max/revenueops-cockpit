import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import {
  kpisDoPeriodo, linhasReceita, metasDoPeriodo, contagensClientes,
  volumetriaDoPeriodo, periodoAtual, type KpisPeriodo,
} from '@/lib/kpi'

/** Lista de "YYYY-MM" entre dois períodos, inclusive. */
function periodosEntre(inicio: string, fim: string): string[] {
  const out: string[] = []
  const [iy, im] = inicio.split('-').map(Number)
  const [fy, fm] = fim.split('-').map(Number)
  let y = iy, m = im
  while (y < fy || (y === fy && m <= fm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
    if (out.length > 60) break
  }
  return out
}

/**
 * Dados dos seis relatórios. Todos derivam das fontes oficiais — não há
 * número calculado de forma diferente aqui e no dashboard.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const atual = periodoAtual()
  const fim = searchParams.get('fim') || atual
  const inicio = searchParams.get('inicio') || (() => {
    const [y, m] = atual.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 12, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })()

  if (!/^\d{4}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}$/.test(fim)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const segmento = searchParams.get('segmento') || ''
  const modelo = searchParams.get('modelo') || ''
  const status = searchParams.get('status') || ''
  const periodos = periodosEntre(inicio, fim)

  const filtroCliente = {
    ...(segmento ? { segmento: segmento as never } : {}),
    ...(modelo ? { modeloOperacional: modelo as never } : {}),
    ...(status ? { status: status as never } : {}),
  }

  const [serie, receitaFim, metas, contagens, volumetria, clientes, contas, incidentes, leads, deals] =
    await Promise.all([
      Promise.all(periodos.map((p) => kpisDoPeriodo(p))),
      linhasReceita(fim),
      metasDoPeriodo(fim),
      contagensClientes(),
      volumetriaDoPeriodo(fim),
      prisma.cliente.findMany({
        where: filtroCliente,
        select: {
          id: true, nome: true, status: true, modeloOperacional: true, segmento: true,
          mensalidadeApi: true, sustentacaoWhiteLabel: true, setup: true,
          dataFechamento: true, dataEncerramento: true, scoreRisco: true,
          owner: { select: { name: true } },
        },
        orderBy: { nome: 'asc' },
      }),
      prisma.contaReceber.findMany({
        select: { id: true, tipo: true, valor: true, status: true, dataVenc: true,
          cliente: { select: { nome: true } } },
        orderBy: { dataVenc: 'desc' },
        take: 200,
      }),
      prisma.incidente.findMany({ orderBy: { inicio: 'desc' }, take: 100 }),
      prisma.lead.groupBy({ by: ['status'], _count: true }),
      prisma.deal.groupBy({ by: ['stage'], _count: true, _sum: { value: true } }),
    ])

  const comDados = serie.filter((k: KpisPeriodo) => k.temDados)

  const evolucao = serie.map((k) => ({
    periodo: k.periodo,
    temDados: k.temDados,
    tpv: k.tpv,
    receitaTarifaria: k.receitaTarifaria,
    float: k.float,
    qtdTransacoes: k.qtdTransacoes,
    qtdMed: k.qtdMed,
    takeRate: k.takeRate,
    percentMed: k.percentMed,
    saldoMedio: k.saldoMedio,
  }))

  const agrupa = <T extends string>(itens: Array<Record<string, unknown>>, campo: string) => {
    const acc: Record<string, number> = {}
    for (const i of itens) {
      const k = String(i[campo] ?? 'INDEFINIDO') as T
      acc[k] = (acc[k] ?? 0) + 1
    }
    return acc
  }

  return NextResponse.json({
    periodo: { inicio, fim, periodos },
    semDados: comDados.length === 0,

    // Relatório Institucional / Conselho
    consolidado: {
      tpv: comDados.reduce((a, k) => a + (k.tpv ?? 0), 0),
      receitaTarifaria: comDados.reduce((a, k) => a + (k.receitaTarifaria ?? 0), 0),
      float: comDados.reduce((a, k) => a + (k.float ?? 0), 0),
      qtdTransacoes: comDados.reduce((a, k) => a + (k.qtdTransacoes ?? 0), 0),
      qtdMed: comDados.reduce((a, k) => a + (k.qtdMed ?? 0), 0),
      mesesComLancamento: comDados.length,
      mesesNoPeriodo: periodos.length,
    },
    evolucao,
    linhasReceita: receitaFim,
    contagens,

    // Relatório de Metas
    metas,

    // Relatório Financeiro
    financeiro: {
      contas,
      porStatus: agrupa(contas as unknown as Array<Record<string, unknown>>, 'status'),
      totalEmAberto: contas.filter((c) => c.status !== 'PAGO').reduce((a, c) => a + c.valor, 0),
      totalPago: contas.filter((c) => c.status === 'PAGO').reduce((a, c) => a + c.valor, 0),
    },

    // Relatório Comercial
    comercial: {
      leads: Object.fromEntries(leads.map((l) => [l.status, l._count])),
      deals: deals.map((d) => ({ stage: d.stage, count: d._count, valor: d._sum.value ?? 0 })),
      clientes,
      porStatus: agrupa(clientes as unknown as Array<Record<string, unknown>>, 'status'),
      porModelo: agrupa(clientes as unknown as Array<Record<string, unknown>>, 'modeloOperacional'),
      porSegmento: agrupa(clientes as unknown as Array<Record<string, unknown>>, 'segmento'),
    },

    // Relatório Operacional
    operacional: {
      incidentes,
      abertos: incidentes.filter((i) => !i.fim).length,
      downtimeTotal: incidentes.reduce((a, i) => a + (i.downtimeMins ?? 0), 0),
      porCriticidade: agrupa(incidentes as unknown as Array<Record<string, unknown>>, 'criticidade'),
      volumetria,
    },
  })
}
