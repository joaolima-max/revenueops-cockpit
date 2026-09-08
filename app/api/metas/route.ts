import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { periodoAtual, metasDoPeriodo } from '@/lib/kpi'

const TIPOS = ['RECEITA_TARIFARIA', 'TPV', 'SALDO_EM_CONTA', 'TRANSACOES', 'MEDS'] as const
type Tipo = (typeof TIPOS)[number]

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const periodo = request.nextUrl.searchParams.get('periodo') || periodoAtual()
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }
  // metasDoPeriodo devolve o alvo e o realizado derivado, mas nao o id nem o
  // periodo — e o client precisa deles para editar e excluir. Une as duas fontes
  // sem alterar metasDoPeriodo, que e compartilhada com dashboard e relatorios.
  const [registros, calculadas] = await Promise.all([
    prisma.meta.findMany({ where: { periodo }, orderBy: { tipo: 'asc' } }),
    metasDoPeriodo(periodo),
  ])
  const derivado = new Map(calculadas.map((m) => [m.tipo, m]))
  const metas = registros.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    valor: r.valor,
    periodo: r.periodo,
    realizado: derivado.get(r.tipo)?.realizado ?? null,
    atingimento: derivado.get(r.tipo)?.atingimento ?? null,
  }))
  return NextResponse.json({ periodo, metas })
}

/** Define ou atualiza a meta de um indicador. Só o alvo — o realizado é derivado. */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { tipo, periodo, valor } = await request.json()
  if (!TIPOS.includes(tipo as Tipo)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${TIPOS.join(', ')}` }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}$/.test(String(periodo))) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }
  const n = Number(valor)
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: 'Valor da meta deve ser um número positivo.' }, { status: 400 })
  }

  const meta = await prisma.meta.upsert({
    where: { tipo_periodo: { tipo: tipo as Tipo, periodo } },
    create: { tipo: tipo as Tipo, periodo, valor: n },
    update: { valor: n },
  })

  await prisma.auditoria.create({
    data: { acao: 'DEFINIR_META', entidade: 'Meta', entidadeId: meta.id,
      detalhes: `${tipo} em ${periodo}`, userId: session.userId },
  })

  return NextResponse.json({ meta })
}
