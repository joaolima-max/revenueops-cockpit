import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'

/**
 * PRODUTOS TARIFADOS de uma condição BaaS / White Label.
 *
 * Antes as tarifas eram colunas fixas (`pix`, `kyc`): não dava para cadastrar
 * produto novo sem migration, e o Lançamento BaaS precisa listar TODOS os
 * produtos do parceiro. As colunas antigas ficam no lugar — a migration as
 * semeou como produtos —, mas deixaram de ser a fonte.
 */
export const dynamic = 'force-dynamic'

function podeGerenciar(s: { permissoes?: string[]; role: string }): boolean {
  return hasPermission(s.permissoes ?? null, 'manage_financeiro', s.role)
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_financeiro', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const condicaoId = request.nextUrl.searchParams.get('condicaoId')
  if (!condicaoId) return NextResponse.json({ error: 'Informe a condição.' }, { status: 400 })

  const produtos = await prisma.condicaoProduto.findMany({
    where: { condicaoId },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ produtos })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { condicaoId, nome, preco, unidade, ordem } = await request.json()

  if (typeof condicaoId !== 'string' || !condicaoId) {
    return NextResponse.json({ error: 'Informe a condição.' }, { status: 400 })
  }
  const rotulo = typeof nome === 'string' ? nome.trim() : ''
  if (!rotulo) return NextResponse.json({ error: 'O nome do produto é obrigatório.' }, { status: 400 })

  const valor = Number(preco)
  // Preço zero é VÁLIDO: há produto contratado sem tarifa. Negativo não é —
  // inverteria o sinal da tarifa no cálculo do lançamento.
  if (!Number.isFinite(valor) || valor < 0) {
    return NextResponse.json({ error: 'Preço inválido.' }, { status: 400 })
  }

  const condicao = await prisma.condicaoComercial.findUnique({
    where: { id: condicaoId }, select: { id: true, nomeFantasia: true },
  })
  if (!condicao) return NextResponse.json({ error: 'Condição não encontrada.' }, { status: 404 })

  try {
    const produto = await prisma.condicaoProduto.create({
      data: {
        condicaoId, nome: rotulo, preco: valor,
        // O QUE SE CONTA no volume: transação, consulta, conta, mês. Entra no
        // rótulo da coluna do lançamento, para o colaborador saber o que está
        // digitando. Texto livre porque o contrato pode cobrar por qualquer
        // coisa — limitar a uma lista fechada obrigaria migration por produto.
        unidade: typeof unidade === 'string' && unidade.trim()
          ? unidade.trim().slice(0, 40) : 'transação',
        ordem: Number.isFinite(Number(ordem)) ? Number(ordem) : 0,
      },
    })

    await logAudit(
      session.userId, 'CRIOU_PRODUTO_CONDICAO', 'CondicaoProduto', produto.id,
      `${condicao.nomeFantasia}: ${rotulo} a ${valor}`,
    )

    return NextResponse.json({ produto }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return NextResponse.json(
        { error: `Este parceiro já tem um produto chamado "${rotulo}".` }, { status: 409 },
      )
    }
    throw e
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id, nome, preco, unidade, ativo, ordem } = await request.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Informe o produto.' }, { status: 400 })
  }

  const atual = await prisma.condicaoProduto.findUnique({
    where: { id },
    include: { condicao: { select: { nomeFantasia: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })

  const dados: Record<string, unknown> = {}
  if (typeof nome === 'string' && nome.trim()) dados.nome = nome.trim()
  if (preco !== undefined) {
    const valor = Number(preco)
    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json({ error: 'Preço inválido.' }, { status: 400 })
    }
    dados.preco = valor
  }
  if (typeof unidade === 'string' && unidade.trim()) dados.unidade = unidade.trim().slice(0, 40)
  if (typeof ativo === 'boolean') dados.ativo = ativo
  if (ordem !== undefined && Number.isFinite(Number(ordem))) dados.ordem = Number(ordem)

  const produto = await prisma.condicaoProduto.update({ where: { id }, data: dados })

  // O HISTÓRICO DA TARIFA é o snapshot nos lançamentos já feitos: reajustar o
  // preço aqui NÃO reescreve nenhum lançamento anterior.
  await logAudit(
    session.userId, 'EDITOU_PRODUTO_CONDICAO', 'CondicaoProduto', id,
    `${atual.condicao.nomeFantasia}: ${atual.nome} ${atual.preco} → ${produto.nome} ${produto.preco}`,
  )

  return NextResponse.json({ produto })
}

/**
 * Exclusão do produto.
 *
 * Os lançamentos já feitos NÃO são afetados: cada item guarda nome e preço
 * próprios (snapshot), e `produtoId` é apenas informativo. Por isso excluir é
 * seguro — o histórico não depende desta linha.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Informe o produto.' }, { status: 400 })

  const atual = await prisma.condicaoProduto.findUnique({
    where: { id },
    include: { condicao: { select: { nomeFantasia: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })

  await prisma.condicaoProduto.delete({ where: { id } })

  await logAudit(
    session.userId, 'EXCLUIU_PRODUTO_CONDICAO', 'CondicaoProduto', id,
    `${atual.condicao.nomeFantasia}: ${atual.nome}`,
  )

  return NextResponse.json({ success: true })
}
