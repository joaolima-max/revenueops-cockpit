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

/* ========================================================================= *
 * PACING — o mês ainda está correndo
 *
 * Comparar o realizado parcial de um mês contra a meta cheia diz pouco: no dia
 * 10, 33% da meta não é atraso, é o esperado. O pacing responde a outra
 * pergunta — "no ritmo de hoje, fecha o mês dentro da meta?".
 * ========================================================================= */

export type Ritmo = 'ACIMA' | 'NO_RITMO' | 'ABAIXO' | 'INDETERMINADO'

export interface Pacing {
  /** Fração do período já decorrida, 0..1. */
  decorrido: number
  /** Onde o realizado DEVERIA estar hoje para fechar o mês na meta. */
  esperadoAteAgora: number
  /** Projeção do fechamento, mantido o ritmo atual. Null sem realizado. */
  projecao: number | null
  /** Projeção comparada à meta — já respeita a direção. */
  ritmo: Ritmo
  /** O período já fechou? Aí não há ritmo a projetar: o número é final. */
  encerrado: boolean
}

/** Dias do mês "YYYY-MM". */
function diasNoMes(periodo: string): number {
  const [a, m] = periodo.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

/**
 * Ritmo de um indicador dentro do mês.
 *
 * REGRA DA PROJEÇÃO: indicadores de FLUXO acumulam (TPV, receita, transações,
 * MEDs) — a projeção é `realizado / decorrido`. Indicadores de ESTOQUE ou
 * PROPORÇÃO não acumulam (saldo médio, MED %, take rate): a projeção é o
 * próprio realizado, porque a média parcial já é a melhor estimativa do
 * fechamento. Projetar um percentual pelo tempo decorrido daria 6% de MED no
 * dia 10 a partir de 2% — um número que não significa nada.
 *
 * `hoje` é parâmetro para a função ser determinística nos testes.
 */
export function calcularPacing(
  periodo: string,
  meta: number,
  realizado: number | null,
  direcao: MetaDirecao,
  acumula: boolean,
  hoje: Date = new Date(),
): Pacing {
  const dias = diasNoMes(periodo)
  const mesCorrente = periodo === `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`
  const futuro = periodo > `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`

  // Mês passado está fechado; mês futuro não começou.
  const decorrido = futuro ? 0 : mesCorrente ? Math.min(hoje.getUTCDate() / dias, 1) : 1
  const encerrado = !mesCorrente && !futuro

  const esperadoAteAgora = acumula ? meta * decorrido : meta

  if (realizado === null || decorrido === 0) {
    return { decorrido, esperadoAteAgora, projecao: null, ritmo: 'INDETERMINADO', encerrado }
  }

  const projecao = acumula ? realizado / decorrido : realizado
  const bate = direcao === 'MAIOR_MELHOR' ? projecao >= meta : projecao <= meta

  // Margem de 5% para não chamar de "abaixo" quem está a um fio da meta.
  const folga = direcao === 'MAIOR_MELHOR' ? projecao >= meta * 0.95 : projecao <= meta * 1.05

  return {
    decorrido,
    esperadoAteAgora,
    projecao,
    ritmo: bate ? 'ACIMA' : folga ? 'NO_RITMO' : 'ABAIXO',
    encerrado,
  }
}

/** Indicadores que ACUMULAM ao longo do mês. Os demais são estoque ou razão. */
export const ACUMULA_NO_MES: Record<MetaTipo, boolean> = {
  RECEITA_TARIFARIA: true,
  TPV: true,
  TRANSACOES: true,
  MEDS: true,
  SALDO_EM_CONTA: false,   // média do período
  MED_PERCENTUAL: false,   // proporção
  TAKE_RATE: false,        // proporção
}

/* ========================================================================= *
 * AVALIAÇÃO COMPLETA — a função única
 * ========================================================================= */

export interface AvaliacaoCompleta extends Avaliacao {
  tipo: string
  meta: number
  realizado: number | null
  direcao: MetaDirecao
  unidade: MetaUnidade
  /** Distância até a meta, SEMPRE no sentido "quanto falta". Null sem realizado. */
  gap: number | null
  pacing: Pacing
}

/**
 * A ÚNICA porta de entrada para avaliar uma meta.
 *
 * Reúne comparação, gap, atingimento, direção, status e ritmo. Existe para que
 * nenhum componente precise refazer a matemática — e é por isso que Cockpit,
 * tela de Metas e API leem daqui em vez de cada um calcular o seu.
 *
 * GAP é sempre "quanto falta para ficar no alvo", nunca a diferença crua:
 *   maior é melhor, meta 100, realizado  80  ->  gap  20 (faltam 20)
 *   menor é melhor, meta   2, realizado   3  ->  gap   1 (sobra 1 a cortar)
 *   já no alvo                               ->  gap   0
 */
export function avaliarCompleto(
  entrada: {
    tipo: string
    periodo: string
    meta: number
    realizado: number | null
    direcao: MetaDirecao
    unidade: MetaUnidade
  },
  hoje: Date = new Date(),
): AvaliacaoCompleta {
  const base = avaliarMeta(entrada.meta, entrada.realizado, entrada.direcao)

  const gap = entrada.realizado === null
    ? null
    : base.positivo
      ? 0
      : Math.abs(entrada.realizado - entrada.meta)

  const acumula = ACUMULA_NO_MES[entrada.tipo as MetaTipo] ?? true

  return {
    ...base,
    tipo: entrada.tipo,
    meta: entrada.meta,
    realizado: entrada.realizado,
    direcao: entrada.direcao,
    unidade: entrada.unidade,
    gap,
    pacing: calcularPacing(
      entrada.periodo, entrada.meta, entrada.realizado, entrada.direcao, acumula, hoje,
    ),
  }
}

export const RITMO_LABEL: Record<Ritmo, string> = {
  ACIMA: 'Acima do ritmo',
  NO_RITMO: 'No ritmo',
  ABAIXO: 'Abaixo do ritmo',
  INDETERMINADO: 'Sem ritmo apurado',
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
