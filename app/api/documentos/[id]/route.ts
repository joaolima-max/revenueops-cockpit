import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

/**
 * Ativa/inativa. Não existe exclusão física pela interface: perder o registro
 * apagaria o rastro de que o arquivo existiu, e é justamente isso que a
 * auditoria precisa preservar.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_documents', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { ativo, categoria, descricao } = await request.json()

  const atual = await prisma.documento.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })

  const documento = await prisma.documento.update({
    where: { id },
    data: {
      ...(typeof ativo === 'boolean' ? { ativo } : {}),
      ...(categoria ? { categoria } : {}),
      ...(descricao !== undefined ? { descricao: descricao ? String(descricao).slice(0, 500) : null } : {}),
    },
  })

  if (typeof ativo === 'boolean' && ativo !== atual.ativo) {
    await logAudit(
      session.userId, ativo ? 'REATIVOU_DOCUMENTO' : 'INATIVOU_DOCUMENTO', 'Documento', id,
      `${atual.cliente.nome} · ${atual.nome}`,
    )
  }

  return NextResponse.json({ documento })
}
