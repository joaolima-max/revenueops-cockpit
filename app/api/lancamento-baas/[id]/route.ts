import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import {
  calcular, receitaBaas, despesaBaas, resultadoBaas, validarLancamento,
  type ProdutoTarifado,
} from '@/lib/lancamento-baas'
import {
  gerarTitulos, clientePelaConta, liquidacaoDe, apagarTitulos,
} from '@/lib/baas-titulos'

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
 * O QUE IMPEDE A EDIÇÃO É A LIQUIDAÇÃO, não um status manual.
 *
 * Havia um "FECHADO" que alguém marcava à mão, e ele não protegia nada: um
 * lançamento com título já pago continuava editável enquanto ninguém o
 * fechasse, e um lançamento sem nenhum título liquidado ficava travado assim
 * que fosse fechado. O estado que importa é o dos títulos.
 *
 * Agora a recusa vem de `liquidacaoDe`: se o título a receber foi recebido ou
 * o a pagar foi pago, sobrescrever o valor apagaria o histórico do que foi
 * efetivamente movimentado.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await carregar(id)
  if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  const liq = await liquidacaoDe(id)
  if (liq.liquidado) {
    return NextResponse.json(
      {
        error: `Este lançamento não pode ser editado: ${liq.motivo}. `
          + 'Sobrescrever o valor apagaria o histórico do que foi movimentado.',
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
      // A RECEITA é o saldo INTEGRAL apurado; a DESPESA é a comissão do
      // parceiro. O AR cobra as TARIFAS — o resto do saldo já está na conta da
      // Bass Pago, e cobrá-lo seria emitir título de dinheiro já recebido.
      tarifas: calc.totalTarifas,
      receita: receitaBaas(calc),
      despesa: despesaBaas(calc),
      criadoPorId: session.userId,
      clienteId: await clientePelaConta(String(body.numeroConta)),
    })
  }

  await logAudit(
    session.userId, 'EDITOU_LANCAMENTO_BAAS', 'LancamentoBaas', id,
    `${atual.condicao.nomeFantasia} · saldo ${calc.saldoInicial} · `
    + `tarifas ${calc.totalTarifas} · overprice ${calc.overpriceValor} · `
    + `comissão ${despesaBaas(calc)} · receita ${receitaBaas(calc)} · `
    + `resultado ${resultadoBaas(calc)}`,
  )

  return NextResponse.json({ lancamento: await carregar(id) })
}

/**
 * LANÇAR — gera o lançamento financeiro, o título a receber e o a pagar.
 *
 * Idempotente: chamar duas vezes não cria um segundo conjunto, porque as três
 * FKs são UNIQUE e `gerarTitulos` atualiza quando já existem.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const l = await carregar(id)
  if (!l) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  // A ação "fechar" SAIU. Não havia fluxo de fechamento manual a defender: o
  // que protege o passado é a liquidação dos títulos, conferida onde importa.

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
      // A RECEITA é o saldo INTEGRAL apurado; a DESPESA é a comissão do
      // parceiro. O AR cobra as TARIFAS — o resto do saldo já está na conta da
      // Bass Pago, e cobrá-lo seria emitir título de dinheiro já recebido.
      tarifas: calc.totalTarifas,
      receita: receitaBaas(calc),
      despesa: despesaBaas(calc),
      criadoPorId: session.userId,
      clienteId: await clientePelaConta(l.numeroConta),
    })

    await logAudit(
      session.userId, 'LANCOU_BAAS', 'LancamentoBaas', id,
      `${l.condicao.nomeFantasia} · receita ${receitaBaas(calc)} · `
      + `comissão ${despesaBaas(calc)} · resultado ${resultadoBaas(calc)} · `
      + `lançamento ${titulos.lancamentoId} · `
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

/**
 * EXCLUIR O LANÇAMENTO BAAS — e os registros financeiros que ele gerou.
 *
 * Substituiu a ação "Fechar", que não protegia nada: era um status marcado à
 * mão, e o que de fato impede mexer no passado é a LIQUIDAÇÃO dos títulos.
 *
 * REGRA:
 *   nada liquidado  → apaga o lançamento, o título a receber e o a pagar;
 *   algo liquidado  → RECUSA, dizendo o quê.
 *
 * Não se apaga histórico financeiro movimentado. E não se deixa título órfão:
 * os três saem juntos, numa transação.
 */
export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const l = await prisma.lancamentoBaas.findUnique({
    where: { id },
    select: {
      id: true, status: true, numeroConta: true,
      periodoInicio: true, periodoFim: true,
      saldoInicial: true, totalTarifas: true, overpriceValor: true, valorCliente: true,
      condicao: { select: { nomeFantasia: true, tipo: true } },
    },
  })
  if (!l) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  // A LIQUIDAÇÃO é a única coisa que bloqueia.
  const liq = await liquidacaoDe(id)
  if (liq.liquidado) {
    return NextResponse.json(
      {
        error: `Não é possível excluir: ${liq.motivo}. `
          + 'Histórico financeiro movimentado não se apaga — cancele ou estorne o '
          + 'título em Lançamentos e em Contas a Receber antes, se for o caso.',
      },
      { status: 409 },
    )
  }

  const apagados = await apagarTitulos(id)

  /**
   * A AUDITORIA É GRAVADA ANTES DO DELETE.
   *
   * Depois do delete o registro não existe mais para ser consultado, e a
   * trilha precisa carregar os valores — não só o id de algo que sumiu.
   */
  const f = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  await logAudit(
    session.userId, 'EXCLUIU_LANCAMENTO_BAAS', 'LancamentoBaas', id,
    `${l.condicao.nomeFantasia} (${l.condicao.tipo}) · conta ${l.numeroConta} · `
    + `${f(l.periodoInicio)} a ${f(l.periodoFim)} · `
    + `saldo ${l.saldoInicial} · tarifas ${l.totalTarifas} · `
    + `overprice ${l.overpriceValor} · residual ${l.valorCliente} · `
    + `status ${l.status} · removidos: `
    + [
        apagados.lancamento && 'lançamento',
        apagados.contaReceber && 'título a receber',
        apagados.contaPagar && 'título a pagar',
      ].filter(Boolean).join(', ') || 'nenhum título vinculado',
  )

  await prisma.lancamentoBaas.delete({ where: { id } })

  return NextResponse.json({ success: true, removidos: apagados })
}
