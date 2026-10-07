import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

/**
 * Natureza nao e mais editavel: saiu da tela de Categorias. Ela permanece no
 * banco (os graficos financeiros dependem dela) e e deduzida do NOME — por
 * isso renomear uma categoria de receita reavalia a natureza, e so isso.
 */
type Natureza = 'FLOAT' | 'SETUP' | 'SUSTENTACAO'

function naturezaPeloNome(nome: string, tipo: 'RECEITA' | 'DESPESA'): Natureza | null {
  if (tipo !== 'RECEITA') return null
  const n = nome.trim().toLowerCase()
  if (n.startsWith('float')) return 'FLOAT'
  if (n.startsWith('setup')) return 'SETUP'
  if (n.startsWith('sustenta')) return 'SUSTENTACAO'
  return null
}

/** Renomeia ou ativa/inativa. O tipo é imutável: mudá-lo reclassificaria
 *  lançamentos já feitos de receita para despesa. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const { nome, ativo } = await request.json()

  const atual = await prisma.categoriaFinanceira.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  const n = nome === undefined ? undefined : String(nome).trim()
  if (n !== undefined && !n) {
    return NextResponse.json({ error: 'Informe o nome da categoria.' }, { status: 400 })
  }
  if (n && n !== atual.nome) {
    const conflito = await prisma.categoriaFinanceira.findFirst({ where: { nome: n, tipo: atual.tipo } })
    if (conflito) return NextResponse.json({ error: `Já existe uma categoria ${n} desse tipo.` }, { status: 409 })
  }

  const categoria = await prisma.categoriaFinanceira.update({
    where: { id },
    data: {
      ...(n ? { nome: n } : {}),
      ...(typeof ativo === 'boolean' ? { ativo } : {}),
      // Renomear reavalia a natureza pelo nome novo.
      ...(n ? { natureza: naturezaPeloNome(n, atual.tipo) } : {}),
    },
  })

  await logAudit(session.userId, 'EDITOU_CATEGORIA_FINANCEIRA', 'CategoriaFinanceira', id, categoria.nome)
  return NextResponse.json({ categoria })
}

/** Só exclui categoria sem lançamento. Com lançamento, inative pelo PUT —
 *  apagar reescreveria a classificação do que já foi lançado. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.categoriaFinanceira.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })

  /**
   * QUATRO TABELAS referenciam a categoria, não uma.
   *
   * Lançamentos sempre referenciaram. Orçamento, despesa futura e receita
   * prevista entraram na v28, e as três usam `onDelete: Restrict` — sem
   * conferi-las aqui, excluir uma categoria orçada estouraria um erro de
   * constraint em vez da mensagem que diz o que fazer.
   */
  const [lancamentos, orcamentos, despesas, receitas] = await Promise.all([
    prisma.lancamentoFinanceiro.count({ where: { categoriaId: id } }),
    prisma.orcamento.count({ where: { categoriaId: id } }),
    prisma.despesaFutura.count({ where: { categoriaId: id } }),
    prisma.receitaPrevista.count({ where: { categoriaId: id } }),
  ])

  const vinculos = [
    { n: lancamentos, nome: 'lançamento' },
    { n: orcamentos, nome: 'orçamento' },
    { n: despesas, nome: 'despesa futura' },
    { n: receitas, nome: 'receita prevista' },
  ].filter((v) => v.n > 0)

  if (vinculos.length > 0) {
    const lista = vinculos
      .map((v) => `${v.n} ${v.nome}${v.n === 1 ? '' : 's'}`)
      .join(', ')
    return NextResponse.json({
      error: `A categoria ${atual.nome} tem ${lista}. Inative-a em vez de excluir.`,
    }, { status: 409 })
  }

  await prisma.categoriaFinanceira.delete({ where: { id } })
  await logAudit(session.userId, 'EXCLUIU_CATEGORIA_FINANCEIRA', 'CategoriaFinanceira', id, atual.nome)
  return NextResponse.json({ ok: true })
}
