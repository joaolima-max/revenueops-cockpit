import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

/**
 * Cada usuário vê SOMENTE as suas. O filtro é `destinatarioId`, não uma chave
 * de permissão — não há o que autorizar por módulo aqui.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const apenasNaoLidas = sp.get('naoLidas') === '1'
  const limite = Math.min(Number(sp.get('limite')) || 30, 100)

  const [notificacoes, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where: { destinatarioId: session.userId, ...(apenasNaoLidas ? { lidaEm: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limite,
    }),
    prisma.notificacao.count({ where: { destinatarioId: session.userId, lidaEm: null } }),
  ])

  return NextResponse.json({ notificacoes, naoLidas })
}
