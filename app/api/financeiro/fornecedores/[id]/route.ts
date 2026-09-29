import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const { razaoSocial, cnpj, chavePix, descricaoServico, categoriaId, ativo } = await request.json()

  const atual = await prisma.fornecedor.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 })

  const nome = razaoSocial === undefined ? undefined : String(razaoSocial).trim()
  if (nome !== undefined && !nome) {
    return NextResponse.json({ error: 'Informe a razão social.' }, { status: 400 })
  }

  const fornecedor = await prisma.fornecedor.update({
    where: { id },
    data: {
      ...(nome ? { razaoSocial: nome } : {}),
      ...(cnpj !== undefined ? { cnpj: cnpj ? String(cnpj).trim() : null } : {}),
      ...(chavePix !== undefined ? { chavePix: chavePix ? String(chavePix).trim() : null } : {}),
      ...(descricaoServico !== undefined
        ? { descricaoServico: descricaoServico ? String(descricaoServico).slice(0, 500) : null }
        : {}),
      ...(categoriaId !== undefined ? { categoriaId: categoriaId ? String(categoriaId) : null } : {}),
      ...(typeof ativo === 'boolean' ? { ativo } : {}),
    },
    include: { categoria: { select: { id: true, nome: true, tipo: true } } },
  })

  await logAudit(session.userId, 'EDITOU_FORNECEDOR', 'Fornecedor', id, fornecedor.razaoSocial)
  return NextResponse.json({ fornecedor })
}

/** Exclui o fornecedor. Nada aponta para ele (o lançamento classifica por
 *  categoria, não por fornecedor), então a exclusão não arrasta histórico.
 *  Inativar continua disponível pelo PUT para quem quer manter o cadastro. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.fornecedor.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 })

  await prisma.fornecedor.delete({ where: { id } })
  await logAudit(session.userId, 'EXCLUIU_FORNECEDOR', 'Fornecedor', id, atual.razaoSocial)
  return NextResponse.json({ ok: true })
}
