/**
 * LANÇAMENTO BAAS — a aritmética do faturamento de um parceiro.
 *
 * Funções PURAS: recebem produtos, volumes e o percentual, devolvem a conta
 * inteira. Nenhuma consulta e nenhum arredondamento escondido — é o que
 * permite verificar a cascata inteira sem banco.
 *
 * A CASCATA, em ordem:
 *
 *   saldo informado
 *     − total de tarifas  (Σ preço × volume de cada produto)
 *   = saldo remanescente
 *     − overprice         (percentual sobre o saldo remanescente)
 *   = valor residual devido ao cliente
 *
 * O OVERPRICE INCIDE SOBRE O SALDO REMANESCENTE, não sobre o saldo inicial.
 * É a ordem da especificação, e muda o resultado: 25% de R$ 50.000 é
 * R$ 12.500, enquanto 25% de R$ 100.000 seriam R$ 25.000.
 *
 * O último número NÃO é "lucro da Bass Pago": é a comissão devida ao parceiro
 * depois das tarifas e do overprice.
 *
 * A CASCATA É O CÁLCULO; a CONTABILIZAÇÃO é outra coisa, e está mais abaixo
 * (`receitaBaas`, `despesaBaas`, `resultadoBaas`). O saldo integral apurado é
 * receita da Bass Pago, e a comissão do parceiro é despesa dela — porque o
 * saldo passou pela conta da Bass Pago e é dela que o pagamento sai.
 */

export interface ProdutoTarifado {
  /** Id do produto de origem, quando existe. Informativo. */
  produtoId?: string | null
  nome: string
  /** Preço unitário vigente no momento do lançamento — SNAPSHOT. */
  preco: number
  volume: number
}

export interface ItemCalculado extends ProdutoTarifado {
  /** preço × volume. */
  total: number
}

export interface Calculo {
  itens: ItemCalculado[]
  saldoInicial: number
  totalTarifas: number
  saldoRemanescente: number
  /** Percentual aplicado, ou null quando o parceiro não tem overprice. */
  overpricePercent: number | null
  overpriceValor: number
  /** Saldo remanescente − overprice. */
  valorCliente: number
}

/**
 * Centavos. Duas casas, arredondamento no fim de cada etapa.
 *
 * Sem isto, somar cem linhas de R$ 0,10 produz 10.000000000000002 e o saldo
 * remanescente carrega o erro até o overprice. Dinheiro não tem meio centavo.
 */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * A cascata inteira.
 *
 * Volume zero é VÁLIDO e produz linha com total zero: o produto existe no
 * contrato e não foi usado no período, e omiti-lo faria parecer que o produto
 * não está mais contratado.
 */
export function calcular(
  saldoInicial: number,
  produtos: ProdutoTarifado[],
  overpricePercent: number | null | undefined,
): Calculo {
  const itens: ItemCalculado[] = produtos.map((p) => ({
    ...p,
    total: centavos(p.preco * p.volume),
  }))

  const totalTarifas = centavos(itens.reduce((a, i) => a + i.total, 0))
  const saldoRemanescente = centavos(saldoInicial - totalTarifas)

  // Sem percentual, não há overprice — e não se inventa um padrão.
  const pct = typeof overpricePercent === 'number' && overpricePercent > 0
    ? overpricePercent
    : null

  /**
   * Overprice só sobre saldo POSITIVO.
   *
   * Se as tarifas consumiram mais que o saldo, o remanescente é negativo:
   * aplicar o percentual ali produziria um overprice negativo, isto é, a Bass
   * Pago devolvendo dinheiro por ter cobrado demais. O que o número negativo
   * diz é que o saldo informado não cobre as tarifas — e isso a tela mostra.
   */
  const overpriceValor = pct !== null && saldoRemanescente > 0
    ? centavos(saldoRemanescente * (pct / 100))
    : 0

  return {
    itens,
    saldoInicial: centavos(saldoInicial),
    totalTarifas,
    saldoRemanescente,
    overpricePercent: pct,
    overpriceValor,
    valorCliente: centavos(saldoRemanescente - overpriceValor),
  }
}

/* ========================================================================= *
 * A CONTABILIZAÇÃO DO LANÇAMENTO — receita, despesa e resultado
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────
 *
 * Quando o saldo apurado do período é lançado, esse saldo ESTAVA NA CONTA DA
 * BASS PAGO. Ele passou por ela, e é dela que sai o pagamento ao parceiro.
 * Portanto o valor integral apurado é RECEITA da Bass Pago — e essa receita
 * inclui as três partes: as tarifas cobradas, o overprice e a parcela que
 * pertence ao BaaS.
 *
 * A parcela do parceiro é, depois, DESPESA da Bass Pago: ela sai do caixa.
 *
 *   RECEITA   = saldo integral apurado          (`saldoInicial`)
 *   DESPESA   = valor/comissão devida ao BaaS   (`valorCliente`)
 *   RESULTADO = Receita − Despesa               (= tarifas + overprice)
 *
 * Com o exemplo da especificação:
 *
 *   saldo apurado      R$ 100.000
 *   tarifas Bass Pago  R$  10.000
 *   overprice          R$  15.000
 *   comissão BaaS      R$  75.000
 *
 *   Receita   R$ 100.000
 *   Despesa   R$  75.000
 *   Resultado R$  25.000
 *
 * ── O QUE MUDOU, E O QUE NÃO MUDOU ──────────────────────────────────────
 *
 * O RESULTADO é o mesmo de antes: continua sendo tarifas + overprice. Antes
 * ele aparecia como uma receita LÍQUIDA de 25 mil, com a despesa de 75 mil
 * excluída do resultado por um filtro em `lib/financeiro.ts`. Agora ele
 * aparece pelos dois lados, BRUTOS — 100 mil de receita, 75 mil de despesa —,
 * e o pagamento ao BaaS deixa de ficar fora do resultado.
 *
 * A diferença importa porque "receita" e "margem" são perguntas diferentes, e
 * a tela antiga respondia a segunda com o nome da primeira: o faturamento
 * aparecia como um quarto do que a empresa de fato apurou no período.
 * ========================================================================= */

/**
 * RECEITA da Bass Pago no lançamento: o saldo INTEGRAL apurado.
 *
 * Inclui a parcela do parceiro de propósito — ela entrou na conta da Bass
 * Pago, e sai dela como despesa. Devolver apenas tarifas + overprice seria
 * devolver a margem, não a receita.
 */
export function receitaBaas(c: Calculo): number {
  return centavos(c.saldoInicial)
}

/**
 * DESPESA da Bass Pago no lançamento: a comissão devida ao parceiro.
 *
 * É o mesmo número que `valorCliente` — saldo remanescente menos overprice —,
 * nomeado pelo PAPEL CONTÁBIL que ele passa a ter. `valorCliente` descreve de
 * quem é o dinheiro; `despesaBaas` descreve o que ele faz no resultado.
 */
export function despesaBaas(c: Calculo): number {
  return centavos(c.valorCliente)
}

/**
 * RESULTADO do lançamento: Receita − Despesa.
 *
 * Aritmeticamente igual a `totalTarifas + overpriceValor`, e a igualdade é
 * uma INVARIANTE da cascata, não uma coincidência: o saldo apurado se parte
 * em exatamente três pedaços (tarifas, overprice, comissão), e os dois
 * primeiros são o que a Bass Pago retém.
 *
 * Calculado pela subtração, e não pela soma, porque é a subtração que a tela
 * mostra e que o painel financeiro reproduz — se as duas pontas divergirem por
 * arredondamento, é esta que tem de fechar.
 */
export function resultadoBaas(c: Calculo): number {
  return centavos(receitaBaas(c) - despesaBaas(c))
}

/* ========================================================================= *
 * VALIDAÇÃO
 * ========================================================================= */

export interface EntradaLancamento {
  condicaoId?: unknown
  numeroConta?: unknown
  periodoInicio?: unknown
  periodoFim?: unknown
  saldoInicial?: unknown
  produtos?: unknown
}

export interface ErroLancamento {
  campo: string
  mensagem: string
}

function dataValida(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Valida a entrada ANTES de qualquer cálculo ou gravação.
 *
 * No servidor, não só na tela: o formulário pode marcar os campos, mas quem
 * garante é quem grava — e um volume negativo gravado inverteria o sinal da
 * tarifa sem ninguém perceber.
 */
export function validarLancamento(e: EntradaLancamento): ErroLancamento[] {
  const erros: ErroLancamento[] = []

  if (typeof e.condicaoId !== 'string' || !e.condicaoId) {
    erros.push({ campo: 'condicaoId', mensagem: 'Escolha o BaaS ou White Label.' })
  }
  if (typeof e.numeroConta !== 'string' || !e.numeroConta.trim()) {
    erros.push({ campo: 'numeroConta', mensagem: 'A conta do parceiro é obrigatória.' })
  }

  const inicio = dataValida(e.periodoInicio)
  const fim = dataValida(e.periodoFim)
  if (!inicio) erros.push({ campo: 'periodoInicio', mensagem: 'Informe o início do período.' })
  if (!fim) erros.push({ campo: 'periodoFim', mensagem: 'Informe o fim do período.' })
  if (inicio && fim && fim.getTime() < inicio.getTime()) {
    erros.push({ campo: 'periodoFim', mensagem: 'O fim do período não pode ser antes do início.' })
  }

  const saldo = numero(e.saldoInicial)
  if (saldo === null) {
    erros.push({ campo: 'saldoInicial', mensagem: 'Informe o saldo atual da conta.' })
  } else if (saldo < 0) {
    erros.push({ campo: 'saldoInicial', mensagem: 'O saldo não pode ser negativo.' })
  }

  if (!Array.isArray(e.produtos) || e.produtos.length === 0) {
    erros.push({
      campo: 'produtos',
      mensagem: 'Este parceiro não tem produtos tarifados cadastrados em Condições BaaS.',
    })
  } else {
    e.produtos.forEach((p, i) => {
      const item = p as Record<string, unknown>
      const preco = numero(item.preco)
      const volume = numero(item.volume)
      if (typeof item.nome !== 'string' || !item.nome.trim()) {
        erros.push({ campo: `produtos.${i}.nome`, mensagem: 'Produto sem nome.' })
      }
      if (preco === null || preco < 0) {
        erros.push({ campo: `produtos.${i}.preco`, mensagem: 'Preço inválido.' })
      }
      if (volume === null || !Number.isInteger(volume) || volume < 0) {
        erros.push({
          campo: `produtos.${i}.volume`,
          mensagem: `Volume de ${item.nome ?? 'produto'} deve ser um número inteiro não negativo.`,
        })
      }
    })
  }

  return erros
}

/** Rótulo do período, como a lista o mostra. */
export function rotuloPeriodo(inicio: Date, fim: Date): string {
  const f = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  return `${f(inicio)} a ${f(fim)}`
}

/**
 * Dois períodos se sobrepõem?
 *
 * Usado para recusar o segundo lançamento do mesmo intervalo: tarifar o mesmo
 * volume duas vezes é dupla contagem de receita.
 */
export function periodosSobrepostos(
  aInicio: Date, aFim: Date, bInicio: Date, bFim: Date,
): boolean {
  return aInicio.getTime() <= bFim.getTime() && bInicio.getTime() <= aFim.getTime()
}
