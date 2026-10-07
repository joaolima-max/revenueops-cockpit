import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  podeVerPrevisaoDoBanco, podeGerenciarPrevisaoDoBanco,
} from '@/lib/previsao-acesso'
import { STATUS_PREVISAO, type StatusPrevisao } from '@/lib/previsao'

/**
 * RECEITAS PREVISTAS — a previsão de faturamento de um período.
 *
 * ── NÃO HÁ CAMPO DE "VALOR REALIZADO" ───────────────────────────────────
 *
 * E a ausência é a decisão mais importante desta tabela.
 *
 * O realizado é APURADO dos lançamentos de receita do período, pelo mesmo
 * caminho que a Visão Geral Financeira usa. Um campo preenchido à mão criaria
 * uma segunda versão do faturamento, e ela divergiria da primeira no primeiro
 * ajuste de lançamento — duas telas do mesmo sistema respondendo números
 * diferentes para "quanto faturamos em outubro".
 *
 * ── O GRÃO É O MÊS ──────────────────────────────────────────────────────
 *
 * `periodo` é "YYYY-MM", não uma data. Receita se prevê por mês: ninguém orça
 * faturamento para o dia 12. Despesa futura é o contrário — ela TEM data
 * prevista, porque a projeção de caixa precisa saber o dia em que o dinheiro
 * sai.
 *
 * ── VÁRIAS LINHAS POR PERÍODO SÃO VÁLIDAS ───────────────────────────────
 *
 * Diferente do orçamento, não há UNIQUE aqui: a previsão de novembro pode ser
 * composta de uma linha por parceiro, por cliente ou por produto, e todas
 * somam. É uma previsão aberta, não um teto — e um teto é o que exige grão
 * único.
 */
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

interface Entrada {
  descricao: string
  periodo: string
  valorPrevisto: number
  status: StatusPrevisao
  categoriaId: string | null
  condicaoId: string | null
  clienteId: string | null
  centroCustoId: string | null
  observacao: string | null
}

function validar(body: Record<string, unknown>): Entrada | string {
  const descricao = String(body.descricao ?? '').trim()
  if (!descricao) return 'Informe a descrição da previsão.'
  if (descricao.length > 200) return 'A descrição deve ter no máximo 200 caracteres.'

  const periodo = String(body.periodo ?? '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return 'Informe o período no formato AAAA-MM.'
  }

  const valor = typeof body.valorPrevisto === 'number'
    ? body.valorPrevisto
    : Number(body.valorPrevisto)
  if (!Number.isFinite(valor)) return 'Informe o valor previsto.'
  if (valor <= 0) return 'O valor previsto deve ser maior que zero.'

  const status = String(body.status ?? 'PREVISTO') as StatusPrevisao
  if (!STATUS_PREVISAO.includes(status)) {
    return `Status inválido. Use ${STATUS_PREVISAO.join(', ')}.`
  }

  const texto = (v: unknown, max: number) => {
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : null
  }

  const condicaoId = texto(body.condicaoId, 40)
  const clienteId = texto(body.clienteId, 40)
  /**
   * PARCEIRO **OU** CLIENTE, nunca os dois.
   *
   * A mesma regra que `ContaReceber` tem no banco, e pela mesma razão: os dois
   * juntos seriam duas atribuições para a mesma receita, e a previsão por
   * parceiro somaria o mesmo valor que a previsão por cliente.
   */
  if (condicaoId && clienteId) {
    return 'Escolha o parceiro BaaS/White Label OU o cliente — não os dois: '
      + 'a mesma receita prevista não pertence a dois devedores.'
  }

  return {
    descricao,
    periodo,
    valorPrevisto: Math.round(valor * 100) / 100,
    status,
    categoriaId: texto(body.categoriaId, 40),
    condicaoId,
    clienteId,
    centroCustoId: texto(body.centroCustoId, 40),
    observacao: texto(body.observacao, 1000),
  }
}

const INCLUDE = {
  categoria: { select: { id: true, nome: true, tipo: true } },
  condicao: { select: { id: true, nomeFantasia: true, tipo: true } },
  cliente: { select: { id: true, nome: true } },
  centroCusto: { select: { id: true, nome: true, codigo: true } },
} as const

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeVerPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const periodo = params.get('periodo')?.trim()
  if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use AAAA-MM.' }, { status: 400 })
  }

  const statusBruto = params.get('status')?.trim()
  if (statusBruto && !STATUS_PREVISAO.includes(statusBruto as StatusPrevisao)) {
    return NextResponse.json(
      { error: `Status inválido. Use ${STATUS_PREVISAO.join(', ')}.` },
      { status: 400 },
    )
  }

  const receitas = await prisma.receitaPrevista.findMany({
    where: {
      ...(periodo ? { periodo } : {}),
      ...(statusBruto ? { status: statusBruto as StatusPrevisao } : {}),
      ...(params.get('condicaoId')?.trim()
        ? { condicaoId: params.get('condicaoId')!.trim() } : {}),
      ...(params.get('centroCustoId')?.trim()
        ? { centroCustoId: params.get('centroCustoId')!.trim() } : {}),
    },
    include: INCLUDE,
    orderBy: [{ periodo: 'desc' }, { valorPrevisto: 'desc' }],
    take: 500,
  })

  return NextResponse.json({
    receitas,
    podeGerenciar: await podeGerenciarPrevisaoDoBanco(session),
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const dados = validar(await request.json())
  if (typeof dados === 'string') return NextResponse.json({ error: dados }, { status: 400 })

  // Categoria de RECEITA, necessariamente: classificar a previsão de
  // faturamento numa categoria de despesa faria a receita prevista aparecer no
  // orçado de despesa.
  if (dados.categoriaId) {
    const cat = await prisma.categoriaFinanceira.findUnique({
      where: { id: dados.categoriaId },
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
    const receita = await prisma.receitaPrevista.create({
      data: { ...dados, criadoPorId: session.userId },
      include: INCLUDE,
    })

    await logAudit(
      session.userId, 'CRIOU_RECEITA_PREVISTA', 'ReceitaPrevista', receita.id,
      `${dados.descricao} · ${dados.periodo} · ${dados.valorPrevisto} · ${dados.status} · `
      + `${receita.condicao?.nomeFantasia ?? receita.cliente?.nome ?? 'sem vínculo'}`,
    )

    return NextResponse.json({ receita }, { status: 201 })
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
