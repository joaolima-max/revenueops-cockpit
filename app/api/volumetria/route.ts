import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { periodoAtual, ultimosPeriodos, volumetriaDoPeriodo } from '@/lib/kpi'

/** Volumetria mínima GERAL da empresa. Não existe volumetria por cliente. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const periodo = request.nextUrl.searchParams.get('periodo')
  if (periodo) {
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
    }
    return NextResponse.json({ volumetria: await volumetriaDoPeriodo(periodo) })
  }

  const periodos = ultimosPeriodos(12)
  const todos = await Promise.all(periodos.map((p) => volumetriaDoPeriodo(p)))
  return NextResponse.json({ volumetrias: todos.filter((v) => v !== null) })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role === 'COMERCIAL') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { periodo, qtdMinima, notas } = await request.json()
  if (!/^\d{4}-\d{2}$/.test(String(periodo))) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }
  const n = Math.round(Number(qtdMinima))
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: 'Quantidade mínima deve ser um número positivo.' }, { status: 400 })
  }

  const registro = await prisma.volumetriaMinima.upsert({
    where: { periodo },
    create: { periodo, qtdMinima: n, notas: notas ? String(notas).slice(0, 500) : null },
    update: { qtdMinima: n, notas: notas ? String(notas).slice(0, 500) : null },
  })

  await prisma.auditoria.create({
    data: { acao: 'DEFINIR_VOLUMETRIA', entidade: 'VolumetriaMinima', entidadeId: registro.id,
      detalhes: `${periodo}: mínimo ${n}`, userId: session.userId },
  })

  return NextResponse.json({ volumetria: await volumetriaDoPeriodo(periodo) })
}
