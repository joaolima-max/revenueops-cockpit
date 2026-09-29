import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { urlAssinada, removerArquivo } from '@/lib/storage'

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

async function carregar(anexoId: string, lancamentoId: string) {
  return prisma.lancamentoAnexo.findFirst({
    where: { id: anexoId, lancamentoId },
    include: { documento: true, lancamento: { select: { descricao: true } } },
  })
}

/**
 * Download por URL assinada de curta duração — o bucket é privado e nunca
 * serve o arquivo direto. O acesso é auditado.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_financeiro', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id, anexoId } = await params
  const anexo = await carregar(anexoId, id)
  if (!anexo) return NextResponse.json({ error: 'Anexo não encontrado.' }, { status: 404 })

  const url = await urlAssinada(anexo.documento.storageKey)

  await logAudit(
    session.userId, 'BAIXOU_ANEXO_LANCAMENTO', 'LancamentoFinanceiro', id,
    `${anexo.lancamento.descricao}: ${anexo.documento.nome}`,
  )

  return NextResponse.json({ url, nome: anexo.documento.nome })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id, anexoId } = await params
  const anexo = await carregar(anexoId, id)
  if (!anexo) return NextResponse.json({ error: 'Anexo não encontrado.' }, { status: 404 })

  // O Documento cai em cascata com o anexo; os bytes saem do bucket aqui,
  // porque o Storage não participa da transação do banco.
  await prisma.documento.delete({ where: { id: anexo.documentoId } })
  await removerArquivo(anexo.documento.storageKey).catch(() => {})

  await logAudit(
    session.userId, 'REMOVEU_ANEXO_LANCAMENTO', 'LancamentoFinanceiro', id,
    `${anexo.lancamento.descricao}: ${anexo.documento.nome}`,
  )

  return NextResponse.json({ ok: true })
}
