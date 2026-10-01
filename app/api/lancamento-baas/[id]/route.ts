import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import {
  calcular, receitaBassPago, validarLancamento, type ProdutoTarifado,
} from '@/lib/lancamento-baas'
import { gerarTitulos, clientePelaConta } from '@/lib/baas-titulos'

function podeGerenciar(s: { permissoes?: string[]; role: string }): boolean {
  return hasPermission(s.permissoes ?? null, 'manage_receita', s.role)
}

async function carregar(id: string) {
  return prisma.lancamentoBaas.findUnique({
    where: { id },
    include: {
      condicao: {
        select: {
          id: true, nomeFantasia: true, identificacao: true, tipo: true,
          overpricePercent: true,
          produtos: {
            where: { ativo: true },
            select: { id: true, nome: true, preco: true, unidade: true },
            orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
          },
        },
      },
      itens: { orderBy: { ordem: 'asc' } },
      lancamento: { select: { id: true, descricao: true, valor: true } },
      contaReceber: {
        select: {
          id: true, descricao: true, valor: true, status: true,
          // Quem deve: cliente da carteira ou o próprio parceiro.
          cliente: { select: { id: true, nome: true } },
          condicao: { select: { id: true, nomeFantasia: true } },
        },
      },
      contaPagar: { select: { id: true, descricao: true, valor: true, status: true } },
      criadoPor: { select: { id: true, name: true } },
    },
  })
}

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_receita', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const l = await carregar(id)
  if (!l) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })
  return NextResponse.json({ lancamento: l })
}

/**
 * EDIÇÃO — recalcula e ATUALIZA os títulos vinculados, nunca cria um segundo
 * conjunto.
 *
 * FECHADO não se edita: há liquidação envolvida, e sobrescrever o valor de um
 * título já baixado apagaria o histórico do que foi efetivamente pago. A
 * recusa diz isso em vez de falhar em silêncio.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await carregar(id)
  if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  if (atual.status === 'FECHADO') {
    return NextResponse.json(
      {
        error: 'Este lançamento está fechado e não pode ser editado. '
          + 'Há títulos liquidados vinculados a ele, e sobrescrevê-los apagaria '
          + 'o histórico do que foi pago.',
      },
      { status: 409 },
    )
  }

  const body = await request.json()
  const entrada = { ...body, condicaoId: atual.condicaoId }

  const erros = validarLancamento(entrada)
  if (erros.length > 0) {
    return NextResponse.json({ error: erros[0].mensagem, erros }, { status: 400 })
  }

  const produtos: ProdutoTarifado[] = (body.produtos as ProdutoTarifado[]).map((p) => ({
    produtoId: p.produtoId ?? null,
    nome: String(p.nome).trim(),
    preco: Number(p.preco),
    volume: Math.trunc(Number(p.volume)),
  }))

  const calc = calcular(Number(body.saldoInicial), produtos, atual.condicao.overpricePercent)
  const inicio = new Date(`${body.periodoInicio}T00:00:00Z`)
  const fim = new Date(`${body.periodoFim}T00:00:00Z`)

  // Os itens são SUBSTITUÍDOS: o snapshot é do estado atual do lançamento, e
  // mesclar linha a linha deixaria produtos que saíram do cadastro pendurados.
  await prisma.$transaction([
    prisma.lancamentoBaasItem.deleteMany({ where: { lancamentoBaasId: id } }),
    prisma.lancamentoBaas.update({
      where: { id },
      data: {
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
        itens: {
          create: calc.itens.map((i, ordem) => ({
            produtoId: i.produtoId ?? null,
            nome: i.nome, preco: i.preco, volume: i.volume, total: i.total, ordem,
          })),
        },
      },
    }),
  ])

  // Já lançado? Os títulos acompanham a edição. Em rascunho, nada a atualizar.
  if (atual.status === 'LANCADO') {
    await gerarTitulos({
      lancamentoBaasId: id,
      condicaoId: atual.condicaoId,
      parceiroNome: atual.condicao.nomeFantasia,
      numeroConta: String(body.numeroConta).trim(),
      periodoInicio: inicio,
      periodoFim: fim,
      receita: receitaBassPago(calc),
      valorCliente: calc.valorCliente,
      criadoPorId: session.userId,
      clienteId: await clientePelaConta(String(body.numeroConta)),
    })
  }

  await logAudit(
    session.userId, 'EDITOU_LANCAMENTO_BAAS', 'LancamentoBaas', id,
    `${atual.condicao.nomeFantasia} · saldo ${calc.saldoInicial} · `
    + `tarifas ${calc.totalTarifas} · overprice ${calc.overpriceValor} · `
    + `cliente ${calc.valorCliente}`,
  )

  return NextResponse.json({ lancamento: await carregar(id) })
}

/**
 * LANÇAR — gera o lançamento financeiro, o título a receber e o a pagar.
 *
 * Idempotente: chamar duas vezes não cria um segundo conjunto, porque as três
 * FKs são UNIQUE e `gerarTitulos` atualiza quando já existem.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const l = await carregar(id)
  if (!l) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  const acao = new URL(request.url).searchParams.get('acao')

  if (acao === 'fechar') {
    if (l.status !== 'LANCADO') {
      return NextResponse.json(
        { error: 'Só um lançamento já lançado pode ser fechado.' }, { status: 409 },
      )
    }
    await prisma.lancamentoBaas.update({ where: { id }, data: { status: 'FECHADO' } })
    await logAudit(session.userId, 'FECHOU_LANCAMENTO_BAAS', 'LancamentoBaas', id,
      `${l.condicao.nomeFantasia} · ${l.numeroConta}`)
    return NextResponse.json({ lancamento: await carregar(id) })
  }

  if (l.status === 'FECHADO') {
    return NextResponse.json({ error: 'Lançamento fechado.' }, { status: 409 })
  }

  const calc = calcular(
    l.saldoInicial,
    l.itens.map((i) => ({ produtoId: i.produtoId, nome: i.nome, preco: i.preco, volume: i.volume })),
    l.overpricePercent,
  )

  try {
    const titulos = await gerarTitulos({
      lancamentoBaasId: id,
      condicaoId: l.condicaoId,
      parceiroNome: l.condicao.nomeFantasia,
      numeroConta: l.numeroConta,
      periodoInicio: l.periodoInicio,
      periodoFim: l.periodoFim,
      receita: receitaBassPago(calc),
      valorCliente: calc.valorCliente,
      criadoPorId: session.userId,
      clienteId: await clientePelaConta(l.numeroConta),
    })

    await logAudit(
      session.userId, 'LANCOU_BAAS', 'LancamentoBaas', id,
      `${l.condicao.nomeFantasia} · receita ${receitaBassPago(calc)} · `
      + `cliente ${calc.valorCliente} · lançamento ${titulos.lancamentoId} · `
      + `AR ${titulos.contaReceberId} · AP ${titulos.contaPagarId}`,
    )

    return NextResponse.json({ lancamento: await carregar(id), titulos })
  } catch (e) {
    // A ausência de categoria é um problema de configuração, não um 500: a
    // mensagem diz exatamente o que criar e onde.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Não foi possível gerar os títulos.' },
      { status: 409 },
    )
  }
}

/** Exclui apenas RASCUNHO. Lançado tem títulos; fechado tem liquidação. */
export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const l = await prisma.lancamentoBaas.findUnique({
    where: { id },
    select: { id: true, status: true, condicao: { select: { nomeFantasia: true } } },
  })
  if (!l) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  if (l.status !== 'RASCUNHO') {
    return NextResponse.json(
      {
        error: 'Este lançamento já gerou títulos financeiros. Excluí-lo deixaria '
          + 'o lançamento, o título a receber e o a pagar órfãos. '
          + 'Ajuste os valores editando-o, ou cancele os títulos em Lançamentos.',
      },
      { status: 409 },
    )
  }

  await prisma.lancamentoBaas.delete({ where: { id } })
  await logAudit(session.userId, 'EXCLUIU_LANCAMENTO_BAAS', 'LancamentoBaas', id,
    `Rascunho de ${l.condicao.nomeFantasia}`)

  return NextResponse.json({ success: true })
}
