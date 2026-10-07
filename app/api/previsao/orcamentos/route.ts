import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  podeVerPrevisaoDoBanco, podeGerenciarPrevisaoDoBanco,
} from '@/lib/previsao-acesso'
import { STATUS_ORCAMENTO, type StatusOrcamentoValor } from '@/lib/previsao'

/**
 * ORÇAMENTO — o teto previsto de um período, por centro de custo e categoria.
 *
 * ── O GRÃO, E POR QUE ELE É ÚNICO ───────────────────────────────────────
 *
 * (período, tipo, centro de custo, categoria) é UNIQUE no banco. Duas linhas
 * para o mesmo recorte seriam dois tetos para o mesmo gasto, e o "% utilizado"
 * passaria a depender de qual das duas a tela somou primeiro.
 *
 * Centro de custo e categoria são OPCIONAIS: existe orçamento de área inteira
 * (sem detalhar categoria) e orçamento de categoria sem área. O UNIQUE em
 * Postgres não cobre colunas nulas — NULL nunca é igual a NULL —, então a
 * migration v28 acrescenta três índices PARCIAIS que fecham esse buraco.
 *
 * ── O REALIZADO NÃO MORA AQUI ───────────────────────────────────────────
 *
 * Esta tabela guarda só o valor ORÇADO. O realizado é apurado dos lançamentos
 * (ver `lib/previsao.ts`): um campo de realizado preenchido à mão criaria uma
 * segunda versão do gasto, que divergiria da primeira no primeiro ajuste.
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
  periodo: string
  tipo: 'RECEITA' | 'DESPESA'
  valor: number
  centroCustoId: string | null
  categoriaId: string | null
  observacao: string | null
  responsavelId: string | null
  status: StatusOrcamentoValor
}

/**
 * Valida a entrada ANTES de qualquer gravação.
 *
 * No servidor, não só na tela: o formulário pode marcar os campos, mas quem
 * garante é quem grava — e um valor negativo gravado produziria um orçamento
 * que o realizado "estoura" assim que o primeiro centavo for lançado.
 */
function validar(body: Record<string, unknown>): Entrada | string {
  const periodo = String(body.periodo ?? '').trim()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return 'Informe o período no formato AAAA-MM.'
  }

  const tipo = body.tipo
  if (tipo !== 'RECEITA' && tipo !== 'DESPESA') {
    return 'Escolha se o orçamento é de receita ou de despesa.'
  }

  const valor = typeof body.valor === 'number' ? body.valor : Number(body.valor)
  if (!Number.isFinite(valor)) return 'Informe o valor orçado.'
  // ZERO É VÁLIDO e significa "esta área não gasta nada neste período" — uma
  // afirmação legítima, e diferente de não ter orçamento. Negativo não é.
  if (valor < 0) return 'O valor orçado não pode ser negativo.'

  const status = String(body.status ?? 'RASCUNHO') as StatusOrcamentoValor
  if (!STATUS_ORCAMENTO.includes(status)) {
    return `Status inválido. Use ${STATUS_ORCAMENTO.join(', ')}.`
  }

  const texto = (v: unknown, max: number) => {
    const s = String(v ?? '').trim()
    return s ? s.slice(0, max) : null
  }

  return {
    periodo,
    tipo,
    valor: Math.round(valor * 100) / 100,
    centroCustoId: texto(body.centroCustoId, 40),
    categoriaId: texto(body.categoriaId, 40),
    observacao: texto(body.observacao, 1000),
    responsavelId: texto(body.responsavelId, 40),
    status,
  }
}

const INCLUDE = {
  centroCusto: { select: { id: true, nome: true, codigo: true } },
  categoria: { select: { id: true, nome: true, tipo: true } },
  responsavel: { select: { id: true, name: true } },
  criadoPor: { select: { id: true, name: true } },
} as const

/**
 * GET — os orçamentos de uma janela.
 *
 * RASCUNHO VEM NA LISTA, ao contrário do que acontece nos indicadores: esta é
 * a tela de cadastro, e esconder o rascunho tornaria impossível aprová-lo. É
 * `orcamentoVsRealizado` que o exclui das somas.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeVerPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const periodo = params.get('periodo')
  if (periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use AAAA-MM.' }, { status: 400 })
  }

  const centroCustoId = params.get('centroCustoId')?.trim() || undefined
  const tipoBruto = params.get('tipo')
  const tipo = tipoBruto === 'RECEITA' || tipoBruto === 'DESPESA' ? tipoBruto : undefined

  const orcamentos = await prisma.orcamento.findMany({
    where: {
      ...(periodo ? { periodo } : {}),
      ...(centroCustoId ? { centroCustoId } : {}),
      ...(tipo ? { tipo } : {}),
    },
    include: INCLUDE,
    orderBy: [{ periodo: 'desc' }, { tipo: 'asc' }, { valor: 'desc' }],
    take: 500,
  })

  return NextResponse.json({
    orcamentos,
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

  /**
   * A CATEGORIA TEM DE SER DO MESMO TIPO DO ORÇAMENTO.
   *
   * Orçar uma categoria de DESPESA como receita produziria uma linha cujo
   * realizado nunca chega — o lançamento daquela categoria é sempre despesa, e
   * o orçamento de receita ficaria eternamente em 0% utilizado, sem que
   * ninguém entendesse por quê.
   */
  if (dados.categoriaId) {
    const cat = await prisma.categoriaFinanceira.findUnique({
      where: { id: dados.categoriaId },
      select: { tipo: true, nome: true },
    })
    if (!cat) {
      return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    }
    if (cat.tipo !== dados.tipo) {
      return NextResponse.json(
        {
          error: `A categoria ${cat.nome} é de ${cat.tipo.toLowerCase()}. `
            + 'Escolha uma categoria do mesmo tipo do orçamento.',
        },
        { status: 400 },
      )
    }
  }

  try {
    const orcamento = await prisma.orcamento.create({
      data: { ...dados, criadoPorId: session.userId },
      include: INCLUDE,
    })

    await logAudit(
      session.userId, 'CRIOU_ORCAMENTO', 'Orcamento', orcamento.id,
      `${dados.periodo} · ${dados.tipo} · ${dados.valor} · `
      + `${orcamento.centroCusto?.nome ?? 'sem centro de custo'} · `
      + `${orcamento.categoria?.nome ?? 'sem categoria'} · ${dados.status}`,
    )

    return NextResponse.json({ orcamento }, { status: 201 })
  } catch (e) {
    // O UNIQUE é o que impede dois tetos para o mesmo recorte. A recusa
    // explica e diz o que fazer, em vez de estourar 500.
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'Já existe orçamento deste tipo para este período, centro de custo '
            + 'e categoria. Abra o existente e edite o valor, em vez de criar outro.',
        },
        { status: 409 },
      )
    }
    // FK inválida (centro de custo, categoria ou responsável inexistente).
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2003') {
      return NextResponse.json(
        { error: 'Centro de custo, categoria ou responsável não encontrado.' },
        { status: 400 },
      )
    }
    throw e
  }
}
