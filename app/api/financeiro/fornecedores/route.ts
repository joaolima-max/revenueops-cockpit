import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

/** GET /api/financeiro/fornecedores?search=&incluirInativos=1 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const search = sp.get('search') ?? ''
  const incluirInativos = sp.get('incluirInativos') === '1'

  const fornecedores = await prisma.fornecedor.findMany({
    where: {
      ...(incluirInativos ? {} : { ativo: true }),
      ...(search
        ? {
            OR: [
              { razaoSocial: { contains: search, mode: 'insensitive' as const } },
              { cnpj: { contains: search, mode: 'insensitive' as const } },
              { descricaoServico: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    include: { categoria: { select: { id: true, nome: true, tipo: true } } },
    orderBy: { razaoSocial: 'asc' },
  })

  return NextResponse.json({ fornecedores })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { razaoSocial, cnpj, chavePix, descricaoServico, categoriaId } = await request.json()
  const nome = String(razaoSocial ?? '').trim()
  if (!nome) return NextResponse.json({ error: 'Informe a razão social.' }, { status: 400 })

  if (categoriaId) {
    const categoria = await prisma.categoriaFinanceira.findUnique({ where: { id: String(categoriaId) } })
    if (!categoria) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
  }

  const fornecedor = await prisma.fornecedor.create({
    data: {
      razaoSocial: nome,
      cnpj: cnpj ? String(cnpj).trim() : null,
      chavePix: chavePix ? String(chavePix).trim() : null,
      descricaoServico: descricaoServico ? String(descricaoServico).slice(0, 500) : null,
      categoriaId: categoriaId ? String(categoriaId) : null,
    },
    include: { categoria: { select: { id: true, nome: true, tipo: true } } },
  })

  await logAudit(session.userId, 'CRIOU_FORNECEDOR', 'Fornecedor', fornecedor.id, nome)
  return NextResponse.json({ fornecedor }, { status: 201 })
}
