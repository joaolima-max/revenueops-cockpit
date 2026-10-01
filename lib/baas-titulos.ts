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
  /**
   * TARIFAS do período — o que se COBRA do parceiro, e o valor do título a
   * receber. Não inclui o overprice.
   */
  tarifas: number
  /**
   * Tarifas + overprice — a RECEITA que a Bass Pago realiza no período, e o
   * valor do lançamento financeiro.
   *
   * Os dois números são diferentes de propósito, e a diferença é o overprice:
   * ele é receita nossa, mas NÃO é faturado ao parceiro — é realizado pagando
   * a ele menos. Por isso entra no lançamento (que é o que a Receita do
   * período soma) e fica fora do título a receber (que é o que se cobra).
   */
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
 * A descrição dos registros gerados: "<o quê> — <parceiro> — <competência>".
 *
 * SIMPLES de propósito. A versão longa trazia a conta e o intervalo inteiro
 * ("conta 12000 · 01/09/2026 a 30/09/2026"), e nenhuma dessas informações
 * cabia numa linha de tabela — a conta e as datas exatas estão no detalhe do
 * lançamento, que é onde se vai quando a pergunta é "de onde veio esse valor".
 *
 * A composição por produto NÃO entra aqui: é justamente o que o painel de
 * detalhes existe para mostrar.
 */
function descricao(d: DadosGeracao, oque: string): string {
  const competencia = d.periodoFim.toLocaleDateString('pt-BR', {
    month: '2-digit', year: 'numeric', timeZone: 'UTC',
  })
  return `${oque} — ${d.parceiroNome} — ${competencia}`
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
    const tarifas = centavos(d.tarifas)
    const cliente = centavos(d.valorCliente)

    /* ── 1. RECEITA da Bass Pago ───────────────────────────────────────── */
    const dadosReceita = {
      tipo: 'RECEITA' as const,
      descricao: descricao(d, 'Lançamento BaaS'),
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

    // O TÍTULO COBRA AS TARIFAS, não a receita inteira. O overprice é
    // realizado no outro lado — pagando menos ao parceiro —, e cobrá-lo aqui
    // seria cobrar duas vezes o mesmo valor.
    const comum = {
      descricao: descricao(d, 'Tarifas BaaS'),
      tipo: CATEGORIA_RECEITA_BAAS,
      valor: tarifas,
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


/* ========================================================================= *
 * LIQUIDAÇÃO — o que protege o passado
 * ========================================================================= */

export interface Liquidacao {
  liquidado: boolean
  /** Por que está travado, em linguagem de gente. Vazio quando não está. */
  motivo: string
}

/**
 * Algum título do lançamento já foi movimentado?
 *
 * É ISTO que impede editar e excluir — não um status marcado à mão.
 *
 * O "FECHADO" anterior não protegia nada: um lançamento com título já pago
 * continuava editável enquanto ninguém o fechasse, e um lançamento sem
 * nenhuma liquidação ficava travado no instante em que fosse fechado. O
 * estado que importa é o dos títulos, e é ele que se consulta.
 *
 * CONSIDERA-SE LIQUIDADO:
 *   - o título a receber com status PAGO ou FATURADO, ou com `dataPago`;
 *   - o lançamento de despesa (Contas a Pagar) com status PAGO.
 *
 * FATURADO conta porque já saiu nota: cancelar o título depois disso é
 * problema fiscal, não ajuste de cadastro.
 */
export async function liquidacaoDe(lancamentoBaasId: string): Promise<Liquidacao> {
  const lb = await prisma.lancamentoBaas.findUnique({
    where: { id: lancamentoBaasId },
    select: {
      contaReceber: { select: { status: true, dataPago: true } },
      contaPagar: { select: { status: true } },
    },
  })
  if (!lb) return { liquidado: false, motivo: '' }

  const ar = lb.contaReceber
  if (ar && (ar.status === 'PAGO' || ar.status === 'FATURADO' || ar.dataPago)) {
    return {
      liquidado: true,
      motivo: ar.status === 'FATURADO'
        ? 'o título a receber já foi faturado'
        : 'o título a receber já foi recebido',
    }
  }

  if (lb.contaPagar?.status === 'PAGO') {
    return { liquidado: true, motivo: 'o título a pagar já foi pago' }
  }

  return { liquidado: false, motivo: '' }
}

/**
 * Apaga os três registros gerados por um lançamento.
 *
 * Numa transação, e nesta ordem: primeiro solta os vínculos do
 * `LancamentoBaas`, depois apaga os títulos. Apagar antes de soltar
 * esbarraria nas FKs.
 *
 * NÃO É CHAMADA SOBRE NADA LIQUIDADO — quem chama confere `liquidacaoDe`
 * primeiro. Esta função é o braço mecânico; a decisão é de quem a chama.
 *
 * `deleteMany` em vez de `delete`: um título que alguém já tenha removido à
 * mão em Lançamentos não pode fazer a exclusão do lançamento falhar.
 */
export async function apagarTitulos(lancamentoBaasId: string): Promise<{
  lancamento: boolean; contaReceber: boolean; contaPagar: boolean
}> {
  const lb = await prisma.lancamentoBaas.findUnique({
    where: { id: lancamentoBaasId },
    select: { lancamentoId: true, contaReceberId: true, contaPagarId: true },
  })
  if (!lb) return { lancamento: false, contaReceber: false, contaPagar: false }

  await prisma.$transaction(async (tx) => {
    // Solta os vínculos primeiro: as FKs são UNIQUE e apontam para os títulos.
    await tx.lancamentoBaas.update({
      where: { id: lancamentoBaasId },
      data: { lancamentoId: null, contaReceberId: null, contaPagarId: null },
    })

    if (lb.contaReceberId) {
      await tx.contaReceber.deleteMany({ where: { id: lb.contaReceberId } })
    }
    // Os dois lançamentos financeiros: a receita e a despesa do repasse.
    const ids = [lb.lancamentoId, lb.contaPagarId].filter((x): x is string => !!x)
    if (ids.length > 0) {
      await tx.lancamentoFinanceiro.deleteMany({ where: { id: { in: ids } } })
    }
  })

  return {
    lancamento: !!lb.lancamentoId,
    contaReceber: !!lb.contaReceberId,
    contaPagar: !!lb.contaPagarId,
  }
}
