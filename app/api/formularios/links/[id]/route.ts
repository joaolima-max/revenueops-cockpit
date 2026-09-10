import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

/** Revoga um link. Não apaga: as respostas já recebidas continuam referenciando-o. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { revogado } = await request.json()

  const link = await prisma.formularioLink.update({
    where: { id },
    data: { revogadoEm: revogado === false ? null : new Date() },
  })

  await logAudit(
    session.userId, revogado === false ? 'REATIVOU_LINK_FORMULARIO' : 'REVOGOU_LINK_FORMULARIO',
    'FormularioLink', id, '',
  )
  return NextResponse.json({ link })
}
