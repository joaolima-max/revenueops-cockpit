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

/** Inclui categoria, fornecedor, parceiro e anexos — o que a tela lista. */
const INCLUDE_LANCAMENTO = {
  categoria: { select: { id: true, nome: true, tipo: true, natureza: true } },
  criadoPor: { select: { id: true, name: true } },
  fornecedor: { select: { id: true, razaoSocial: true } },
  condicao: { select: { id: true, nomeFantasia: true, tipo: true } },
  anexos: {
    include: { documento: { select: { id: true, nome: true, mime: true, tamanho: true } } },
  },
} as const

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
      include: INCLUDE_LANCAMENTO,
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
  const {
    tipo, descricao, categoriaId, valor, data, status, observacao, periodicidade,
    dataVencimento, fornecedorId, condicaoId,
    clienteId, gerarRecebivel,
  } = body

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

  // RECORRÊNCIA: indefinida (sem data final) ou com prazo. A data final NUNCA é
  // obrigatória — "recorrente" sem prazo é o caso comum de aluguel, salário e
  // mensalidade, e exigir uma data faria o usuário inventar uma.
  let recorrenciaFim: Date | null = null
  if (per === 'RECORRENTE' && body.recorrenciaFim) {
    recorrenciaFim = parseData(String(body.recorrenciaFim))
    if (!recorrenciaFim) {
      return NextResponse.json({ error: 'Data final da recorrência inválida. Use YYYY-MM-DD.' }, { status: 400 })
    }
    if (recorrenciaFim < dt) {
      return NextResponse.json({ error: 'A data final da recorrência não pode ser anterior à data do lançamento.' }, { status: 400 })
    }
  }
  const indefinido = per === 'RECORRENTE' && !recorrenciaFim

  // DESPESA tem duas datas: lançamento (competência) e vencimento. Sem
  // vencimento informado, vale a data de lançamento — é a única informação
  // verdadeira disponível, e Contas a Pagar precisa de uma data para ordenar.
  let vencimento: Date | null = null
  if (tipo === 'DESPESA') {
    vencimento = dataVencimento ? parseData(String(dataVencimento)) : dt
    if (!vencimento) {
      return NextResponse.json({ error: 'Data de vencimento inválida. Use YYYY-MM-DD.' }, { status: 400 })
    }
    if (vencimento < dt) {
      return NextResponse.json({
        error: 'O vencimento não pode ser anterior à data de lançamento.',
      }, { status: 400 })
    }
  }

  // Fornecedor é da DESPESA; parceiro BaaS/White Label é da RECEITA. Os dois
  // são opcionais — um lançamento sem vínculo continua válido.
  let fornecedor: string | null = null
  if (tipo === 'DESPESA' && fornecedorId) {
    const existe = await prisma.fornecedor.count({ where: { id: String(fornecedorId) } })
    if (!existe) return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 })
    fornecedor = String(fornecedorId)
  }

  let condicao: string | null = null
  if (tipo === 'RECEITA' && condicaoId) {
    const existe = await prisma.condicaoComercial.count({ where: { id: String(condicaoId) } })
    if (!existe) return NextResponse.json({ error: 'BaaS / White Label não encontrado.' }, { status: 404 })
    condicao = String(condicaoId)
  }

  /**
   * RECEBÍVEL. Contas a Receber nao cadastra: o titulo nasce aqui, ao lancar
   * uma receita com cliente. Uma origem por informacao — duas portas de
   * criacao para o mesmo recebivel produziriam dois cadastros do mesmo
   * dinheiro, cada um com a sua versao da verdade.
   *
   * NAO E DUPLA CONTAGEM: Receita soma LANCAMENTOS (competencia), e
   * ContaReceber responde pelo estado de COBRANCA — e so por ele (ver
   * `inadimplenciaDoPeriodo`). Sao dois fatos sobre o mesmo dinheiro, nao duas
   * somas dele.
   */
  let cliente: { id: string; nome: string } | null = null
  if (tipo === 'RECEITA' && clienteId) {
    cliente = await prisma.cliente.findUnique({
      where: { id: String(clienteId) }, select: { id: true, nome: true },
    })
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }
  const criaRecebivel = gerarRecebivel === true && !!cliente

  const linhas = expandirLancamento(per, dt, n, { totalParcelas, recorrenciaFim })
  const grupoId = linhas.length > 1 ? randomUUID() : null

  // O vencimento acompanha cada linha: a 3ª parcela vence três meses depois da
  // 1ª. O deslocamento é o mesmo que a data de lançamento sofreu, para que a
  // distância entre lançar e vencer seja preservada em todas as linhas.
  const deslocamento = (l: { data: Date }) =>
    vencimento
      ? new Date(vencimento.getTime() + (l.data.getTime() - dt.getTime()))
      : null

  await prisma.lancamentoFinanceiro.createMany({
    data: linhas.map((l) => ({
      tipo: tipo as Tipo,
      descricao: desc,
      categoriaId: categoria.id,
      valor: l.valor,
      data: l.data,
      dataVencimento: deslocamento(l),
      status: st,
      observacao: observacao ? String(observacao).slice(0, 1000) : null,
      periodicidade: per,
      grupoId,
      parcela: l.parcela,
      totalParcelas: l.totalParcelas,
      recorrenteIndefinido: indefinido,
      recorrenciaFim,
      fornecedorId: fornecedor,
      condicaoId: condicao,
      criadoPorId: session.userId,
    })),
  })

  // Um titulo por linha gerada: a 3a parcela vira o 3o recebivel, com o
  // vencimento da propria parcela.
  if (criaRecebivel) {
    await prisma.contaReceber.createMany({
      data: linhas.map((l) => ({
        clienteId: cliente!.id,
        descricao: desc,
        tipo: categoria.nome,
        valor: l.valor,
        dataVenc: l.data,
        parcela: l.parcela,
        totalParcel: l.totalParcelas,
        notas: observacao ? String(observacao).slice(0, 1000) : null,
      })),
    })
  }

  // Devolve a primeira linha para a tela poder anexar arquivos já em seguida.
  const primeiro = await prisma.lancamentoFinanceiro.findFirst({
    where: grupoId ? { grupoId } : { criadoPorId: session.userId, descricao: desc, data: dt },
    orderBy: { data: 'asc' },
    include: INCLUDE_LANCAMENTO,
  })

  await logAudit(
    session.userId, 'CRIOU_LANCAMENTO_FINANCEIRO', 'LancamentoFinanceiro', primeiro?.id,
    `${tipo === 'RECEITA' ? 'Receita' : 'Despesa'} · ${desc} · ${linhas.length} linha${linhas.length === 1 ? '' : 's'}`
      + (criaRecebivel ? ` · ${linhas.length} título(s) a receber para ${cliente!.nome}` : ''),
  )

  return NextResponse.json({
    lancamento: primeiro,
    linhas: linhas.length,
    recebiveis: criaRecebivel ? linhas.length : 0,
  }, { status: 201 })
}
