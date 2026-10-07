import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { podeGerenciarCentrosCustoDoBanco } from '@/lib/previsao-acesso'

export const dynamic = 'force-dynamic'

/** Editar o cadastro, ou ativar/inativar. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarCentrosCustoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.centroCusto.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Centro de custo não encontrado.' }, { status: 404 })

  const body = await request.json()

  const nome = body.nome === undefined ? undefined : String(body.nome).trim()
  if (nome !== undefined && !nome) {
    return NextResponse.json({ error: 'Informe o nome do centro de custo.' }, { status: 400 })
  }
  if (nome !== undefined && nome.length > 80) {
    return NextResponse.json({ error: 'O nome deve ter no máximo 80 caracteres.' }, { status: 400 })
  }
  if (nome && nome !== atual.nome) {
    const conflito = await prisma.centroCusto.findFirst({ where: { nome } })
    if (conflito) {
      return NextResponse.json(
        { error: `Já existe um centro de custo chamado ${nome}.` },
        { status: 409 },
      )
    }
  }

  const codigo = body.codigo === undefined
    ? undefined
    : (String(body.codigo).trim().toUpperCase() || null)
  if (codigo && codigo.length > 12) {
    return NextResponse.json({ error: 'O código deve ter no máximo 12 caracteres.' }, { status: 400 })
  }

  const descricao = body.descricao === undefined
    ? undefined
    : (String(body.descricao).trim().slice(0, 500) || null)

  const centro = await prisma.centroCusto.update({
    where: { id },
    data: {
      ...(nome ? { nome } : {}),
      ...(codigo !== undefined ? { codigo } : {}),
      ...(descricao !== undefined ? { descricao } : {}),
      ...(typeof body.ativo === 'boolean' ? { ativo: body.ativo } : {}),
    },
  })

  await logAudit(
    session.userId, 'EDITOU_CENTRO_CUSTO', 'CentroCusto', id,
    `${centro.nome}${centro.ativo ? '' : ' · inativado'}`,
  )
  return NextResponse.json({ centro })
}

/**
 * EXCLUSÃO SEGURA — só o centro de custo que nada referencia.
 *
 * ── POR QUE NÃO SE APAGA UM CENTRO EM USO ───────────────────────────────
 *
 * Quatro tabelas o referenciam: lançamentos financeiros, orçamentos, despesas
 * futuras e receitas previstas. As três últimas usam `onDelete: Restrict`, e a
 * primeira `SetNull`.
 *
 * Apagar um centro com histórico apagaria a atribuição de área de lançamentos
 * já feitos (o `SetNull` silenciosamente) e esbarraria na FK das outras três.
 * O resultado seria um Orçado × Realizado que muda de valor retroativamente —
 * o passado não pode ser reescrito por um clique de cadastro.
 *
 * Então: com qualquer vínculo, a resposta é INATIVE em vez de excluir. A
 * inativação tira o centro dos formulários e preserva tudo o que já foi
 * classificado nele — que é o comportamento que esta tela de fato quer na
 * quase totalidade dos casos.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarCentrosCustoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.centroCusto.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Centro de custo não encontrado.' }, { status: 404 })

  const [lancamentos, orcamentos, despesas, receitas] = await Promise.all([
    prisma.lancamentoFinanceiro.count({ where: { centroCustoId: id } }),
    prisma.orcamento.count({ where: { centroCustoId: id } }),
    prisma.despesaFutura.count({ where: { centroCustoId: id } }),
    prisma.receitaPrevista.count({ where: { centroCustoId: id } }),
  ])

  const vinculos = [
    { n: lancamentos, nome: 'lançamento' },
    { n: orcamentos, nome: 'orçamento' },
    { n: despesas, nome: 'despesa futura' },
    { n: receitas, nome: 'receita prevista' },
  ].filter((v) => v.n > 0)

  if (vinculos.length > 0) {
    // A mensagem DIZ o que impede e o que fazer. "Não foi possível excluir"
    // manda a pessoa adivinhar qual dos quatro vínculos é o problema.
    const lista = vinculos
      .map((v) => `${v.n} ${v.nome}${v.n === 1 ? '' : 's'}`)
      .join(', ')
    return NextResponse.json(
      {
        error: `${atual.nome} tem ${lista} vinculados. Inative-o em vez de excluir — `
          + 'assim ele sai dos formulários e o que já foi classificado continua atribuído.',
      },
      { status: 409 },
    )
  }

  await prisma.centroCusto.delete({ where: { id } })
  await logAudit(session.userId, 'EXCLUIU_CENTRO_CUSTO', 'CentroCusto', id, atual.nome)
  return NextResponse.json({ ok: true })
}
