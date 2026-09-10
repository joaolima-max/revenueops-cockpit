import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

/** Marca uma notificação como lida ou não lida. Só o destinatário pode. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const { lida } = await request.json()

  // updateMany com o destinatário no where: um id de outro usuário simplesmente
  // não casa, em vez de vazar a existência da notificação por um 403.
  const { count } = await prisma.notificacao.updateMany({
    where: { id, destinatarioId: session.userId },
    data: { lidaEm: lida === false ? null : new Date() },
  })

  if (count === 0) return NextResponse.json({ error: 'Notificação não encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
