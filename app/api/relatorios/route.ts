import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const dataInicio = searchParams.get('inicio') || ''
  const dataFim = searchParams.get('fim') || ''
  const segmento = searchParams.get('segmento') || ''
  const modelo = searchParams.get('modelo') || ''
  const status = searchParams.get('status') || ''

  // Build month range
  const now = new Date()
  const defaultFim = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const defaultInicio = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const inicio = dataInicio || defaultInicio
  const fim = dataFim || defaultFim

  // Build months array between inicio and fim
  const meses: string[] = []
  const [iy, im] = inicio.split('-').map(Number)
  const [fy, fm] = fim.split('-').map(Number)
  let cy = iy, cm = im
  while (cy < fy || (cy === fy && cm <= fm)) {
    meses.push(`${cy}-${String(cm).padStart(2, '0')}`)
    cm++; if (cm > 12) { cm = 1; cy++ }
  }

  // Cliente filter for processamentos
  let clienteIds: string[] | undefined
  if (segmento || modelo || status) {
    const clientes = await prisma.cliente.findMany({
      where: {
        ...(segmento ? { segmento: segmento as never } : {}),
        ...(modelo ? { modeloOperacional: modelo as never } : {}),
        ...(status ? { status: status as never } : {}),
      },
      select: { id: true },
    })
    clienteIds = clientes.map(c => c.id)
  }

  const procWhere = {
    mesRef: { in: meses },
    ...(clienteIds ? { clienteId: { in: clienteIds } } : {}),
  }

  const [
    proc12M, tpvTotal,
    clientesByStatus, clientesByModelo, clientesBySegmento,
    topClientes, fg12M,
    pedidosByTipo, metasMes,
  ] = await Promise.all([
    prisma.processamento.groupBy({
      by: ['mesRef'], where: procWhere,
      _sum: { tpv: true, receitaTarifaria: true, floating: true, qtdTransacoes: true, qtdMed: true },
      orderBy: { mesRef: 'asc' },
    }),
    prisma.processamento.aggregate({ where: procWhere, _sum: { tpv: true, receitaTarifaria: true, floating: true } }),
    prisma.cliente.groupBy({ by: ['status'], _count: true }),
    prisma.cliente.groupBy({ by: ['modeloOperacional'], _count: true }),
    prisma.cliente.groupBy({ by: ['segmento'], _count: true }),
    prisma.processamento.groupBy({
      by: ['clienteId'],
      where: procWhere,
      _sum: { receitaTarifaria: true, floating: true, tpv: true },
      orderBy: { _sum: { receitaTarifaria: 'desc' } },
      take: 10,
    }),
    prisma.forecastGeral.findMany({ where: { mesRef: { in: meses } }, orderBy: { mesRef: 'asc' } }),
    prisma.pedidoCobravel.groupBy({ by: ['tipo', 'status'], _sum: { valor: true }, _count: true }),
    prisma.meta.findMany({ where: { periodo: { in: meses } } }),
  ])

  const topClienteNames = await prisma.cliente.findMany({
    where: { id: { in: topClientes.map(t => t.clienteId) } },
    select: { id: true, nome: true, modeloOperacional: true, segmento: true, status: true },
  })
  const cMap = new Map(topClienteNames.map(c => [c.id, c]))

  const receitaTotal = (tpvTotal._sum.receitaTarifaria || 0) + (tpvTotal._sum.floating || 0)
  const takeRateMedio = (tpvTotal._sum.tpv || 0) > 0
    ? ((tpvTotal._sum.receitaTarifaria || 0) / (tpvTotal._sum.tpv || 1)) * 100 : 0

  const fgComReal = fg12M.filter(f => f.faturamentoRealizado != null && f.faturamentoPrevisto > 0)
  const precisaoForecast = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => a + (f.faturamentoRealizado! / f.faturamentoPrevisto) * 100, 0) / fgComReal.length : 0
  const margemOpMedia = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => a + (f.margemRealizada ?? f.margemPrevista), 0) / fgComReal.length : null

  return NextResponse.json({
    periodo: { inicio, fim, meses },
    summary: {
      receitaTotal, tpvTotal: tpvTotal._sum.tpv || 0,
      receitaTarifaria: tpvTotal._sum.receitaTarifaria || 0,
      floating: tpvTotal._sum.floating || 0,
      takeRateMedio, precisaoForecast, margemOpMedia,
    },
    proc12M: proc12M.map(p => ({
      mes: p.mesRef,
      tpv: p._sum.tpv || 0,
      receitaTarifaria: p._sum.receitaTarifaria || 0,
      floating: p._sum.floating || 0,
      total: (p._sum.receitaTarifaria || 0) + (p._sum.floating || 0),
      qtdTransacoes: p._sum.qtdTransacoes || 0,
      qtdMed: p._sum.qtdMed || 0,
      takeRate: (p._sum.tpv || 0) > 0 ? ((p._sum.receitaTarifaria || 0) / (p._sum.tpv || 1)) * 100 : 0,
    })),
    clientesByStatus, clientesByModelo, clientesBySegmento,
    topClientes: topClientes.map(t => ({
      ...t, ...cMap.get(t.clienteId),
      receita: (t._sum.receitaTarifaria || 0) + (t._sum.floating || 0),
    })),
    fg12M: fg12M.map(f => ({ ...f })),
    pedidosByTipo,
    metasMes,
  })
}
