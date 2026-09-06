import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { intervaloMes, periodoAtual, kpisDoPeriodo } from '@/lib/kpi'

/** Normaliza "YYYY-MM-DD" para meia-noite UTC — o grão de LancamentoDiario. */
function parseData(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d
}

function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** GET /api/forecast?periodo=YYYY-MM — lançamentos do mês + KPIs derivados. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const periodo = request.nextUrl.searchParams.get('periodo') || periodoAtual()
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const { inicio, fim } = intervaloMes(periodo)
  const [lancamentos, kpis] = await Promise.all([
    prisma.lancamentoDiario.findMany({
      where: { data: { gte: inicio, lt: fim } },
      orderBy: { data: 'asc' },
    }),
    kpisDoPeriodo(periodo),
  ])

  return NextResponse.json({ periodo, lancamentos, kpis })
}

/**
 * POST /api/forecast — cria ou atualiza o lançamento de uma data.
 * Float não entra aqui: é derivado do saldo em conta.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role === 'COMERCIAL') {
    return NextResponse.json({ error: 'Sem permissão para lançar' }, { status: 403 })
  }

  const body = await request.json()
  const data = parseData(String(body.data ?? ''))
  if (!data) return NextResponse.json({ error: 'Data inválida. Use YYYY-MM-DD.' }, { status: 400 })
  if (data.getTime() > Date.now()) {
    return NextResponse.json({ error: 'Não é possível lançar data futura.' }, { status: 400 })
  }

  const valores = {
    receitaTarifaria: numero(body.receitaTarifaria),
    tpv: numero(body.tpv),
    saldoEmConta: numero(body.saldoEmConta),
    qtdTransacoes: Math.round(numero(body.qtdTransacoes)),
    qtdMed: Math.round(numero(body.qtdMed)),
    notas: body.notas ? String(body.notas).slice(0, 500) : null,
  }

  if (valores.qtdMed > valores.qtdTransacoes) {
    return NextResponse.json(
      { error: 'Quantidade de MEDs não pode exceder a de transações.' },
      { status: 400 }
    )
  }

  const existente = await prisma.lancamentoDiario.findUnique({ where: { data } })
  const lancamento = await prisma.lancamentoDiario.upsert({
    where: { data },
    create: { data, ...valores },
    update: valores,
  })

  await prisma.auditoria.create({
    data: {
      acao: existente ? 'ATUALIZAR' : 'CRIAR',
      entidade: 'LancamentoDiario',
      entidadeId: lancamento.id,
      detalhes: `Lançamento de ${data.toISOString().slice(0, 10)}`,
      userId: session.userId,
    },
  })

  return NextResponse.json({ lancamento }, { status: existente ? 200 : 201 })
}

/** DELETE /api/forecast?data=YYYY-MM-DD */
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores podem excluir' }, { status: 403 })
  }

  const data = parseData(request.nextUrl.searchParams.get('data') ?? '')
  if (!data) return NextResponse.json({ error: 'Data inválida' }, { status: 400 })

  const existente = await prisma.lancamentoDiario.findUnique({ where: { data } })
  if (!existente) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 })

  await prisma.lancamentoDiario.delete({ where: { data } })
  await prisma.auditoria.create({
    data: {
      acao: 'EXCLUIR',
      entidade: 'LancamentoDiario',
      entidadeId: existente.id,
      detalhes: `Lançamento de ${data.toISOString().slice(0, 10)}`,
      userId: session.userId,
    },
  })

  return NextResponse.json({ ok: true })
}
