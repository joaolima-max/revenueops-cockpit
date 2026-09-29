import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

const TIPOS = ['RECEITA', 'DESPESA'] as const
type Tipo = (typeof TIPOS)[number]

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

/** GET /api/financeiro/categorias?tipo=RECEITA|DESPESA */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const tipoParam = request.nextUrl.searchParams.get('tipo') ?? ''
  const tipo = TIPOS.includes(tipoParam as Tipo) ? (tipoParam as Tipo) : undefined

  const categorias = await prisma.categoriaFinanceira.findMany({
    where: { ...(tipo ? { tipo } : {}) },
    orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
  })

  return NextResponse.json({ categorias })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { nome, tipo } = await request.json()
  const n = String(nome ?? '').trim()
  if (!n) return NextResponse.json({ error: 'Informe o nome da categoria.' }, { status: 400 })
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Escolha se a categoria é de receita ou de despesa.' }, { status: 400 })
  }

  // O par (nome, tipo) é único: "Impostos" pode existir dos dois lados, mas
  // não duas vezes do mesmo.
  const jaExiste = await prisma.categoriaFinanceira.findFirst({ where: { nome: n, tipo } })
  if (jaExiste) {
    return NextResponse.json(
      { error: `Já existe uma categoria de ${tipo === 'RECEITA' ? 'receita' : 'despesa'} chamada ${n}.` },
      { status: 409 },
    )
  }

  const categoria = await prisma.categoriaFinanceira.create({ data: { nome: n, tipo } })
  await logAudit(session.userId, 'CRIOU_CATEGORIA_FINANCEIRA', 'CategoriaFinanceira', categoria.id, `${n} (${tipo})`)

  return NextResponse.json({ categoria }, { status: 201 })
}
