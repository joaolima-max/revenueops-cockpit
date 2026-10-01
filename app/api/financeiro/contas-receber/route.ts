import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
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

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await request.json()
  const { clienteId, descricao, tipo, valor, dataVenc, parcela, totalParcel, notas } = body

  if (!clienteId || !descricao || !valor || !dataVenc) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const conta = await prisma.contaReceber.create({
    data: {
      clienteId, descricao, tipo: tipo || 'OUTRO', valor: parseFloat(valor),
      dataVenc: new Date(dataVenc),
      parcela: parcela ? parseInt(parcela) : null,
      totalParcel: totalParcel ? parseInt(totalParcel) : null,
      notas: notas || null,
    },
    include: { cliente: { select: { id: true, nome: true, modeloOperacional: true } } },
  })

  return NextResponse.json({ conta }, { status: 201 })
}
