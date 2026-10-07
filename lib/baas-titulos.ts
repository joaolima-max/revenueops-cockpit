/**
 * TÍTULOS GERADOS POR UM LANÇAMENTO BAAS.
 *
 * Um lançamento produz TRÊS registros, e no máximo um de cada:
 *
 *   1. LANÇAMENTO FINANCEIRO de RECEITA — o saldo INTEGRAL apurado no
 *      período. É receita da Bass Pago porque o saldo estava na conta dela;
 *   2. CONTA A RECEBER — o título dessa receita, pelo MESMO valor integral;
 *   3. LANÇAMENTO FINANCEIRO de DESPESA — a comissão devida ao parceiro, que
 *      é o que alimenta Contas a Pagar.
 *
 * ── RECEITA (1) E TÍTULO (2) VALEM O MESMO ──────────────────────────────
 *
 * Os dois valem o saldo integral apurado: 100 mil, no exemplo da
 * especificação. O título É o recebível daquela receita, e espelhá-lo é o que
 * mantém Contas a Receber coerente com a Receita do período — um título de 10
 * mil ao lado de uma receita de 100 mil obrigaria quem confere a somar os dois
 * lados à mão para descobrir que a diferença era o overprice.
 *
 * Até a v27 o título cobrava só as TARIFAS, porque a receita era a margem.
 * Com a receita bruta, a assimetria deixou de ter sentido.
 *
 * ── A PROJEÇÃO DE CAIXA NÃO SOMA OS DOIS ────────────────────────────────
 *
 * E é por isso que o espelhamento não cria dupla contagem: `lib/previsao.ts`
 * NUNCA lê `ContaReceber` — o caixa e o resultado saem de
 * `LancamentoFinanceiro`, que é a origem única. O título existe para a
 * cobrança e para a inadimplência; ele não entra em nenhuma soma de receita.
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

/**
 * A categoria dos três registros: **BaaS**, nos dois tipos.
 *
 * ── UM NOME, NÃO TRÊS ───────────────────────────────────────────────────
 *
 * Já foram "Tarifas BaaS" (receita) e "Repasse a Cliente BaaS" (despesa).
 * Nomear a categoria pelo PAPEL de cada registro criava três categorias para
 * uma única origem — e a tela de Categorias, que existe para classificar
 * despesa e receita por natureza, enchia de linhas que diziam a mesma coisa
 * com palavras diferentes.
 *
 * "Tarifa BaaS" e "Repasse BaaS" continuam existindo, na DESCRIÇÃO, que é
 * onde o papel do registro pertence. A categoria responde "de onde vem?", e a
 * resposta é a mesma para os três: BaaS.
 *
 * São duas linhas no banco porque `CategoriaFinanceira` é única por
 * (nome, tipo) — uma de RECEITA e uma de DESPESA, ambas chamadas BaaS. O
 * gasto por categoria e a receita por categoria continuam separados, como
 * devem.
 */
export const CATEGORIA_BAAS = 'BaaS'

/** @deprecated Use `CATEGORIA_BAAS`. Mantidos para não quebrar importações. */
export const CATEGORIA_RECEITA_BAAS = CATEGORIA_BAAS
export const CATEGORIA_DESPESA_BAAS = CATEGORIA_BAAS

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
   * O saldo INTEGRAL apurado no período.
   *
   * É a RECEITA da Bass Pago **e** o valor do título a receber — os dois
   * registros valem o mesmo. Inclui as tarifas, o overprice E a comissão do
   * parceiro: o saldo estava na conta da Bass Pago, e é dela que sai o
   * pagamento ao BaaS.
   *
   * `tarifas` SAIU desta interface na v28. Enquanto o título cobrava só as
   * tarifas, ele era um parâmetro próprio; agora que o título espelha a
   * receita, mantê-lo seria um campo que ninguém lê — e um campo não lido é um
   * campo que volta a ser preenchido errado.
   */
  receita: number
  /**
   * A COMISSÃO devida ao parceiro — saldo remanescente menos o overprice.
   *
   * É DESPESA da Bass Pago, e entra no Resultado como tal. Até a v27 ela
   * existia como lançamento de despesa mas era excluída do resultado por um
   * filtro; essa exclusão saiu.
   */
  despesa: number
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
 * A descrição dos registros gerados: "<o quê> — <parceiro>".
 *
 * CURTA de propósito, e cada corte tem um motivo:
 *
 *   - a CONTA e o intervalo exato saíram primeiro ("conta 12000 · 01/09/2026 a
 *     30/09/2026") — não cabiam numa linha de tabela;
 *   - a COMPETÊNCIA saiu depois ("— 09/2026"): a data é uma COLUNA da tabela
 *     de Lançamentos, e repeti-la na descrição gastava largura para dizer
 *     duas vezes a mesma coisa;
 *   - a COMPOSIÇÃO POR PRODUTO nunca entrou — é exatamente o que o painel de
 *     detalhes existe para mostrar.
 *
 * O que sobra é o que identifica a linha num relance: o que é, e de quem.
 */
function descricao(d: DadosGeracao, oque: string): string {
  return `${oque} — ${d.parceiroNome}`
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
      categoria(tx, CATEGORIA_BAAS, 'RECEITA'),
      categoria(tx, CATEGORIA_BAAS, 'DESPESA'),
    ])

    const vencimento = d.periodoFim
    const receita = centavos(d.receita)
    const comissao = centavos(d.despesa)

    /* ── 1. RECEITA da Bass Pago — o saldo INTEGRAL apurado ────────────── */
    // "Apuração BaaS", e não "Tarifa BaaS": o valor deixou de ser a tarifa e
    // passou a ser o saldo inteiro do período. Manter o rótulo antigo faria a
    // linha de 100 mil dizer que é a tarifa de 10 mil.
    const dadosReceita = {
      tipo: 'RECEITA' as const,
      descricao: descricao(d, 'Apuração BaaS'),
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

    /**
     * O TÍTULO ESPELHA A RECEITA: o saldo INTEGRAL apurado.
     *
     * Até a v27 ele cobrava só as tarifas, porque a receita era a margem. Com
     * a receita bruta, a assimetria deixou de ter sentido: um título de 10 mil
     * ao lado de uma receita de 100 mil obrigaria quem confere a somar os dois
     * lados à mão para descobrir que a diferença era o overprice.
     *
     * NÃO cria dupla contagem. `lib/previsao.ts` e `lib/financeiro.ts` NUNCA
     * leem `ContaReceber` para apurar receita, resultado ou caixa — a origem
     * única é `LancamentoFinanceiro`. O título existe para a cobrança e para a
     * inadimplência, e não entra em nenhuma soma de receita.
     *
     * O rótulo acompanha: "Apuração BaaS", igual ao da receita, porque é o
     * mesmo valor visto como cobrança. "Tarifa BaaS" descreveria 10 mil.
     */
    const comum = {
      descricao: descricao(d, 'Apuração BaaS'),
      // `ContaReceber.tipo` é o rótulo que a tela mostra como badge — a
      // categoria do título. Mesmo nome dos outros dois: BaaS.
      tipo: CATEGORIA_BAAS,
      valor: receita,
      dataVenc: vencimento,
    }

    const ar = atual.contaReceberId
      ? await tx.contaReceber.update({
          where: { id: atual.contaReceberId }, data: { ...comum, ...dadosAR },
        })
      : await tx.contaReceber.create({ data: { ...comum, ...dadosAR } })
    const contaReceberId: string = ar.id

    /* ── 3. DESPESA — a comissão devida ao parceiro ────────────────────── */
    // Status PENDENTE: o título nasce em aberto, para ser complementado e
    // baixado em Contas a Pagar.
    const dadosAP = {
      tipo: 'DESPESA' as const,
      // "Comissão", e não "Repasse": sob a regra nova este valor É despesa da
      // Bass Pago e entra no Resultado como tal. "Repasse" descrevia um
      // dinheiro de passagem, que era justamente a leitura que o justificava
      // ficar fora do resultado.
      descricao: descricao(d, 'Comissão BaaS'),
      categoriaId: catDespesa,
      valor: comissao,
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


/* ========================================================================= *
 * SINCRONIZAÇÃO — reparo dos lançamentos que ficaram sem títulos
 * ========================================================================= */

export interface ResultadoSincronizacao {
  /** Lançamentos examinados (todos os que tinham algum dos três faltando). */
  examinados: number
  /** Conjuntos completados com sucesso. */
  reparados: number
  /** Lançamentos que não puderam ser reparados, com o motivo. */
  falhas: Array<{ id: string; parceiro: string; motivo: string }>
  /** Ids reparados, para a trilha de auditoria. */
  ids: string[]
}

/**
 * COMPLETA OS TÍTULOS FALTANTES de todos os lançamentos BaaS.
 *
 * POR QUE ISTO EXISTE. Enquanto a criação não gerava os títulos sozinha,
 * nasceram lançamentos em produção com conjunto incompleto — e um deles ficou
 * ainda mais incompleto quando alguém apagou o lançamento financeiro pela
 * tela de Lançamentos, o que zera a FK (`ON DELETE SET NULL`) sem avisar
 * ninguém. Corrigir a criação impede novos casos; os que já existem precisam
 * de reparo.
 *
 * SEGURA, e por construção:
 *
 *   - só olha lançamentos em que FALTA algum dos três. Conjunto completo não
 *     é tocado — nem para "conferir", porque reescrever um título correto é
 *     risco sem ganho;
 *   - NÃO DUPLICA: `gerarTitulos` atualiza quando a FK já aponta para algo, e
 *     as três FKs são UNIQUE. O que falta é criado; o que existe permanece;
 *   - NUNCA MEXE EM LIQUIDADO: um conjunto com título já recebido, faturado
 *     ou pago é deixado como está, e entra em `falhas` com o motivo. O valor
 *     movimentado é o histórico — recalculá-lo seria apagá-lo;
 *   - os valores são RECALCULADOS dos itens gravados no próprio lançamento
 *     (snapshot de preço e volume), não de tarifa de hoje. O título de
 *     setembro continua valendo a tarifa de setembro;
 *   - uma falha não interrompe as demais: cada lançamento é independente, e
 *     um parceiro com categoria ausente não deve impedir o reparo dos outros.
 *
 * Idempotente: rodar duas vezes seguidas não muda nada na segunda.
 */
export async function sincronizarTitulosFaltantes(
  criadoPorId: string,
): Promise<ResultadoSincronizacao> {
  const incompletos = await prisma.lancamentoBaas.findMany({
    where: {
      OR: [
        { lancamentoId: null },
        { contaReceberId: null },
        { contaPagarId: null },
      ],
    },
    include: {
      condicao: { select: { id: true, nomeFantasia: true, overpricePercent: true } },
      itens: { orderBy: { ordem: 'asc' } },
    },
    orderBy: [{ periodoInicio: 'asc' }],
  })

  const falhas: ResultadoSincronizacao['falhas'] = []
  const ids: string[] = []

  for (const lb of incompletos) {
    // Liquidado fica como está. A ausência de um título num conjunto cujo
    // outro título já foi movimentado é um caso para pessoa, não para rotina.
    const liq = await liquidacaoDe(lb.id)
    if (liq.liquidado) {
      falhas.push({
        id: lb.id,
        parceiro: lb.condicao.nomeFantasia,
        motivo: `${liq.motivo} — reparo automático não mexe em histórico liquidado`,
      })
      continue
    }

    try {
      await gerarTitulos({
        lancamentoBaasId: lb.id,
        condicaoId: lb.condicaoId,
        parceiroNome: lb.condicao.nomeFantasia,
        numeroConta: lb.numeroConta,
        periodoInicio: lb.periodoInicio,
        periodoFim: lb.periodoFim,
        // Os valores GRAVADOS no lançamento, não um recálculo a partir do
        // cadastro atual: o snapshot é o que define o que se cobra.
        //
        // A RECEITA é o `saldoInicial` gravado — o saldo integral apurado —, e
        // não `totalTarifas + overpriceValor`, que é a MARGEM. Era assim que a
        // receita era calculada até a v27, quando a comissão do parceiro ficava
        // fora do resultado; a regra nova registra os dois lados brutos.
        receita: lb.saldoInicial,
        despesa: lb.valorCliente,
        criadoPorId,
        clienteId: await clientePelaConta(lb.numeroConta),
      })
      ids.push(lb.id)
    } catch (e) {
      falhas.push({
        id: lb.id,
        parceiro: lb.condicao.nomeFantasia,
        motivo: e instanceof Error ? e.message : 'erro ao gerar os títulos',
      })
    }
  }

  return {
    examinados: incompletos.length,
    reparados: ids.length,
    falhas,
    ids,
  }
}
