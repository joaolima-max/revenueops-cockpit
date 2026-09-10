import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { count } = await prisma.notificacao.updateMany({
    where: { destinatarioId: session.userId, lidaEm: null },
    data: { lidaEm: new Date() },
  })

  return NextResponse.json({ marcadas: count })
}
