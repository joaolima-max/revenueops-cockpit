import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { ultimosDias } from '@/lib/carteira'

/** Data em UTC, sem hora — o grão é o dia. */
function diaUTC(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Indicador operacional: o cliente movimentou conosco naquele dia?
 *
 * NÃO é TPV por cliente e não guarda valor nenhum. A ausência de linha
 * significa "sem registro", o que dá três estados com um único booleano e
 * evita que um dia não preenchido vire um "não" falso.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_carteira', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const dias = Math.min(Math.max(Number(sp.get('dias')) || 5, 1), 31)
  const dataInicial = diaUTC(ultimosDias(dias)[0])!

  const registros = await prisma.clienteDiaMovimento.findMany({
    where: {
      data: { gte: dataInicial },
      ...(sp.get('clienteId') ? { clienteId: sp.get('clienteId')! } : {}),
    },
    select: { clienteId: true, data: true, movimentou: true },
  })

  return NextResponse.json({
    dias: ultimosDias(dias),
    registros: registros.map((r) => ({
      clienteId: r.clienteId,
      data: r.data.toISOString().slice(0, 10),
      movimentou: r.movimentou,
    })),
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_carteira', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { clienteId, data, movimentou } = await request.json()
  const dia = diaUTC(String(data ?? ''))

  if (!clienteId) return NextResponse.json({ error: 'Informe o cliente.' }, { status: 400 })
  if (!dia) return NextResponse.json({ error: 'Data inválida. Use AAAA-MM-DD.' }, { status: 400 })
  if (typeof movimentou !== 'boolean') {
    return NextResponse.json({ error: 'Informe movimentou: true ou false.' }, { status: 400 })
  }
  if (dia.getTime() > Date.now()) {
    return NextResponse.json({ error: 'Não é possível registrar movimentação de um dia futuro.' }, { status: 400 })
  }

  const registro = await prisma.clienteDiaMovimento.upsert({
    where: { clienteId_data: { clienteId, data: dia } },
    create: { clienteId, data: dia, movimentou, registradoPorId: session.userId },
    update: { movimentou, registradoPorId: session.userId },
  })

  await logAudit(
    session.userId, 'REGISTROU_MOVIMENTO_DIARIO', 'ClienteDiaMovimento', registro.id,
    `${data}: ${movimentou ? 'movimentou' : 'não movimentou'}`,
  )

  return NextResponse.json({ registro })
}
