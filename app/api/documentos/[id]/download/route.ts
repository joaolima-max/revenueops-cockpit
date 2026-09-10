import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { urlAssinada, storageConfigurado } from '@/lib/storage'

/**
 * Devolve uma signed URL de 60 segundos — tempo de clicar, não de compartilhar.
 * O bucket é privado; este é o único caminho para os bytes, e ele checa
 * permissão e grava auditoria antes de emitir o link.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'download_documents', session.role)) {
    return NextResponse.json({ error: 'Você não tem permissão para baixar documentos.' }, { status: 403 })
  }
  if (!storageConfigurado()) {
    return NextResponse.json({ error: 'Storage não configurado.' }, { status: 503 })
  }

  const { id } = await params
  const documento = await prisma.documento.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!documento) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })
  if (!documento.ativo) return NextResponse.json({ error: 'Documento inativo.' }, { status: 409 })

  const url = await urlAssinada(documento.storageKey, 60)

  await logAudit(
    session.userId, 'BAIXOU_DOCUMENTO', 'Documento', id,
    `${documento.cliente.nome} · ${documento.nome}`,
  )

  return NextResponse.json({ url, nome: documento.nome, expiraEm: 60 })
}
