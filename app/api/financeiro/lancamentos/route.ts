import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { expandirLancamento, resultadoDoPeriodo } from '@/lib/financeiro'
import { periodoAtual } from '@/lib/periodo'

const TIPOS = ['RECEITA', 'DESPESA'] as const
const PERIODICIDADES = ['UNICA', 'RECORRENTE', 'PARCELADA'] as const
const STATUS = ['PENDENTE', 'PAGO', 'CANCELADO'] as const

type Tipo = (typeof TIPOS)[number]
type Periodicidade = (typeof PERIODICIDADES)[number]
type Status = (typeof STATUS)[number]

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

/** "YYYY-MM-DD" para meia-noite UTC — o grão da coluna `data`. */
function parseData(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * GET /api/financeiro/lancamentos
 *
 * Filtros (§15): descrição, categoria, data e valor. Todos combináveis, todos
 * opcionais. `periodo` define os três KPIs do topo da tela.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const periodo = sp.get('periodo') || periodoAtual()
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const descricao = sp.get('descricao') ?? ''
  const categoriaId = sp.get('categoriaId') ?? ''
  const tipoParam = sp.get('tipo') ?? ''
  const tipo = TIPOS.includes(tipoParam as Tipo) ? (tipoParam as Tipo) : undefined
  const de = parseData(sp.get('de') ?? '')
  const ate = parseData(sp.get('ate') ?? '')
  const valorMin = sp.get('valorMin') ? Number(sp.get('valorMin')) : null
  const valorMax = sp.get('valorMax') ? Number(sp.get('valorMax')) : null

  const where = {
    ...(descricao ? { descricao: { contains: descricao, mode: 'insensitive' as const } } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(tipo ? { tipo } : {}),
    ...(de || ate
      ? {
          data: {
            ...(de ? { gte: de } : {}),
            // `ate` é inclusivo para quem preenche o filtro; a coluna é DATE.
            ...(ate ? { lte: ate } : {}),
          },
        }
      : {}),
    ...(valorMin !== null && Number.isFinite(valorMin) ? { valor: { gte: valorMin } } : {}),
    ...(valorMax !== null && Number.isFinite(valorMax)
      ? { valor: { ...(valorMin !== null && Number.isFinite(valorMin) ? { gte: valorMin } : {}), lte: valorMax } }
      : {}),
  }

  const [lancamentos, resultado] = await Promise.all([
    prisma.lancamentoFinanceiro.findMany({
      where,
      include: {
        categoria: { select: { id: true, nome: true, tipo: true } },
        criadoPor: { select: { id: true, name: true } },
        anexos: {
          include: { documento: { select: { id: true, nome: true, mime: true, tamanho: true } } },
        },
      },
      orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }),
    resultadoDoPeriodo(periodo),
  ])

  return NextResponse.json({ periodo, lancamentos, resultado })
}

/**
 * POST /api/financeiro/lancamentos
 *
 * Receita e despesa usam exatamente os mesmos campos; o que muda é `tipo`.
 * Parcelada e recorrente são MATERIALIZADAS aqui (ver expandirLancamento):
 * o cadastro vira N linhas reais amarradas por `grupoId`.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const body = await request.json()
  const { tipo, descricao, categoriaId, valor, data, status, observacao, periodicidade } = body

  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Escolha se o lançamento é receita ou despesa.' }, { status: 400 })
  }
  const desc = String(descricao ?? '').trim()
  if (!desc) return NextResponse.json({ error: 'Informe a descrição.' }, { status: 400 })

  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: 'O valor deve ser maior que zero.' }, { status: 400 })
  }

  const dt = parseData(String(data ?? ''))
  if (!dt) return NextResponse.json({ error: 'Data inválida. Use YYYY-MM-DD.' }, { status: 400 })

  const categoria = await prisma.categoriaFinanceira.findUnique({ where: { id: String(categoriaId ?? '') } })
  if (!categoria) return NextResponse.json({ error: 'Selecione uma categoria.' }, { status: 404 })
  if (categoria.tipo !== tipo) {
    return NextResponse.json({
      error: `A categoria ${categoria.nome} é de ${categoria.tipo === 'RECEITA' ? 'receita' : 'despesa'}.`,
    }, { status: 400 })
  }

  const per: Periodicidade = PERIODICIDADES.includes(periodicidade) ? periodicidade : 'UNICA'
  const st: Status = STATUS.includes(status) ? status : 'PENDENTE'

  const totalParcelas = per === 'PARCELADA' ? Math.round(Number(body.totalParcelas ?? 0)) : null
  if (per === 'PARCELADA' && (!Number.isFinite(totalParcelas!) || totalParcelas! < 2)) {
    return NextResponse.json({ error: 'Um lançamento parcelado precisa de pelo menos 2 parcelas.' }, { status: 400 })
  }
  const meses = per === 'RECORRENTE' ? Math.round(Number(body.meses ?? 12)) : null
  if (per === 'RECORRENTE' && (!Number.isFinite(meses!) || meses! < 1 || meses! > 60)) {
    return NextResponse.json({ error: 'A recorrência deve ter entre 1 e 60 meses.' }, { status: 400 })
  }

  const linhas = expandirLancamento(per, dt, n, { totalParcelas, meses })
  const grupoId = linhas.length > 1 ? randomUUID() : null

  await prisma.lancamentoFinanceiro.createMany({
    data: linhas.map((l) => ({
      tipo: tipo as Tipo,
      descricao: desc,
      categoriaId: categoria.id,
      valor: l.valor,
      data: l.data,
      status: st,
      observacao: observacao ? String(observacao).slice(0, 1000) : null,
      periodicidade: per,
      grupoId,
      parcela: l.parcela,
      totalParcelas: l.totalParcelas,
      criadoPorId: session.userId,
    })),
  })

  // Devolve a primeira linha para a tela poder anexar arquivos já em seguida.
  const primeiro = await prisma.lancamentoFinanceiro.findFirst({
    where: grupoId ? { grupoId } : { criadoPorId: session.userId, descricao: desc, data: dt },
    orderBy: { data: 'asc' },
    include: { categoria: { select: { id: true, nome: true, tipo: true } } },
  })

  await logAudit(
    session.userId, 'CRIOU_LANCAMENTO_FINANCEIRO', 'LancamentoFinanceiro', primeiro?.id,
    `${tipo === 'RECEITA' ? 'Receita' : 'Despesa'} · ${desc} · ${linhas.length} linha${linhas.length === 1 ? '' : 's'}`,
  )

  return NextResponse.json({ lancamento: primeiro, linhas: linhas.length }, { status: 201 })
}
