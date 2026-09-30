/**
 * METAS — regras de domínio. Sem Prisma: funções puras, exercitáveis sem banco.
 *
 * Duas ideias sustentam este módulo:
 *
 *   1. A meta é SÓ O ESPERADO. O realizado nunca é digitado; vem sempre do
 *      Lançamento Diário (ver `metasDoPeriodo` em lib/kpi.ts).
 *
 *   2. Nem toda meta é "quanto maior melhor". Uma meta de MED em 2% é atingida
 *      quando o realizado fica ABAIXO dela. Por isso a direção é um campo da
 *      meta, e não uma tabela de exceções escondida no código — um indicador
 *      percentual novo não precisa de nenhuma alteração aqui.
 */

export const META_DIRECOES = ['MAIOR_MELHOR', 'MENOR_MELHOR'] as const
export type MetaDirecao = (typeof META_DIRECOES)[number]

export const META_UNIDADES = ['VALOR', 'QUANTIDADE', 'PERCENTUAL'] as const
export type MetaUnidade = (typeof META_UNIDADES)[number]

export const DIRECAO_LABEL: Record<MetaDirecao, string> = {
  MAIOR_MELHOR: 'Maior é melhor',
  MENOR_MELHOR: 'Menor é melhor',
}

export const UNIDADE_LABEL: Record<MetaUnidade, string> = {
  VALOR: 'Valor (R$)',
  QUANTIDADE: 'Quantidade',
  PERCENTUAL: 'Percentual (%)',
}

/** Tipos de meta oferecidos na criação. O legado continua sendo lido. */
export const META_TIPOS = [
  'RECEITA_TARIFARIA', 'TPV', 'SALDO_EM_CONTA', 'TRANSACOES', 'MEDS',
  'MED_PERCENTUAL', 'TAKE_RATE',
] as const
export type MetaTipo = (typeof META_TIPOS)[number]

/**
 * Sugestão de unidade e direção para cada indicador. É só o PADRÃO oferecido
 * ao abrir o formulário — quem define é o usuário, e o valor escolhido fica
 * gravado na meta. O sistema não reinterpreta a direção na leitura.
 */
export const PADRAO_POR_TIPO: Record<MetaTipo, { unidade: MetaUnidade; direcao: MetaDirecao }> = {
  RECEITA_TARIFARIA: { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' },
  TPV: { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' },
  SALDO_EM_CONTA: { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' },
  TRANSACOES: { unidade: 'QUANTIDADE', direcao: 'MAIOR_MELHOR' },
  MEDS: { unidade: 'QUANTIDADE', direcao: 'MENOR_MELHOR' },
  MED_PERCENTUAL: { unidade: 'PERCENTUAL', direcao: 'MENOR_MELHOR' },
  TAKE_RATE: { unidade: 'PERCENTUAL', direcao: 'MAIOR_MELHOR' },
}

export type SituacaoMeta = 'ATINGIDA' | 'NAO_ATINGIDA' | 'SEM_REALIZADO'

export interface Avaliacao {
  /**
   * Quanto da meta foi cumprido, em percentual.
   *
   *   MAIOR_MELHOR → realizado / meta
   *   MENOR_MELHOR → meta / realizado
   *
   * A inversão existe para que 100% signifique "no alvo" nos dois casos: com
   * meta de MED em 2% e realizado de 1,5%, o cumprimento é 133% — e não 75%,
   * que é o que a divisão direta diria de um resultado BOM.
   *
   * null quando não há realizado, ou quando o denominador é zero.
   */
  cumprimento: number | null
  situacao: SituacaoMeta
  /** Verdadeiro quando o realizado é o lado bom da meta. */
  positivo: boolean
  /** Diferença realizado − meta. Null sem realizado. */
  diferenca: number | null
}

/**
 * Compara meta e realizado respeitando a direção.
 *
 * Exemplos da especificação:
 *   meta 2%, realizado 1,5%, MENOR_MELHOR → positivo
 *   meta 2%, realizado 3,0%, MENOR_MELHOR → negativo
 */
export function avaliarMeta(
  meta: number, realizado: number | null, direcao: MetaDirecao,
): Avaliacao {
  if (realizado === null || !Number.isFinite(realizado)) {
    return { cumprimento: null, situacao: 'SEM_REALIZADO', positivo: false, diferenca: null }
  }

  const diferenca = realizado - meta
  const positivo = direcao === 'MAIOR_MELHOR' ? realizado >= meta : realizado <= meta

  let cumprimento: number | null
  if (direcao === 'MAIOR_MELHOR') {
    cumprimento = meta > 0 ? (realizado / meta) * 100 : null
  } else {
    // Zero MEDs com meta de 2% é o melhor resultado possível, não uma divisão
    // por zero: 100% de cumprimento (a meta foi respeitada com folga máxima).
    cumprimento = realizado > 0 ? (meta / realizado) * 100 : meta >= 0 ? 100 : null
  }

  return {
    cumprimento,
    situacao: positivo ? 'ATINGIDA' : 'NAO_ATINGIDA',
    positivo,
    diferenca,
  }
}

/** Valor da meta é válido? Percentual não passa de 100. */
export function validarValorMeta(valor: number, unidade: MetaUnidade): string | null {
  if (!Number.isFinite(valor) || valor < 0) {
    return 'O valor da meta deve ser um número maior ou igual a zero.'
  }
  if (unidade === 'PERCENTUAL' && valor > 100) {
    return 'Uma meta percentual não pode passar de 100%.'
  }
  return null
}
