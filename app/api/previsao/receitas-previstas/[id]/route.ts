import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { podeGerenciarPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { STATUS_PREVISAO, type StatusPrevisao } from '@/lib/previsao'

/**
 * A ALÇADA É CONFERIDA CONTRA O BANCO, não contra o token.
 *
 * `view_previsao` e `manage_previsao` nasceram nesta rodada, então o JWT de
 * quem já estava logado não as tem — e o proxy, por isso, não decide essas
 * chaves (ver `PERMISSOES_RECENTES`, em lib/permissions). A autoridade é aqui,
 * com a lista de agora.
 *
 * Isto faz a concessão valer na hora em vez de em sete dias, e a REVOGAÇÃO
 * também.
 */
export const dynamic = 'force-dynamic'

const INCLUDE = {
  categoria: { select: { id: true, nome: true, tipo: true } },
  condicao: { select: { id: true, nomeFantasia: true, tipo: true } },
  cliente: { select: { id: true, nome: true } },
  centroCusto: { select: { id: true, nome: true, codigo: true } },
} as const

/**
 * EDITAR a previsão de faturamento.
 *
 * Tudo é editável, inclusive o período: a previsão é uma expectativa, e
 * reconhecer que o faturamento esperado para novembro vai cair em dezembro é
 * o uso normal da tela — não a criação de outra previsão.
 *
 * A REGRA DO DEVEDOR ÚNICO continua valendo na edição, e é conferida contra o
 * estado FINAL: um PUT que só informa o cliente precisa esbarrar no parceiro
 * que já estava gravado, senão a linha acabaria com os dois e a receita
 * prevista seria contada por parceiro E por cliente.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.receitaPrevista.findUnique({ where: { id } })
  if (!atual) {
    return NextResponse.json({ error: 'Receita prevista não encontrada.' }, { status: 404 })
  }

  const body = await request.json()

  let periodo: string | undefined
  if (body.periodo !== undefined) {
    const p = String(body.periodo).trim()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
      return NextResponse.json({ error: 'Informe o período no formato AAAA-MM.' }, { status: 400 })
    }
    periodo = p
  }

  let valorPrevisto: number | undefined
  if (body.valorPrevisto !== undefined) {
    const v = typeof body.valorPrevisto === 'number'
      ? body.valorPrevisto
      : Number(body.valorPrevisto)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json(
        { error: 'O valor previsto deve ser maior que zero.' },
        { status: 400 },
      )
    }
    valorPrevisto = Math.round(v * 100) / 100
  }

  let status: StatusPrevisao | undefined
  if (body.status !== undefined) {
    const s = String(body.status) as StatusPrevisao
    if (!STATUS_PREVISAO.includes(s)) {
      return NextResponse.json(
        { error: `Status inválido. Use ${STATUS_PREVISAO.join(', ')}.` },
        { status: 400 },
      )
    }
    status = s
  }

  const texto = (v: unknown, max: number) => {
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : null
  }

  const condicaoId = body.condicaoId === undefined
    ? undefined
    : texto(body.condicaoId, 40)
  const clienteId = body.clienteId === undefined
    ? undefined
    : texto(body.clienteId, 40)

  // A regra do devedor único, contra o estado FINAL.
  const condicaoFinal = condicaoId !== undefined ? condicaoId : atual.condicaoId
  const clienteFinal = clienteId !== undefined ? clienteId : atual.clienteId
  if (condicaoFinal && clienteFinal) {
    return NextResponse.json(
      {
        error: 'Escolha o parceiro BaaS/White Label OU o cliente — não os dois: '
          + 'a mesma receita prevista não pertence a dois devedores.',
      },
      { status: 400 },
    )
  }

  if (body.categoriaId !== undefined && texto(body.categoriaId, 40)) {
    const cat = await prisma.categoriaFinanceira.findUnique({
      where: { id: texto(body.categoriaId, 40)! },
      select: { tipo: true, nome: true },
    })
    if (!cat) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    if (cat.tipo !== 'RECEITA') {
      return NextResponse.json(
        { error: `A categoria ${cat.nome} é de despesa. Escolha uma categoria de receita.` },
        { status: 400 },
      )
    }
  }

  try {
    const receita = await prisma.receitaPrevista.update({
      where: { id },
      data: {
        ...(body.descricao !== undefined
          ? { descricao: String(body.descricao).trim().slice(0, 200) } : {}),
        ...(periodo !== undefined ? { periodo } : {}),
        ...(valorPrevisto !== undefined ? { valorPrevisto } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(body.categoriaId !== undefined
          ? { categoriaId: texto(body.categoriaId, 40) } : {}),
        ...(condicaoId !== undefined ? { condicaoId } : {}),
        ...(clienteId !== undefined ? { clienteId } : {}),
        ...(body.centroCustoId !== undefined
          ? { centroCustoId: texto(body.centroCustoId, 40) } : {}),
        ...(body.observacao !== undefined
          ? { observacao: texto(body.observacao, 1000) } : {}),
      },
      include: INCLUDE,
    })

    await logAudit(
      session.userId, 'EDITOU_RECEITA_PREVISTA', 'ReceitaPrevista', id,
      `${receita.descricao} · período ${atual.periodo} → ${receita.periodo} · `
      + `valor ${atual.valorPrevisto} → ${receita.valorPrevisto} · `
      + `status ${atual.status} → ${receita.status}`,
    )

    return NextResponse.json({ receita })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2003') {
      return NextResponse.json(
        { error: 'Categoria, parceiro, cliente ou centro de custo não encontrado.' },
        { status: 400 },
      )
    }
    throw e
  }
}

/**
 * EXCLUSÃO.
 *
 * A receita prevista é folha na árvore: nada a referencia, e excluí-la não
 * deixa órfão nem apaga realizado — o realizado nunca morou aqui, ele é
 * apurado dos lançamentos.
 *
 * O que a exclusão apaga é a EXPECTATIVA, e a consequência é visível: o
 * previsto do período diminui, e o desvio muda. Para tirá-la da leitura
 * preservando o registro de que a previsão existiu, use o status CANCELADO.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.receitaPrevista.findUnique({ where: { id } })
  if (!atual) {
    return NextResponse.json({ error: 'Receita prevista não encontrada.' }, { status: 404 })
  }

  await prisma.receitaPrevista.delete({ where: { id } })
  await logAudit(
    session.userId, 'EXCLUIU_RECEITA_PREVISTA', 'ReceitaPrevista', id,
    `${atual.descricao} · ${atual.periodo} · ${atual.valorPrevisto}`,
  )

  return NextResponse.json({ ok: true })
}
