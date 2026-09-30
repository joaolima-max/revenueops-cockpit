import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { contasAPagar, type SituacaoPagar } from '@/lib/financeiro'
import { periodoAtual } from '@/lib/periodo'

const SITUACOES: SituacaoPagar[] = ['PAGA', 'VENCIDA', 'A_VENCER', 'CANCELADA']

/**
 * CONTAS A PAGAR — os lançamentos de DESPESA vistos pela data de VENCIMENTO.
 *
 * Não existe uma segunda base de despesas: esta rota lê `LancamentoFinanceiro`,
 * exatamente a mesma tabela da tela de Lançamentos. O que muda é a data de
 * referência (vencimento, não lançamento) e o recorte por situação — e é por
 * isso que uma despesa corrigida em Lançamentos aparece corrigida aqui no
 * mesmo instante.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_financeiro', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const periodo = sp.get('periodo') || periodoAtual()
  if (periodo !== 'todos' && !/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const situacaoParam = sp.get('situacao') ?? ''
  const situacao = SITUACOES.includes(situacaoParam as SituacaoPagar)
    ? (situacaoParam as SituacaoPagar)
    : undefined

  const { titulos, resumo } = await contasAPagar({
    periodo: periodo === 'todos' ? undefined : periodo,
    situacao,
    categoriaId: sp.get('categoriaId') || undefined,
    fornecedorId: sp.get('fornecedorId') || undefined,
    descricao: sp.get('descricao') || undefined,
  })

  return NextResponse.json({ periodo, titulos, resumo })
}
