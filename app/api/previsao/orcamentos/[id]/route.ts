import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { podeGerenciarPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { STATUS_ORCAMENTO, type StatusOrcamentoValor } from '@/lib/previsao'

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
  centroCusto: { select: { id: true, nome: true, codigo: true } },
  categoria: { select: { id: true, nome: true, tipo: true } },
  responsavel: { select: { id: true, name: true } },
  criadoPor: { select: { id: true, name: true } },
} as const

/**
 * EDITAR o orçamento.
 *
 * ── O RECORTE É IMUTÁVEL ────────────────────────────────────────────────
 *
 * Período, tipo, centro de custo e categoria NÃO são editáveis. Mudá-los não
 * é editar este orçamento: é mover o teto de um recorte para outro, e o
 * resultado seria um orçamento de Comercial virando orçamento de Tecnologia,
 * com o histórico de aprovação do primeiro. Para isso, exclui-se e cria-se — e
 * a auditoria registra as duas coisas.
 *
 * Editável: VALOR, observação, responsável e status. É o que se ajusta num
 * orçamento sem que ele deixe de ser o mesmo orçamento.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.orcamento.findUnique({ where: { id }, include: INCLUDE })
  if (!atual) return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })

  const body = await request.json()

  let valor: number | undefined
  if (body.valor !== undefined) {
    const v = typeof body.valor === 'number' ? body.valor : Number(body.valor)
    if (!Number.isFinite(v)) {
      return NextResponse.json({ error: 'Informe o valor orçado.' }, { status: 400 })
    }
    if (v < 0) {
      return NextResponse.json({ error: 'O valor orçado não pode ser negativo.' }, { status: 400 })
    }
    valor = Math.round(v * 100) / 100
  }

  let status: StatusOrcamentoValor | undefined
  if (body.status !== undefined) {
    const s = String(body.status) as StatusOrcamentoValor
    if (!STATUS_ORCAMENTO.includes(s)) {
      return NextResponse.json(
        { error: `Status inválido. Use ${STATUS_ORCAMENTO.join(', ')}.` },
        { status: 400 },
      )
    }
    status = s
  }

  const observacao = body.observacao === undefined
    ? undefined
    : (String(body.observacao).trim().slice(0, 1000) || null)

  const responsavelId = body.responsavelId === undefined
    ? undefined
    : (String(body.responsavelId).trim() || null)

  try {
    const orcamento = await prisma.orcamento.update({
      where: { id },
      data: {
        ...(valor !== undefined ? { valor } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(observacao !== undefined ? { observacao } : {}),
        ...(responsavelId !== undefined ? { responsavelId } : {}),
      },
      include: INCLUDE,
    })

    await logAudit(
      session.userId, 'EDITOU_ORCAMENTO', 'Orcamento', id,
      `${atual.periodo} · ${atual.tipo} · `
      + `valor ${atual.valor} → ${orcamento.valor} · `
      + `status ${atual.status} → ${orcamento.status}`,
    )

    return NextResponse.json({ orcamento })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2003') {
      return NextResponse.json({ error: 'Responsável não encontrado.' }, { status: 400 })
    }
    throw e
  }
}

/**
 * EXCLUSÃO SEGURA.
 *
 * ── O QUE "SEGURA" SIGNIFICA AQUI ───────────────────────────────────────
 *
 * Diferente de centro de custo e categoria, o orçamento NÃO é referenciado por
 * nada: ele é folha na árvore. Excluir não deixa órfão nem apaga atribuição de
 * lançamento — o realizado continua intacto, porque ele nunca morou aqui.
 *
 * O que a exclusão apaga é o TETO, e a consequência é visível: o recorte passa
 * a aparecer como "sem orçamento" em vez de "estourado" ou "72% utilizado".
 *
 * ── ORÇAMENTO ENCERRADO NÃO SE APAGA ────────────────────────────────────
 *
 * ENCERRADO é o estado de um período já fechado e conferido. Apagar o teto de
 * um período encerrado reescreveria a leitura histórica: o mês que fechou com
 * 95% de utilização passaria a não ter orçamento nenhum, e o relatório do
 * trimestre mudaria de valor depois de ter sido lido.
 *
 * Para tirá-lo da leitura sem apagar o histórico, volte o status para
 * RASCUNHO — rascunho não entra nos indicadores (ver `orcamentoVsRealizado`).
 * A recusa diz exatamente isso.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.orcamento.findUnique({
    where: { id },
    include: { centroCusto: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })

  if (atual.status === 'ENCERRADO') {
    return NextResponse.json(
      {
        error: 'Este orçamento está ENCERRADO e não pode ser excluído — apagá-lo '
          + 'mudaria a leitura de um período já fechado. Para tirá-lo dos '
          + 'indicadores, mude o status para Rascunho.',
      },
      { status: 409 },
    )
  }

  await prisma.orcamento.delete({ where: { id } })
  await logAudit(
    session.userId, 'EXCLUIU_ORCAMENTO', 'Orcamento', id,
    `${atual.periodo} · ${atual.tipo} · ${atual.valor} · `
    + `${atual.centroCusto?.nome ?? 'sem centro de custo'}`,
  )

  return NextResponse.json({ ok: true })
}
