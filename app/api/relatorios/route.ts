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
    receitaRealizadaRows,
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
    prisma.receitaRealizada.findMany({ where: { mesRef: { in: meses } }, orderBy: { mesRef: 'asc' } }),
  ])

  const topClienteNames = await prisma.cliente.findMany({
    where: { id: { in: topClientes.map(t => t.clienteId) } },
    select: { id: true, nome: true, modeloOperacional: true, segmento: true, status: true },
  })
  const cMap = new Map(topClienteNames.map(c => [c.id, c]))

  // Build lookup maps
  const rrMap = new Map(receitaRealizadaRows.map(r => [r.mesRef, r]))
  const fgMap = new Map(fg12M.map(f => [f.mesRef, f]))

  // Merge proc12M with receitaRealizada + forecastGeral fallback for TPV
  const mergedProc12M = proc12M.map(p => {
    const rr = rrMap.get(p.mesRef)
    const fg = fgMap.get(p.mesRef)
    const procReceitaTarifaria = p._sum.receitaTarifaria || 0
    const procFloating = p._sum.floating || 0
    const rrReceitaTarifaria = rr?.receitaTarifaria ?? 0
    const rrFloating = rr?.floatingRealizado ?? 0

    const mergedReceitaTarifaria = Math.max(procReceitaTarifaria, rrReceitaTarifaria)
    const mergedFloating = procFloating > 0 ? procFloating : rrFloating
    // TPV: processamento se disponível, senão forecastGeral realizado
    const procTpv = p._sum.tpv || 0
    const tpv = procTpv > 0 ? procTpv : (fg?.tpvRealizado || 0)

    return {
      mes: p.mesRef,
      tpv,
      receitaTarifaria: mergedReceitaTarifaria,
      floating: mergedFloating,
      total: mergedReceitaTarifaria + mergedFloating,
      qtdTransacoes: p._sum.qtdTransacoes || 0,
      qtdMed: p._sum.qtdMed || 0,
      takeRate: tpv > 0 ? (mergedReceitaTarifaria / tpv) * 100 : 0,
    }
  })

  // Also include months that only exist in receitaRealizada (no processamento rows)
  const procMesSet = new Set(proc12M.map(p => p.mesRef))
  for (const rr of receitaRealizadaRows) {
    if (!procMesSet.has(rr.mesRef)) {
      const fg = fgMap.get(rr.mesRef)
      const tpv = fg?.tpvRealizado || 0
      mergedProc12M.push({
        mes: rr.mesRef,
        tpv,
        receitaTarifaria: rr.receitaTarifaria,
        floating: rr.floatingRealizado,
        total: rr.receitaTarifaria + rr.floatingRealizado,
        qtdTransacoes: 0,
        qtdMed: 0,
        takeRate: tpv > 0 ? (rr.receitaTarifaria / tpv) * 100 : 0,
      })
    }
  }
  mergedProc12M.sort((a, b) => a.mes.localeCompare(b.mes))

  // Recalculate totals from merged data
  const mergedReceitaTarifariaTotal = mergedProc12M.reduce((s, r) => s + r.receitaTarifaria, 0)
  const mergedFloatingTotal = mergedProc12M.reduce((s, r) => s + r.floating, 0)
  const mergedTpvTotal = mergedProc12M.reduce((s, r) => s + r.tpv, 0)
  const qtdTransacoesTotal = mergedProc12M.reduce((s, r) => s + r.qtdTransacoes, 0)
  const receitaTotal = mergedReceitaTarifariaTotal + mergedFloatingTotal
  const takeRateMedio = mergedTpvTotal > 0
    ? (mergedReceitaTarifariaTotal / mergedTpvTotal) * 100 : 0

  const fgComReal = fg12M.filter(f => f.faturamentoRealizado != null && f.faturamentoPrevisto > 0)
  const precisaoForecast = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => a + (f.faturamentoRealizado! / f.faturamentoPrevisto) * 100, 0) / fgComReal.length : 0
  const margemOpMedia = fgComReal.length > 0
    ? fgComReal.reduce((a, f) => a + (f.margemRealizada ?? f.margemPrevista), 0) / fgComReal.length : null

  return NextResponse.json({
    periodo: { inicio, fim, meses },
    summary: {
      receitaTotal,
      tpvTotal: mergedTpvTotal,
      receitaTarifaria: mergedReceitaTarifariaTotal,
      floating: mergedFloatingTotal,
      takeRateMedio, precisaoForecast, margemOpMedia,
      qtdTransacoesTotal,
    },
    proc12M: mergedProc12M,
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
