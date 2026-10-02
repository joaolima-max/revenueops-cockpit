import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  contasAReceber, type SituacaoReceber, type StatusContaReceber,
} from '@/lib/financeiro'
import { periodoAtual } from '@/lib/periodo'

const SITUACOES: SituacaoReceber[] = ['PAGA', 'VENCIDA', 'A_VENCER']
const STATUS: StatusContaReceber[] = ['PENDENTE', 'FATURADO', 'PAGO', 'INADIMPLENTE']

/**
 * GET — os títulos do período, com a mesma forma que Contas a Pagar devolve:
 * `{ titulos, resumo }`. As duas telas leem a mesma gramática (total, vencidas,
 * a vencer, pagas) sobre bases diferentes.
 *
 * `periodo=todos` dispensa a janela de mês.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  // `mes` continua aceito: era o nome anterior do parâmetro.
  const periodo = sp.get('periodo') || sp.get('mes') || periodoAtual()
  if (periodo !== 'todos' && !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const situacaoParam = sp.get('situacao') ?? ''
  const statusParam = sp.get('status') ?? ''

  const { titulos, resumo } = await contasAReceber({
    periodo: periodo === 'todos' ? undefined : periodo,
    situacao: SITUACOES.includes(situacaoParam as SituacaoReceber)
      ? (situacaoParam as SituacaoReceber) : undefined,
    status: STATUS.includes(statusParam as StatusContaReceber)
      ? (statusParam as StatusContaReceber) : undefined,
    clienteId: sp.get('clienteId') || undefined,
    descricao: sp.get('descricao') || undefined,
  })

  return NextResponse.json({ periodo, titulos, resumo })
}

/**
 * POST — RECUSADO. Contas a Receber não cria títulos.
 *
 * ── POR QUE A ROTA FICA, RECUSANDO ──────────────────────────────────────
 *
 * Um recebível é o espelho de uma receita: ele nasce de um LANÇAMENTO (ao
 * registrar uma receita com cliente) ou de um LANÇAMENTO BAAS (as tarifas do
 * período). Criado direto aqui, o título não tinha lançamento de origem — e
 * passava a existir em Contas a Receber um valor a cobrar que não aparecia em
 * Receitas nem no Resultado. As duas telas discordavam, e nenhuma das duas
 * estava errada isoladamente.
 *
 * A tela nunca ofereceu o botão; o que existia era este endpoint, alcançável
 * por qualquer um com `manage_financeiro`. Apagá-lo em silêncio devolveria
 * 405 sem dizer o que fazer — então ele responde 405 EXPLICANDO onde o título
 * se cria. É a diferença entre "não existe" e "não é por aqui".
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Contas a Receber não cria títulos. '
        + 'Um recebível nasce de um lançamento de receita (Financeiro › '
        + 'Lançamentos, informando o cliente) ou de um Lançamento BaaS, que '
        + 'gera o título das tarifas do período. '
        + 'Criar o título aqui deixaria Contas a Receber com um valor que não '
        + 'aparece em Receitas nem no Resultado.',
    },
    { status: 405 },
  )
}
