import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import {
  calcular, receitaBassPago, validarLancamento,
  type ProdutoTarifado,
} from '@/lib/lancamento-baas'

/**
 * LANÇAMENTO BAAS — o volume mensal de um parceiro, tarifado.
 *
 * As TARIFAS NÃO SÃO REDIGITADAS: vêm de `CondicaoProduto`, o cadastro em
 * Condições BaaS. O colaborador informa o saldo e os volumes; preço, conta e
 * overprice o sistema carrega.
 *
 * O preço é COPIADO para o item (snapshot). Apontar para o produto e ler o
 * preço de lá faria um reajuste reescrever o histórico: o lançamento de
 * setembro passaria a valer a tarifa de outubro.
 */
export const dynamic = 'force-dynamic'

function podeVer(s: { permissoes?: string[]; role: string }): boolean {
  return hasPermission(s.permissoes ?? null, 'view_receita', s.role)
}
function podeGerenciar(s: { permissoes?: string[]; role: string }): boolean {
  return hasPermission(s.permissoes ?? null, 'manage_receita', s.role)
}

/** O que a lista mostra, e o que o formulário precisa para nascer preenchido. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeVer(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const condicaoId = request.nextUrl.searchParams.get('condicaoId')

  const [lancamentos, parceiros] = await Promise.all([
    prisma.lancamentoBaas.findMany({
      where: condicaoId ? { condicaoId } : {},
      include: {
        condicao: { select: { id: true, nomeFantasia: true, identificacao: true, tipo: true } },
        itens: { orderBy: { ordem: 'asc' } },
        criadoPor: { select: { id: true, name: true } },
      },
      orderBy: [{ periodoInicio: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    // Só parceiros ATIVOS podem receber lançamento novo, com os produtos
    // vigentes já carregados — é o que elimina a redigitação de tarifa.
    prisma.condicaoComercial.findMany({
      where: { ativo: true },
      select: {
        id: true, nomeFantasia: true, identificacao: true, tipo: true,
        overpricePercent: true,
        produtos: {
          where: { ativo: true },
          select: { id: true, nome: true, preco: true, unidade: true },
          orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        },
      },
      orderBy: { nomeFantasia: 'asc' },
    }),
  ])

  return NextResponse.json({
    lancamentos,
    parceiros,
    podeGerenciar: podeGerenciar(session),
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const body = await request.json()

  const erros = validarLancamento(body)
  if (erros.length > 0) {
    return NextResponse.json({ error: erros[0].mensagem, erros }, { status: 400 })
  }

  const condicao = await prisma.condicaoComercial.findUnique({
    where: { id: String(body.condicaoId) },
    select: {
      id: true, nomeFantasia: true, identificacao: true, tipo: true,
      ativo: true, overpricePercent: true,
    },
  })
  if (!condicao) {
    return NextResponse.json({ error: 'Parceiro não encontrado.' }, { status: 404 })
  }
  if (!condicao.ativo) {
    return NextResponse.json(
      { error: 'Este parceiro está inativo. Reative-o em Condições BaaS antes de lançar.' },
      { status: 409 },
    )
  }

  const produtos: ProdutoTarifado[] = (body.produtos as ProdutoTarifado[]).map((p) => ({
    produtoId: p.produtoId ?? null,
    nome: String(p.nome).trim(),
    preco: Number(p.preco),
    volume: Math.trunc(Number(p.volume)),
  }))

  // O OVERPRICE VEM DO CADASTRO, não do corpo da requisição: é condição
  // comercial do parceiro, e aceitá-lo de fora deixaria o percentual ser
  // escolhido lançamento a lançamento.
  const calc = calcular(Number(body.saldoInicial), produtos, condicao.overpricePercent)

  const inicio = new Date(`${body.periodoInicio}T00:00:00Z`)
  const fim = new Date(`${body.periodoFim}T00:00:00Z`)

  try {
    const criado = await prisma.lancamentoBaas.create({
      data: {
        condicaoId: condicao.id,
        numeroConta: String(body.numeroConta).trim(),
        periodoInicio: inicio,
        periodoFim: fim,
        saldoInicial: calc.saldoInicial,
        totalTarifas: calc.totalTarifas,
        saldoRemanescente: calc.saldoRemanescente,
        overpricePercent: calc.overpricePercent,
        overpriceValor: calc.overpriceValor,
        valorCliente: calc.valorCliente,
        observacao: typeof body.observacao === 'string' ? body.observacao.slice(0, 1000) : null,
        criadoPorId: session.userId,
        itens: {
          create: calc.itens.map((i, ordem) => ({
            produtoId: i.produtoId ?? null,
            nome: i.nome,
            preco: i.preco,
            volume: i.volume,
            total: i.total,
            ordem,
          })),
        },
      },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    })

    await logAudit(
      session.userId, 'CRIOU_LANCAMENTO_BAAS', 'LancamentoBaas', criado.id,
      `${condicao.nomeFantasia} · conta ${criado.numeroConta} · `
      + `${body.periodoInicio} a ${body.periodoFim} · `
      + `saldo ${calc.saldoInicial} · tarifas ${calc.totalTarifas} · `
      + `overprice ${calc.overpriceValor} · cliente ${calc.valorCliente}`,
    )

    return NextResponse.json({ lancamento: criado, receitaBassPago: receitaBassPago(calc) }, { status: 201 })
  } catch (e) {
    // O UNIQUE (condicaoId, periodoInicio, periodoFim) é o que impede tarifar
    // o mesmo volume duas vezes. A recusa explica, em vez de estourar 500.
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return NextResponse.json(
        {
          error: 'Já existe lançamento deste parceiro para este período. '
            + 'Abra o lançamento existente e edite-o, em vez de criar outro.',
        },
        { status: 409 },
      )
    }
    throw e
  }
}
