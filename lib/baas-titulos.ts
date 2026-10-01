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

/**
 * Quem DEVE o título a receber.
 *
 * Cliente da carteira quando a conta do lançamento casa com um; o PARCEIRO em
 * qualquer outro caso — que é o normal, porque a receita das tarifas é devida
 * pelo BaaS/White Label.
 *
 * EXATAMENTE UM dos dois. O banco exige o mesmo, por CHECK: nenhum seria
 * título sem devedor, e os dois juntos seriam duas cobranças para o mesmo
 * valor. A função existe para que o código nunca tente o contrário — e para
 * que a regra seja testável sem banco.
 */
export function devedorDoTitulo(
  clienteId: string | null, condicaoId: string,
): { clienteId: string | null; condicaoId: string | null } {
  return clienteId
    ? { clienteId, condicaoId: null }
    : { clienteId: null, condicaoId }
}

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
  /**
   * Cliente da carteira cujo `numeroConta` casa com a conta do lançamento.
   *
   * OPCIONAL e quase sempre nulo: a receita das tarifas é devida pelo
   * PARCEIRO, não por um cliente da carteira. Quando há correspondência, o
   * título sai no nome do cliente — é o caso em que a conta é de um cliente
   * cadastrado, e aí é dele que se cobra.
   */
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

/**
 * A descrição dos registros gerados.
 *
 * COMPACTA de propósito. A versão longa trazia o intervalo inteiro
 * ("01/09/2026 a 30/09/2026") e, somada ao nome do parceiro e à conta,
 * esticava a coluna de descrição em Lançamentos e em Contas a Receber.
 *
 * O período vira a competência (`09/2026`), que é como se fala de um
 * fechamento mensal — e a data exata continua no `dataVencimento` do próprio
 * título e no Lançamento BaaS de origem, que é o registro completo.
 */
function descricao(d: DadosGeracao, oque: string): string {
  const competencia = d.periodoFim.toLocaleDateString('pt-BR', {
    month: '2-digit', year: 'numeric', timeZone: 'UTC',
  })
  return `${oque} · ${d.parceiroNome} · ${d.numeroConta} · ${competencia}`
}

export interface TitulosGerados {
  lancamentoId: string
  /** Sempre presente: o título nasce no nome do parceiro quando não há cliente. */
  contaReceberId: string
  contaPagarId: string
}

/**
 * Gera — ou ATUALIZA — os três registros do lançamento.
 *
 * O vencimento é o FIM DO PERÍODO: é quando o ciclo fecha e os dois lados
 * passam a ser devidos. Inventar "30 dias depois" seria um prazo que nenhum
 * contrato do sistema conhece.
 *
 * ── O TÍTULO A RECEBER SAI NO NOME DO PARCEIRO ──────────────────────────
 *
 * A receita das tarifas é devida pelo BaaS/White Label. Antes, o AR só nascia
 * quando o número da conta casava com um `Cliente` cadastrado — porque
 * `ContaReceber.clienteId` era obrigatório —, e como parceiro não é Cliente, o
 * título do primeiro lançamento de teste simplesmente não nasceu.
 *
 * A v24 tornou `clienteId` opcional e acrescentou `condicaoId`, com uma
 * CHECK garantindo exatamente um devedor. Agora:
 *
 *   conta casa com um cliente da carteira → o título é do cliente;
 *   caso contrário (o normal)             → o título é do PARCEIRO.
 *
 * Nunca os dois: seriam duas cobranças para o mesmo valor.
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

    /* ── 2. CONTA A RECEBER — sempre nasce ─────────────────────────────── */
    const dadosAR = devedorDoTitulo(d.clienteId, d.condicaoId)

    const comum = {
      descricao: descricao(d, 'Tarifas e overprice'),
      tipo: CATEGORIA_RECEITA_BAAS,
      valor: receita,
      dataVenc: vencimento,
    }

    const ar = atual.contaReceberId
      ? await tx.contaReceber.update({
          where: { id: atual.contaReceberId }, data: { ...comum, ...dadosAR },
        })
      : await tx.contaReceber.create({ data: { ...comum, ...dadosAR } })
    const contaReceberId: string = ar.id

    /* ── 3. DESPESA — o residual devido ao cliente ─────────────────────── */
    // Status PENDENTE: o título nasce em aberto, para ser complementado e
    // baixado em Contas a Pagar.
    const dadosAP = {
      tipo: 'DESPESA' as const,
      // "ao PARCEIRO": o residual é devido ao BaaS/White Label, que não é
      // cliente da carteira. O rótulo antigo dizia "cliente" e confundia os
      // dois lados do lançamento.
      descricao: descricao(d, 'Repasse ao parceiro'),
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
