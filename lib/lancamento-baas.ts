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
 * O último número NÃO é "lucro da Bass Pago": é o valor residual devido ao
 * cliente depois das tarifas e do overprice.
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

/**
 * A RECEITA da Bass Pago no lançamento.
 *
 * É o que ela cobrou: as tarifas mais o overprice. Não é o saldo do cliente
 * nem o saldo inicial — esses são dinheiro do cliente passando pela conta.
 */
export function receitaBassPago(c: Calculo): number {
  return centavos(c.totalTarifas + c.overpriceValor)
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
