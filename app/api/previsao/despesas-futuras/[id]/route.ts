import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { podeGerenciarPrevisaoDoBanco } from '@/lib/previsao-acesso'
import {
  STATUS_PREVISAO, RECORRENCIAS,
  type StatusPrevisao, type Recorrencia,
} from '@/lib/previsao'

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
  fornecedor: { select: { id: true, razaoSocial: true } },
  categoria: { select: { id: true, nome: true, tipo: true } },
  centroCusto: { select: { id: true, nome: true, codigo: true } },
  responsavel: { select: { id: true, name: true } },
  lancamento: { select: { id: true, descricao: true, data: true, valor: true } },
} as const

function dataValida(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * EDITAR a despesa futura.
 *
 * Tudo é editável aqui — descrição, valor, data, recorrência, classificação,
 * responsável e status. Diferente do orçamento, a despesa futura não tem
 * "recorte" que a identifique: ela é uma expectativa, e ajustar a expectativa é
 * o uso normal da tela. Mudar o valor de 500 mil para 520 mil continua sendo a
 * mesma folha de pagamento.
 *
 * ── A DESPESA JÁ MATERIALIZADA É OUTRA COISA ────────────────────────────
 *
 * Quando `lancamentoId` está preenchido, a despesa aconteceu: existe um
 * lançamento financeiro com o valor real. Editar o VALOR da previsão nesse
 * ponto criaria um desvio fictício entre previsto e realizado, porque o
 * "previsto" passaria a ser escrito depois do fato.
 *
 * Então o valor fica travado, e a recusa diz onde mexer: no lançamento.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.despesaFutura.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Despesa futura não encontrada.' }, { status: 404 })

  const body = await request.json()

  let valor: number | undefined
  if (body.valor !== undefined) {
    if (atual.lancamentoId) {
      return NextResponse.json(
        {
          error: 'Esta despesa já foi lançada, e o valor previsto não muda depois do '
            + 'fato — isso criaria um desvio fictício. Ajuste o valor no lançamento, '
            + 'em Financeiro › Lançamentos.',
        },
        { status: 409 },
      )
    }
    const v = typeof body.valor === 'number' ? body.valor : Number(body.valor)
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json(
        { error: 'O valor da despesa deve ser maior que zero.' },
        { status: 400 },
      )
    }
    valor = Math.round(v * 100) / 100
  }

  let dataPrevista: Date | undefined
  if (body.dataPrevista !== undefined) {
    const d = dataValida(body.dataPrevista)
    if (!d) {
      return NextResponse.json(
        { error: 'Informe a data prevista no formato AAAA-MM-DD.' },
        { status: 400 },
      )
    }
    dataPrevista = d
  }

  let recorrencia: Recorrencia | undefined
  if (body.recorrencia !== undefined) {
    const r = String(body.recorrencia) as Recorrencia
    if (!RECORRENCIAS.includes(r)) {
      return NextResponse.json(
        { error: `Recorrência inválida. Use ${RECORRENCIAS.join(', ')}.` },
        { status: 400 },
      )
    }
    recorrencia = r
  }

  let recorrenciaFim: Date | null | undefined
  if (body.recorrenciaFim !== undefined) {
    if (body.recorrenciaFim === null || body.recorrenciaFim === '') {
      recorrenciaFim = null
    } else {
      const d = dataValida(body.recorrenciaFim)
      if (!d) {
        return NextResponse.json(
          { error: 'Informe o fim da recorrência no formato AAAA-MM-DD.' },
          { status: 400 },
        )
      }
      recorrenciaFim = d
    }
  }

  // A coerência é verificada contra o estado FINAL, não contra o enviado: um
  // PUT que só muda a recorrência para UNICA precisa esbarrar no fim de
  // recorrência que já estava gravado.
  const recorrenciaFinal = recorrencia ?? atual.recorrencia
  const fimFinal = recorrenciaFim !== undefined ? recorrenciaFim : atual.recorrenciaFim
  const dataFinal = dataPrevista ?? atual.dataPrevista

  if (fimFinal && recorrenciaFinal !== 'RECORRENTE') {
    return NextResponse.json(
      {
        error: 'O fim da recorrência só se aplica a despesas recorrentes. '
          + 'Limpe o campo ou mantenha a recorrência.',
      },
      { status: 400 },
    )
  }
  if (fimFinal && fimFinal.getTime() < dataFinal.getTime()) {
    return NextResponse.json(
      { error: 'O fim da recorrência não pode ser antes da data prevista.' },
      { status: 400 },
    )
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

  try {
    const despesa = await prisma.despesaFutura.update({
      where: { id },
      data: {
        ...(body.descricao !== undefined
          ? { descricao: String(body.descricao).trim().slice(0, 200) }
          : {}),
        ...(valor !== undefined ? { valor } : {}),
        ...(dataPrevista !== undefined ? { dataPrevista } : {}),
        ...(recorrencia !== undefined ? { recorrencia } : {}),
        ...(recorrenciaFim !== undefined ? { recorrenciaFim } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(body.fornecedorId !== undefined
          ? { fornecedorId: texto(body.fornecedorId, 40) } : {}),
        ...(body.categoriaId !== undefined
          ? { categoriaId: texto(body.categoriaId, 40) } : {}),
        ...(body.centroCustoId !== undefined
          ? { centroCustoId: texto(body.centroCustoId, 40) } : {}),
        ...(body.responsavelId !== undefined
          ? { responsavelId: texto(body.responsavelId, 40) } : {}),
        ...(body.observacao !== undefined
          ? { observacao: texto(body.observacao, 1000) } : {}),
      },
      include: INCLUDE,
    })

    await logAudit(
      session.userId, 'EDITOU_DESPESA_FUTURA', 'DespesaFutura', id,
      `${despesa.descricao} · valor ${atual.valor} → ${despesa.valor} · `
      + `status ${atual.status} → ${despesa.status}`,
    )

    return NextResponse.json({ despesa })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2003') {
      return NextResponse.json(
        { error: 'Fornecedor, categoria, centro de custo ou responsável não encontrado.' },
        { status: 400 },
      )
    }
    throw e
  }
}

/**
 * EXCLUSÃO SEGURA.
 *
 * ── A DESPESA JÁ LANÇADA NÃO SE EXCLUI AQUI ─────────────────────────────
 *
 * Com `lancamentoId` preenchido, esta linha é o VÍNCULO entre a previsão e o
 * fato. Apagá-la perderia a rastreabilidade — ninguém mais saberia que aquele
 * lançamento de 500 mil era a folha que estava prevista —, e o lançamento
 * continuaria existindo, o que faz da exclusão um gesto sem efeito sobre o
 * caixa e com efeito sobre o histórico. A troca é ruim nos dois lados.
 *
 * Para tirá-la da leitura, use o status CANCELADO: ele sai da projeção
 * (`despesaPrevistaVsRealizada` filtra `status: { not: 'CANCELADO' }`) e
 * preserva o registro.
 *
 * Uma despesa ainda NÃO materializada é folha na árvore: nada a referencia, e
 * excluí-la não deixa órfão. Essa se apaga.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const atual = await prisma.despesaFutura.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Despesa futura não encontrada.' }, { status: 404 })

  if (atual.lancamentoId) {
    return NextResponse.json(
      {
        error: 'Esta despesa já foi lançada e esta linha é o vínculo entre a previsão '
          + 'e o lançamento. Excluí-la perderia a rastreabilidade sem alterar o caixa. '
          + 'Para tirá-la da projeção, mude o status para Cancelado.',
      },
      { status: 409 },
    )
  }

  await prisma.despesaFutura.delete({ where: { id } })
  await logAudit(
    session.userId, 'EXCLUIU_DESPESA_FUTURA', 'DespesaFutura', id,
    `${atual.descricao} · ${atual.valor} · `
    + `prevista ${atual.dataPrevista.toISOString().slice(0, 10)}`,
  )

  return NextResponse.json({ ok: true })
}
