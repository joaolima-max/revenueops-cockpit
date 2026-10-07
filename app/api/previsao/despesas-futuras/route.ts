import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  podeVerPrevisaoDoBanco, podeGerenciarPrevisaoDoBanco,
} from '@/lib/previsao-acesso'
import {
  STATUS_PREVISAO, RECORRENCIAS,
  type StatusPrevisao, type Recorrencia,
} from '@/lib/previsao'

/**
 * DESPESAS FUTURAS — a saída que ainda não foi lançada.
 *
 * ── NÃO É UM LANÇAMENTO PENDENTE ────────────────────────────────────────
 *
 * A distinção é a razão de esta tabela existir:
 *
 *   LANÇAMENTO PENDENTE    já aconteceu. Tem competência, entra na Despesa do
 *                          período e aparece em Contas a Pagar. Falta pagar.
 *
 *   DESPESA FUTURA         é EXPECTATIVA. Não toca o resultado contábil, não
 *                          aparece em Contas a Pagar, e serve à projeção de
 *                          caixa. Pode nem vir a acontecer.
 *
 * Confundir as duas faria a Despesa de outubro incluir a folha de novembro —
 * que ainda não foi incorrida.
 *
 * ── QUANDO A DESPESA ACONTECE ───────────────────────────────────────────
 *
 * Ela é lançada em Lançamentos, e esta linha é marcada REALIZADA com
 * `lancamentoId` apontando para o lançamento. Só então ela sai da projeção de
 * caixa: manter as duas somaria a mesma saída duas vezes (ver
 * `despesaPrevistaVsRealizada`).
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
  valor: number
  dataPrevista: Date
  recorrencia: Recorrencia
  recorrenciaFim: Date | null
  status: StatusPrevisao
  fornecedorId: string | null
  categoriaId: string | null
  centroCustoId: string | null
  responsavelId: string | null
  observacao: string | null
}

function dataValida(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function validar(body: Record<string, unknown>): Entrada | string {
  const descricao = String(body.descricao ?? '').trim()
  if (!descricao) return 'Informe a descrição da despesa.'
  if (descricao.length > 200) return 'A descrição deve ter no máximo 200 caracteres.'

  const valor = typeof body.valor === 'number' ? body.valor : Number(body.valor)
  if (!Number.isFinite(valor)) return 'Informe o valor da despesa.'
  // Zero não é uma despesa futura: é a ausência de uma.
  if (valor <= 0) return 'O valor da despesa deve ser maior que zero.'

  const dataPrevista = dataValida(body.dataPrevista)
  if (!dataPrevista) return 'Informe a data prevista no formato AAAA-MM-DD.'

  const recorrencia = String(body.recorrencia ?? 'UNICA') as Recorrencia
  if (!RECORRENCIAS.includes(recorrencia)) {
    return `Recorrência inválida. Use ${RECORRENCIAS.join(', ')}.`
  }

  const recorrenciaFim = body.recorrenciaFim ? dataValida(body.recorrenciaFim) : null
  if (body.recorrenciaFim && !recorrenciaFim) {
    return 'Informe o fim da recorrência no formato AAAA-MM-DD.'
  }
  if (recorrenciaFim && recorrenciaFim.getTime() < dataPrevista.getTime()) {
    return 'O fim da recorrência não pode ser antes da data prevista.'
  }
  /**
   * FIM DE RECORRÊNCIA SÓ FAZ SENTIDO EM RECORRENTE.
   *
   * Numa despesa ÚNICA ele não teria efeito, e aceitá-lo em silêncio deixaria
   * o cadastro com um campo preenchido que a projeção ignora — quem o
   * preencheu acharia que limitou algo.
   */
  if (recorrenciaFim && recorrencia !== 'RECORRENTE') {
    return 'O fim da recorrência só se aplica a despesas recorrentes.'
  }

  const status = String(body.status ?? 'PREVISTO') as StatusPrevisao
  if (!STATUS_PREVISAO.includes(status)) {
    return `Status inválido. Use ${STATUS_PREVISAO.join(', ')}.`
  }

  const texto = (v: unknown, max: number) => {
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : null
  }

  return {
    descricao,
    valor: Math.round(valor * 100) / 100,
    dataPrevista,
    recorrencia,
    recorrenciaFim,
    status,
    fornecedorId: texto(body.fornecedorId, 40),
    categoriaId: texto(body.categoriaId, 40),
    centroCustoId: texto(body.centroCustoId, 40),
    responsavelId: texto(body.responsavelId, 40),
    observacao: texto(body.observacao, 1000),
  }
}

const INCLUDE = {
  fornecedor: { select: { id: true, razaoSocial: true } },
  categoria: { select: { id: true, nome: true, tipo: true } },
  centroCusto: { select: { id: true, nome: true, codigo: true } },
  responsavel: { select: { id: true, name: true } },
  lancamento: { select: { id: true, descricao: true, data: true, valor: true } },
} as const

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeVerPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const centroCustoId = params.get('centroCustoId')?.trim() || undefined
  const statusBruto = params.get('status')?.trim()
  if (statusBruto && !STATUS_PREVISAO.includes(statusBruto as StatusPrevisao)) {
    return NextResponse.json(
      { error: `Status inválido. Use ${STATUS_PREVISAO.join(', ')}.` },
      { status: 400 },
    )
  }

  const despesas = await prisma.despesaFutura.findMany({
    where: {
      ...(centroCustoId ? { centroCustoId } : {}),
      ...(statusBruto ? { status: statusBruto as StatusPrevisao } : {}),
    },
    include: INCLUDE,
    orderBy: [{ dataPrevista: 'asc' }],
    take: 500,
  })

  return NextResponse.json({
    despesas,
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

  // A categoria de uma DESPESA tem de ser de despesa: classificá-la numa
  // categoria de receita faria o gasto aparecer como receita no orçado por
  // categoria.
  if (dados.categoriaId) {
    const cat = await prisma.categoriaFinanceira.findUnique({
      where: { id: dados.categoriaId },
      select: { tipo: true, nome: true },
    })
    if (!cat) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    if (cat.tipo !== 'DESPESA') {
      return NextResponse.json(
        { error: `A categoria ${cat.nome} é de receita. Escolha uma categoria de despesa.` },
        { status: 400 },
      )
    }
  }

  try {
    const despesa = await prisma.despesaFutura.create({
      data: { ...dados, criadoPorId: session.userId },
      include: INCLUDE,
    })

    await logAudit(
      session.userId, 'CRIOU_DESPESA_FUTURA', 'DespesaFutura', despesa.id,
      `${dados.descricao} · ${dados.valor} · `
      + `prevista ${dados.dataPrevista.toISOString().slice(0, 10)} · `
      + `${dados.recorrencia} · ${dados.status} · `
      + `${despesa.centroCusto?.nome ?? 'sem centro de custo'}`,
    )

    return NextResponse.json({ despesa }, { status: 201 })
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
