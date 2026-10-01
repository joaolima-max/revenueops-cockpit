/**
 * TÍTULOS GERADOS POR UM LANÇAMENTO BAAS.
 *
 * Um lançamento produz TRÊS registros, e no máximo um de cada:
 *
 *   1. LANÇAMENTO FINANCEIRO de RECEITA — o que a Bass Pago cobrou
 *      (tarifas + overprice);
 *   2. CONTA A RECEBER — o título dessa receita;
 *   3. LANÇAMENTO FINANCEIRO de DESPESA — o valor residual devido ao cliente,
 *      que é o que alimenta Contas a Pagar.
 *
 * IDEMPOTÊNCIA PELO BANCO. As três FKs em `LancamentoBaas` são UNIQUE, e a
 * geração roda dentro de uma transação que só grava os ids ao fim. Chamar
 * duas vezes não cria um segundo conjunto: a segunda chamada encontra os ids
 * preenchidos e ATUALIZA. É o índice que garante, não a ordem das chamadas.
 *
 * CONTAS A PAGAR LÊ `LancamentoFinanceiro` de despesa pela data de
 * vencimento, e não uma tabela própria — por isso o repasse ao cliente é um
 * lançamento de despesa, não um registro novo. Criar uma segunda base de
 * contas a pagar faria as duas discordarem.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { centavos } from '@/lib/lancamento-baas'

/** Categorias que o lançamento automático usa. Semeadas pela migration v22. */
export const CATEGORIA_RECEITA_BAAS = 'Tarifas BaaS'
export const CATEGORIA_DESPESA_BAAS = 'Repasse a Cliente BaaS'

export interface DadosGeracao {
  lancamentoBaasId: string
  condicaoId: string
  parceiroNome: string
  numeroConta: string
  periodoInicio: Date
  periodoFim: Date
  /** Tarifas + overprice. A receita da Bass Pago. */
  receita: number
  /** Saldo remanescente − overprice. O que é devido ao cliente. */
  valorCliente: number
  criadoPorId: string
  /** Cliente do título a receber, quando o número de conta casa com um. */
  clienteId: string | null
}

/**
 * A categoria, pelo nome e tipo. Lança erro com instrução quando falta.
 *
 * Criar a categoria aqui seria pior: ela apareceria na tela de Categorias sem
 * ninguém ter pedido, e com o nome que este código escolheu.
 */
async function categoria(
  tx: Prisma.TransactionClient, nome: string, tipo: 'RECEITA' | 'DESPESA',
): Promise<string> {
  const c = await tx.categoriaFinanceira.findFirst({
    where: { nome, tipo },
    select: { id: true },
  })
  if (!c) {
    throw new Error(
      `A categoria "${nome}" (${tipo.toLowerCase()}) não existe. `
      + 'Crie-a em Financeiro › Categorias para o Lançamento BaaS poder classificar.',
    )
  }
  return c.id
}

function descricao(d: DadosGeracao, oque: string): string {
  const f = (x: Date) => x.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  return `${oque} · ${d.parceiroNome} · conta ${d.numeroConta} · `
    + `${f(d.periodoInicio)} a ${f(d.periodoFim)}`
}

export interface TitulosGerados {
  lancamentoId: string
  contaReceberId: string | null
  contaPagarId: string
}

/**
 * Gera — ou ATUALIZA — os três registros do lançamento.
 *
 * O vencimento é o FIM DO PERÍODO: é quando o ciclo fecha e os dois lados
 * passam a ser devidos. Inventar "30 dias depois" seria um prazo que nenhum
 * contrato do sistema conhece.
 *
 * O título a receber só nasce quando o número de conta casa com um cliente
 * cadastrado: `ContaReceber.clienteId` é obrigatório, e inventar um cliente
 * para satisfazer a FK criaria um registro fantasma. Sem cliente, a receita
 * fica no lançamento financeiro — que é onde ela conta — e a tela diz por que
 * não houve título.
 */
export async function gerarTitulos(d: DadosGeracao): Promise<TitulosGerados> {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.lancamentoBaas.findUnique({
      where: { id: d.lancamentoBaasId },
      select: { lancamentoId: true, contaReceberId: true, contaPagarId: true },
    })
    if (!atual) throw new Error('Lançamento BaaS não encontrado.')

    const [catReceita, catDespesa] = await Promise.all([
      categoria(tx, CATEGORIA_RECEITA_BAAS, 'RECEITA'),
      categoria(tx, CATEGORIA_DESPESA_BAAS, 'DESPESA'),
    ])

    const vencimento = d.periodoFim
    const receita = centavos(d.receita)
    const cliente = centavos(d.valorCliente)

    /* ── 1. RECEITA da Bass Pago ───────────────────────────────────────── */
    const dadosReceita = {
      tipo: 'RECEITA' as const,
      descricao: descricao(d, 'Tarifas e overprice'),
      categoriaId: catReceita,
      valor: receita,
      data: vencimento,
      dataVencimento: vencimento,
      // O vínculo com o parceiro é o que faz este lançamento aparecer em
      // "Receita por BaaS/White Label".
      condicaoId: d.condicaoId,
      criadoPorId: d.criadoPorId,
    }
    const lancamento = atual.lancamentoId
      ? await tx.lancamentoFinanceiro.update({
          where: { id: atual.lancamentoId }, data: dadosReceita,
        })
      : await tx.lancamentoFinanceiro.create({ data: dadosReceita })

    /* ── 2. CONTA A RECEBER ────────────────────────────────────────────── */
    let contaReceberId: string | null = atual.contaReceberId
    if (d.clienteId) {
      const dadosAR = {
        clienteId: d.clienteId,
        descricao: descricao(d, 'Tarifas e overprice'),
        tipo: CATEGORIA_RECEITA_BAAS,
        valor: receita,
        dataVenc: vencimento,
      }
      const ar = contaReceberId
        ? await tx.contaReceber.update({ where: { id: contaReceberId }, data: dadosAR })
        : await tx.contaReceber.create({ data: dadosAR })
      contaReceberId = ar.id
    }

    /* ── 3. DESPESA — o residual devido ao cliente ─────────────────────── */
    // Status PENDENTE: o título nasce em aberto, para ser complementado e
    // baixado em Contas a Pagar.
    const dadosAP = {
      tipo: 'DESPESA' as const,
      descricao: descricao(d, 'Repasse ao cliente'),
      categoriaId: catDespesa,
      valor: cliente,
      data: vencimento,
      dataVencimento: vencimento,
      status: 'PENDENTE' as const,
      condicaoId: d.condicaoId,
      criadoPorId: d.criadoPorId,
    }
    const contaPagar = atual.contaPagarId
      ? await tx.lancamentoFinanceiro.update({
          where: { id: atual.contaPagarId }, data: dadosAP,
        })
      : await tx.lancamentoFinanceiro.create({ data: dadosAP })

    await tx.lancamentoBaas.update({
      where: { id: d.lancamentoBaasId },
      data: {
        status: 'LANCADO',
        lancamentoId: lancamento.id,
        contaReceberId,
        contaPagarId: contaPagar.id,
      },
    })

    return { lancamentoId: lancamento.id, contaReceberId, contaPagarId: contaPagar.id }
  })
}

/**
 * O cliente cujo número de conta casa com o do lançamento.
 *
 * É o único vínculo honesto disponível: o lançamento é de uma conta, e é o
 * campo `numeroConta` do cliente que diz de quem ela é. Sem correspondência,
 * devolve null — e nenhum cliente é inventado para ocupar a FK.
 */
export async function clientePelaConta(numeroConta: string): Promise<string | null> {
  const c = await prisma.cliente.findFirst({
    where: { numeroConta: numeroConta.trim() },
    select: { id: true },
  })
  return c?.id ?? null
}
