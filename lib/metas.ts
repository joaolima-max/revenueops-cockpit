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

/**
 * Tipos de meta oferecidos na criação.
 *
 * MED É UM INDICADOR SÓ. Não existe "MED" e "MED %" como coisas diferentes: o
 * que muda entre uma meta de 2% e uma de 100 MEDs é a UNIDADE, não o
 * indicador. Dois tipos para o mesmo conceito obrigavam a escolher, no
 * cadastro, entre duas linhas com o mesmo nome — e produziam duas metas
 * concorrentes sobre o mesmo fato.
 *
 * `MED_PERCENTUAL` continua existindo no enum do banco, como legado: há como
 * ler metas antigas gravadas com ele, e elas são tratadas como MED com unidade
 * percentual. Não é mais oferecido na criação.
 */
export const META_TIPOS = [
  // Operacionais — alimentados pelo Lançamento Diário.
  'RECEITA_TARIFARIA', 'TPV', 'SALDO_EM_CONTA', 'TRANSACOES', 'MEDS', 'TAKE_RATE',
  /**
   * DE RECEITA — as três linhas que, com a Receita Tarifária, fecham a
   * RECEITA PREVISTA da Previsão.
   *
   * ── POR QUE ELAS EXISTEM ───────────────────────────────────────────────
   *
   * A Previsão de Receita é `MRR projetado + metas de receita`. O MRR vem do
   * CADASTRO (sustentação das condições comerciais e mensalidade de API da
   * carteira) — é contrato assinado, não alvo. As outras quatro linhas de
   * receita não têm cadastro de onde sair: ninguém assina "vou faturar
   * R$ 80 mil de setup em novembro". Elas são DECISÃO, e decisão de receita
   * neste produto se grava como meta.
   *
   * Então estas três entram no mesmo cadastro de Metas que a Receita
   * Tarifária já usava, com o mesmo período, a mesma edição e a mesma
   * auditoria — e a Previsão as lê de lá. Uma segunda tabela de "receita
   * planejada" ao lado de Metas criaria dois lugares para decidir o mesmo
   * número.
   *
   * ── NÃO SE SOBREPÕEM ───────────────────────────────────────────────────
   *
   * RECEITA_TARIFARIA é a tarifa sobre o TPV PRÓPRIO (vem do Lançamento
   * Diário). RECEITA_LANCAMENTOS_WL_BAAS é a apuração dos PARCEIROS (vem do
   * Lançamento BaaS). Serviços e Setup são contratos pontuais. Sustentação e
   * mensalidade de API não aparecem aqui porque entram pelo MRR — metá-las
   * seria contar o mesmo dinheiro duas vezes, e é a primeira coisa que
   * `lib/previsao-receita` documenta.
   */
  'RECEITA_LANCAMENTOS_WL_BAAS', 'RECEITA_SERVICOS', 'RECEITA_SETUP',
  // De PIPELINE — alimentados pelo Comercial. Quantidade e percentual; nenhuma
  // monetária, porque o valor de um lead não está validado e não vira meta.
  //
  // SÃO DOIS, e só dois. `LEADS_GANHOS`, `LEADS_PERDIDOS` e
  // `ATIVIDADE_ASSISTIDA` saíram da criação: ganho e perda são o DESFECHO da
  // geração e da conversão — metar os quatro produziria alvos que se
  // contradizem (bater geração e conversão já determina os ganhos), e
  // atividade assistida é indicador de acompanhamento, não objetivo.
  //
  // Os três continuam no enum do banco: há como ler metas gravadas com eles.
  'LEADS_GERADOS', 'CONVERSAO_LEADS',
] as const

/** Os tipos que a Visão geral do Comercial acompanha. */
export const META_TIPOS_PIPELINE: readonly string[] = [
  'LEADS_GERADOS', 'CONVERSAO_LEADS',
  // Legados: não são oferecidos, mas uma meta já gravada continua sendo
  // apurada e exibida — apagá-la da leitura esconderia um alvo ativo.
  'LEADS_GANHOS', 'LEADS_PERDIDOS', 'ATIVIDADE_ASSISTIDA',
]

export function ehMetaDePipeline(tipo: string): boolean {
  return META_TIPOS_PIPELINE.includes(tipo)
}
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
  // MED aceita as duas unidades. O padrão é percentual porque é como a
  // operação fala do indicador — e quem decide, no fim, é quem cadastra.
  MEDS: { unidade: 'PERCENTUAL', direcao: 'MENOR_MELHOR' },
  TAKE_RATE: { unidade: 'PERCENTUAL', direcao: 'MAIOR_MELHOR' },

  // ── Receita que alimenta a Previsão ───────────────────────────────────
  // VALOR e MAIOR_MELHOR nas três: são reais a faturar, e faturar mais é
  // melhor. A unidade NÃO é negociável aqui como em MED — uma meta de receita
  // em percentual não tem o que somar na Previsão —, mas a validação disso
  // mora em `validarValorMeta` e na API, não neste padrão.
  RECEITA_LANCAMENTOS_WL_BAAS: { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' },
  RECEITA_SERVICOS: { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' },
  RECEITA_SETUP: { unidade: 'VALOR', direcao: 'MAIOR_MELHOR' },

  // ── Pipeline ──────────────────────────────────────────────────────────
  LEADS_GERADOS: { unidade: 'QUANTIDADE', direcao: 'MAIOR_MELHOR' },
  CONVERSAO_LEADS: { unidade: 'PERCENTUAL', direcao: 'MAIOR_MELHOR' },
}

/**
 * Padrão dos tipos LEGADOS, para que uma meta já gravada continue sendo
 * avaliada. Não aparecem na criação — ver `META_TIPOS`.
 */
export const PADRAO_LEGADO: Record<string, { unidade: MetaUnidade; direcao: MetaDirecao }> = {
  LEADS_GANHOS: { unidade: 'QUANTIDADE', direcao: 'MAIOR_MELHOR' },
  LEADS_PERDIDOS: { unidade: 'QUANTIDADE', direcao: 'MENOR_MELHOR' },
  ATIVIDADE_ASSISTIDA: { unidade: 'PERCENTUAL', direcao: 'MAIOR_MELHOR' },
  MED_PERCENTUAL: { unidade: 'PERCENTUAL', direcao: 'MENOR_MELHOR' },
}

/** O padrão de um tipo, oferecido ou legado. Null quando desconhecido. */
export function padraoDoTipo(
  tipo: string,
): { unidade: MetaUnidade; direcao: MetaDirecao } | null {
  return (PADRAO_POR_TIPO as Record<string, { unidade: MetaUnidade; direcao: MetaDirecao }>)[tipo]
    ?? PADRAO_LEGADO[tipo]
    ?? null
}

/**
 * Rótulo de cada tipo de meta — FONTE ÚNICA. A tela não monta o seu.
 *
 * "MED", não "MEDs" nem "MED %": é UM indicador, e a unidade da meta é que
 * diz se o alvo é percentual ou quantidade. Carregar a unidade no rótulo era
 * o que fazia parecer que existiam dois indicadores.
 *
 * Cobre também os tipos LEGADOS, que não são oferecidos na criação mas
 * precisam de nome ao serem lidos — uma meta antiga sem rótulo apareceria na
 * tabela como `FLOATING`.
 */
export const META_TIPO_LABEL: Record<string, string> = {
  RECEITA_TARIFARIA: 'Receita Tarifária',
  TPV: 'TPV',
  SALDO_EM_CONTA: 'Saldo em Conta',
  TRANSACOES: 'Transações',
  MEDS: 'MED',
  TAKE_RATE: 'Take Rate',

  // As três de receita que alimentam a Previsão. O rótulo diz a LINHA de
  // receita, sem a palavra "meta": o contexto da tela já é o de metas, e
  // "Meta de Receita de Setup" apareceria como "Meta: Meta de Receita de
  // Setup" nas tabelas.
  RECEITA_LANCAMENTOS_WL_BAAS: 'Receita de Lançamentos WL/BaaS',
  RECEITA_SERVICOS: 'Receita de Serviços',
  RECEITA_SETUP: 'Receita de Setup',

  LEADS_GERADOS: 'Geração de Leads',
  // "Conversão de FECHAMENTO": o que se mede é quanto do que foi decidido
  // fechou, não a conversão de um lead em particular.
  CONVERSAO_LEADS: 'Conversão de Fechamento',

  // Legado: criadas antes de MED virar um indicador só, antes da revisão da
  // taxonomia, ou antes de as metas de pipeline serem reduzidas a duas.
  // Legíveis, nunca oferecidas.
  MED_PERCENTUAL: 'MED (legado — percentual)',
  LEADS_GANHOS: 'Leads Ganhos (legado)',
  LEADS_PERDIDOS: 'Leads Perdidos (legado)',
  ATIVIDADE_ASSISTIDA: 'Atividade Assistida (legado)',
  RECEITA: 'Receita (legado)',
  MRR: 'MRR (legado)',
  FLOATING: 'Floating (legado)',
  CLIENTES_ATIVOS: 'Clientes Ativos (legado)',
  NOVOS_CLIENTES: 'Novos Clientes (legado)',
  RETENCAO: 'Retenção (legado)',
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

/**
 * O indicador ACUMULA ao longo do mês?
 *
 * Depende do tipo E da unidade: MED em QUANTIDADE acumula (80 MEDs hoje, 160
 * no fim do mês); MED em PERCENTUAL não (1,5% hoje tende a 1,5% no fim). É o
 * mesmo indicador lido de duas formas, e por isso a decisão não cabe numa
 * tabela só por tipo.
 */
export function acumulaNoMes(tipo: string, unidade: MetaUnidade): boolean {
  // Proporção nunca acumula, qualquer que seja o indicador.
  if (unidade === 'PERCENTUAL') return false
  // Saldo em conta é estoque: a média parcial já estima o fechamento.
  if (tipo === 'SALDO_EM_CONTA') return false
  return true
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

  const acumula = acumulaNoMes(entrada.tipo, entrada.unidade)

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
