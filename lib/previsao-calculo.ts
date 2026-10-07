/**
 * PREVISÃO — a ARITMÉTICA, sem banco.
 *
 * Funções PURAS: recebem números e devolvem números. Nenhuma consulta, nenhum
 * relógio implícito, nenhum arredondamento escondido. É o que permite
 * verificar "orçado 100 mil, realizado 72 mil → 72% utilizado, saldo 28 mil"
 * sem Postgres — e é a mesma separação de `lib/pipeline.ts` (regras) contra
 * `lib/pipeline-db.ts` (consultas).
 *
 * As consultas e a composição moram em `lib/previsao.ts`.
 */

/** Centavos. Duas casas, arredondamento no fim de cada etapa. */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

/* ========================================================================= *
 * ORÇADO × REALIZADO
 * ========================================================================= */

export type SituacaoOrcamento =
  /** Dentro do orçamento, com folga. */
  | 'DENTRO'
  /** Perto do teto — 85% ou mais, e ainda não estourou. */
  | 'ATENCAO'
  /** Passou do orçado. */
  | 'ESTOURADO'
  /** Nada orçado para o recorte: não há teto contra o que medir. */
  | 'SEM_ORCAMENTO'

/**
 * O limiar de ATENÇÃO: 85% do orçado.
 *
 * Não é um número arbitrário disfarçado de regra — é o ponto em que ainda dá
 * para agir. A 95% o mês já está decidido; a 70% o alerta vira ruído e as
 * pessoas param de olhar. 85% deixa espaço para remanejar.
 *
 * Exportado para que a tela e o teste citem a MESMA constante, em vez de cada
 * um repetir 0.85.
 */
export const LIMIAR_ATENCAO = 0.85

export interface Execucao {
  orcado: number
  realizado: number
  /** Orçado − realizado. NEGATIVO quando estourou — e o sinal é a informação. */
  saldo: number
  /**
   * Realizado ÷ orçado, em pontos percentuais. `null` sem orçamento.
   *
   * `null` e não zero: "0% utilizado" afirma que existe um teto e nada foi
   * gasto; sem orçamento, o percentual não tem denominador e a pergunta não
   * se aplica.
   */
  utilizacao: number | null
  /**
   * DESVIO: realizado − orçado.
   *
   * Positivo = gastou/faturou MAIS que o previsto. Negativo = menos.
   *
   * É o saldo com o sinal invertido, de propósito: "saldo" responde "quanto
   * ainda posso gastar" e "desvio" responde "quanto fugi do plano". São as
   * duas perguntas que a tela faz, e dar um número só obrigaria o leitor a
   * inverter o sinal de cabeça.
   */
  desvio: number
  /** Desvio em percentual do orçado. `null` sem orçamento. */
  desvioPercentual: number | null
  situacao: SituacaoOrcamento
}

/**
 * A execução de um orçamento.
 *
 * ── A DIREÇÃO DO "BOM" DEPENDE DO TIPO, E ESTA FUNÇÃO NÃO DECIDE ────────
 *
 * Em DESPESA, estourar o orçado é ruim. Em RECEITA, superar o previsto é bom.
 * `situacao` aqui descreve o FATO ("passou do orçado"), não o julgamento —
 * quem pinta de vermelho ou verde é a tela, que sabe o tipo.
 *
 * Misturar as duas coisas aqui produziria uma função que precisa receber o
 * tipo para calcular um saldo que não depende dele.
 */
export function execucao(orcado: number, realizado: number): Execucao {
  const o = centavos(orcado)
  const r = centavos(realizado)

  if (o <= 0) {
    return {
      orcado: o,
      realizado: r,
      saldo: centavos(-r),
      utilizacao: null,
      desvio: r,
      desvioPercentual: null,
      situacao: 'SEM_ORCAMENTO',
    }
  }

  const utilizacao = (r / o) * 100
  const desvio = centavos(r - o)

  return {
    orcado: o,
    realizado: r,
    saldo: centavos(o - r),
    utilizacao,
    desvioPercentual: (desvio / o) * 100,
    desvio,
    situacao: r > o ? 'ESTOURADO' : r >= o * LIMIAR_ATENCAO ? 'ATENCAO' : 'DENTRO',
  }
}

/* ========================================================================= *
 * PREVISTO × REALIZADO
 * ========================================================================= */

export interface PrevistoRealizado {
  previsto: number
  realizado: number
  /** Realizado − previsto. */
  desvio: number
  /** Realizado ÷ previsto, em pontos percentuais. `null` sem previsão. */
  cumprimento: number | null
  /**
   * O que AINDA SE ESPERA no período: previsto − realizado, nunca negativo.
   *
   * ── É ESTE NÚMERO QUE EVITA A DUPLA CONTAGEM NO CAIXA ─────────────────
   *
   * Se novembro tem 500 mil previstos e 300 mil já lançados, a projeção de
   * caixa de novembro precisa contar 300 mil REAIS mais 200 mil de
   * EXPECTATIVA — não 800 mil. Somar previsto e realizado contaria o mesmo
   * dinheiro duas vezes, e é o erro mais comum deste tipo de painel.
   *
   * NUNCA NEGATIVO: quando o realizado já passou do previsto, o que falta é
   * zero — e não um valor negativo que subtrairia caixa que entrou de verdade.
   */
  remanescente: number
}

export function previstoRealizado(previsto: number, realizado: number): PrevistoRealizado {
  const p = centavos(previsto)
  const r = centavos(realizado)
  return {
    previsto: p,
    realizado: r,
    desvio: centavos(r - p),
    cumprimento: p > 0 ? (r / p) * 100 : null,
    remanescente: centavos(Math.max(p - r, 0)),
  }
}

/* ========================================================================= *
 * FORECAST — histórico, média, tendência e projeção
 *
 * ── O PRINCÍPIO: NÃO INVENTAR DADO ──────────────────────────────────────
 *
 * O forecast usa só o que o sistema tem. Quando o histórico é curto demais
 * para dizer qualquer coisa, a resposta é `null` e a tela declara que falta
 * histórico — nunca um número suavizado que pareça uma previsão.
 *
 * ── POR QUE O MODELO É SIMPLES ──────────────────────────────────────────
 *
 * Média dos meses fechados mais uma tendência linear. Nada de sazonalidade,
 * amortecimento exponencial ou intervalo de confiança.
 *
 * A razão é de produto, não de preguiça: a prioridade é previsibilidade
 * operacional clara. Um modelo que ninguém do financeiro consegue reproduzir
 * numa planilha é um modelo cujo número ninguém defende numa reunião — e aí o
 * forecast deixa de ser usado. Esta conta se explica em duas frases e se
 * confere à mão.
 * ========================================================================= */

/** Mínimo de meses FECHADOS com dado para o forecast existir. */
export const MINIMO_MESES_FORECAST = 3

export interface Tendencia {
  /** Variação média por mês, em valor absoluto. */
  porMes: number
  /** A tendência em percentual da média. `null` quando a média é zero. */
  percentual: number | null
  direcao: 'alta' | 'baixa' | 'estavel'
}

/**
 * A TENDÊNCIA de uma série, por mínimos quadrados.
 *
 * Devolve a inclinação da reta que melhor passa pelos pontos — isto é, quanto
 * a série sobe ou desce por mês, em média.
 *
 * ── POR QUE MÍNIMOS QUADRADOS, E NÃO "ÚLTIMO MENOS PRIMEIRO" ──────────
 *
 * "Último menos primeiro, dividido pelos meses" é mais simples e é frágil: um
 * único mês atípico nas pontas define a tendência inteira. Um mês de setup
 * grande no começo da série inverteria o sinal.
 *
 * A reta usa TODOS os pontos, então um mês fora da curva desloca o resultado
 * em vez de determiná-lo. Continua sendo uma conta de planilha — é
 * `INCLINAÇÃO()` no Excel.
 *
 * `estavel` quando a inclinação é menor que 0,5% da média: abaixo disso, a
 * "tendência" é ruído do arredondamento, e declará-la como alta ou baixa seria
 * dar significado a nada.
 */
export function tendencia(serie: number[]): Tendencia | null {
  if (serie.length < 2) return null

  const n = serie.length
  const mediaX = (n - 1) / 2
  const mediaY = serie.reduce((a, b) => a + b, 0) / n

  let numerador = 0
  let denominador = 0
  for (let i = 0; i < n; i++) {
    numerador += (i - mediaX) * (serie[i] - mediaY)
    denominador += (i - mediaX) ** 2
  }
  if (denominador === 0) return null

  const porMes = centavos(numerador / denominador)
  const percentual = mediaY !== 0 ? (porMes / Math.abs(mediaY)) * 100 : null

  return {
    porMes,
    percentual,
    direcao:
      percentual !== null && Math.abs(percentual) < 0.5 ? 'estavel'
        : porMes > 0 ? 'alta'
        : porMes < 0 ? 'baixa'
        : 'estavel',
  }
}

/** Média simples, ou `null` para série vazia — nunca zero. */
export function media(serie: number[]): number | null {
  if (serie.length === 0) return null
  return centavos(serie.reduce((a, b) => a + b, 0) / serie.length)
}

/**
 * A PROJEÇÃO DO PERÍODO EM CURSO: o realizado estendido ao mês inteiro.
 *
 * `fracaoDecorrida` é quanto do mês já passou, de 0 a 1 — a mesma grandeza que
 * `calcularPacing` usa em Metas, e pela mesma razão: o realizado parcial de um
 * mês em curso não se compara a um mês fechado sem ser estendido.
 *
 * `null` quando nada decorreu: dividir por zero daria infinito, e "projeção
 * infinita" não é uma informação.
 *
 * SÓ VALE PARA GRANDEZA QUE ACUMULA — receita, despesa, caixa. Estender um
 * saldo médio ou um percentual pelo tempo decorrido produz um número sem
 * significado (ver a mesma distinção em `calcularPacing`).
 */
export function projecaoDoPeriodo(
  realizado: number, fracaoDecorrida: number,
): number | null {
  if (fracaoDecorrida <= 0) return null
  if (fracaoDecorrida >= 1) return centavos(realizado)
  return centavos(realizado / fracaoDecorrida)
}

export interface Forecast {
  /** Meses fechados usados na conta. */
  mesesConsiderados: number
  /** Soma do que já foi realizado nos meses fechados. */
  realizadoAcumulado: number
  /** Média mensal dos meses fechados. */
  mediaHistorica: number
  tendencia: Tendencia | null
  /**
   * Projeção do MÊS EM CURSO, pelo ritmo até agora. `null` quando o mês não
   * tem realizado ou acabou de começar.
   */
  projecaoPeriodoAtual: number | null
  /**
   * O FORECAST dos próximos meses: média histórica mais a tendência
   * acumulada, mês a mês.
   *
   * Nunca NEGATIVO: uma tendência de queda forte projetaria receita negativa
   * depois de alguns meses, o que não existe. O piso é zero, e a tela mostra a
   * tendência ao lado para que a queda não desapareça da leitura.
   */
  proximosMeses: number[]
}

/**
 * O FORECAST a partir dos meses FECHADOS.
 *
 * `fechados` é a série dos meses encerrados, do mais antigo ao mais recente —
 * nunca inclui o mês em curso, que está pela metade e puxaria a média para
 * baixo por construção (é o mesmo defeito que a comparação de KPI desta
 * rodada corrige).
 *
 * `horizonte` é quantos meses à frente projetar.
 *
 * Devolve `null` com menos de `MINIMO_MESES_FORECAST` meses: dois pontos
 * definem uma reta perfeita e não dizem nada sobre tendência. Declarar falta
 * de histórico é mais útil que uma projeção que não se sustenta.
 */
export function calcularForecast(
  fechados: number[], horizonte = 3,
): Forecast | null {
  if (fechados.length < MINIMO_MESES_FORECAST) return null

  const m = media(fechados)
  if (m === null) return null

  const t = tendencia(fechados)

  return {
    mesesConsiderados: fechados.length,
    realizadoAcumulado: centavos(fechados.reduce((a, b) => a + b, 0)),
    mediaHistorica: m,
    tendencia: t,
    projecaoPeriodoAtual: null,
    proximosMeses: Array.from({ length: Math.max(0, horizonte) }, (_, i) =>
      // A tendência se acumula: o mês k à frente carrega k passos dela.
      centavos(Math.max(m + (t?.porMes ?? 0) * (i + 1), 0)),
    ),
  }
}

/* ========================================================================= *
 * FLUXO DE CAIXA
 * ========================================================================= */

export interface MovimentoCaixa {
  /** Entradas já LIQUIDADAS no período. */
  entradasRealizadas: number
  /** Títulos a receber com vencimento no período, ainda não recebidos. */
  entradasAReceber: number
  /** Receita PREVISTA que ainda não se realizou (`remanescente`). */
  entradasPrevistas: number
  /** Saídas já PAGAS no período. */
  saidasRealizadas: number
  /** Títulos a pagar com vencimento no período, ainda não pagos. */
  saidasAPagar: number
  /** Despesa futura prevista que ainda não virou lançamento. */
  saidasPrevistas: number
}

export interface PontoCaixa extends MovimentoCaixa {
  periodo: string
  /** O período já fechou? Em período fechado nada é projetado. */
  fechado: boolean
  /** Caixa acumulado ANTES deste período. */
  saldoInicial: number
  /**
   * GERAÇÃO DE CAIXA REALIZADA: entradas liquidadas − saídas pagas.
   *
   * Regime de CAIXA, não de competência. Não é o resultado contábil — ver
   * `diferencaResultadoCaixa`.
   */
  geracaoRealizada: number
  /** Tudo o que ainda se espera: a receber + previsto − a pagar − previsto. */
  geracaoProjetada: number
  /** Saldo inicial + geração realizada. O que existe de fato. */
  saldoRealizado: number
  /** Saldo realizado + geração projetada. O que se espera ter no fim. */
  saldoProjetado: number
}

/**
 * UM PONTO da curva de caixa.
 *
 * ── A CONTA, EXPLÍCITA ──────────────────────────────────────────────────
 *
 *   saldo inicial
 *     + entradas realizadas      (já em caixa)
 *     − saídas realizadas        (já pagou)
 *   = SALDO REALIZADO
 *     + títulos a receber        (vencem no período, não recebidos)
 *     + receita prevista remanescente
 *     − títulos a pagar          (vencem no período, não pagos)
 *     − despesa futura prevista
 *   = SALDO PROJETADO
 *
 * ── PERÍODO FECHADO NÃO TEM PROJEÇÃO ────────────────────────────────────
 *
 * Num mês encerrado, o saldo projetado É o realizado: não há mais nada a
 * esperar dele. Manter a projeção num mês fechado faria a curva mostrar uma
 * expectativa que o calendário já respondeu — e um título vencido e não pago
 * em março apareceria como "entrada futura de março" para sempre.
 *
 * O título vencido não desaparece: ele continua em Contas a Receber, e entra
 * na projeção do período em que for esperado. Esta função só não o soma a um
 * mês que já acabou.
 */
export function pontoCaixa(
  periodo: string,
  saldoInicial: number,
  m: MovimentoCaixa,
  fechado: boolean,
): PontoCaixa {
  const geracaoRealizada = centavos(m.entradasRealizadas - m.saidasRealizadas)
  const saldoRealizado = centavos(saldoInicial + geracaoRealizada)

  const geracaoProjetada = fechado ? 0 : centavos(
    m.entradasAReceber + m.entradasPrevistas - m.saidasAPagar - m.saidasPrevistas,
  )

  return {
    periodo,
    fechado,
    saldoInicial: centavos(saldoInicial),
    ...m,
    geracaoRealizada,
    geracaoProjetada,
    saldoRealizado,
    saldoProjetado: centavos(saldoRealizado + geracaoProjetada),
  }
}

/**
 * A CURVA de caixa: cada período parte do saldo projetado do anterior.
 *
 * ── POR QUE O ENCADEAMENTO USA O PROJETADO, E NÃO O REALIZADO ───────────
 *
 * Porque a curva responde "quanto vou ter em dezembro", e para chegar lá é
 * preciso carregar o que se espera de novembro. Encadear pelo realizado faria
 * cada mês futuro partir do caixa de hoje, e a projeção de dezembro ignoraria
 * tudo o que acontece em novembro.
 *
 * Nos meses FECHADOS os dois são iguais (ver `pontoCaixa`), então o
 * encadeamento do passado é o realizado puro — a curva só passa a projetar a
 * partir do período em curso.
 */
export function curvaCaixa(
  saldoAbertura: number,
  periodos: Array<{ periodo: string; movimento: MovimentoCaixa; fechado: boolean }>,
): PontoCaixa[] {
  const pontos: PontoCaixa[] = []
  let saldo = saldoAbertura

  for (const p of periodos) {
    const ponto = pontoCaixa(p.periodo, saldo, p.movimento, p.fechado)
    pontos.push(ponto)
    saldo = ponto.saldoProjetado
  }

  return pontos
}

export interface DiferencaResultadoCaixa {
  /** Receita − despesa por COMPETÊNCIA (a data do lançamento). */
  resultadoContabil: number
  /** Entradas liquidadas − saídas pagas (regime de CAIXA). */
  geracaoCaixa: number
  /** Resultado contábil − geração de caixa. */
  diferenca: number
}

/**
 * A DIFERENÇA ENTRE RESULTADO CONTÁBIL E GERAÇÃO DE CAIXA.
 *
 * Existe como função — e não como duas subtrações soltas na tela — porque é
 * uma pergunta que o painel tem de responder em voz alta.
 *
 * São coisas diferentes, e confundi-las é o erro clássico deste tipo de
 * relatório:
 *
 *   RESULTADO CONTÁBIL  mede COMPETÊNCIA: a receita do mês em que foi
 *                       apurada, a despesa do mês em que foi incorrida.
 *                       É o lucro do período.
 *
 *   GERAÇÃO DE CAIXA    mede LIQUIDAÇÃO: o que entrou e o que saiu de fato.
 *                       É o dinheiro do período.
 *
 * Um mês pode ter resultado positivo e caixa negativo — faturou e não recebeu,
 * pagou o que devia do mês anterior. A diferença entre os dois É o capital de
 * giro do período, e é exatamente o número que explica por que "demos lucro" e
 * "não tem dinheiro na conta" podem ser verdade ao mesmo tempo.
 */
export function diferencaResultadoCaixa(
  resultadoContabil: number, geracaoCaixa: number,
): DiferencaResultadoCaixa {
  return {
    resultadoContabil: centavos(resultadoContabil),
    geracaoCaixa: centavos(geracaoCaixa),
    diferenca: centavos(resultadoContabil - geracaoCaixa),
  }
}

/* ========================================================================= *
 * RECORRÊNCIA DE DESPESA FUTURA
 * ========================================================================= */

/**
 * As OCORRÊNCIAS de uma despesa futura dentro de uma janela de períodos.
 *
 * ── POR QUE A RECORRÊNCIA É EXPANDIDA NA LEITURA ────────────────────────
 *
 * `LancamentoFinanceiro` MATERIALIZA recorrência: um cadastro em 6x gera 6
 * linhas. Aqui é o contrário, e a razão é o horizonte: uma folha de pagamento
 * recorrente "sem data final" não tem quantas linhas materializar. Escolher um
 * número — 12? 60? — seria inventar um fim que ninguém definiu, e revisá-lo
 * depois obrigaria a reescrever linhas gravadas.
 *
 * Então a linha é UMA, e a projeção expande até onde a consulta pergunta. A
 * janela é sempre finita, então a expansão sempre termina.
 *
 * `periodos` são "YYYY-MM", ordenados. Devolve os períodos em que a despesa
 * ocorre, com o valor de cada ocorrência.
 */
export interface OcorrenciaDespesa {
  periodo: string
  valor: number
}

export function ocorrenciasDespesa(
  d: {
    valor: number
    dataPrevista: Date
    recorrencia: 'UNICA' | 'RECORRENTE' | 'PARCELADA'
    recorrenciaFim: Date | null
  },
  periodos: string[],
): OcorrenciaDespesa[] {
  const mesDe = (data: Date) =>
    `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`

  const inicio = mesDe(d.dataPrevista)

  // ÚNICA e PARCELADA ocorrem UMA vez, no mês da data prevista.
  //
  // PARCELADA é tratada como única de propósito: a parcela JÁ É uma linha. O
  // cadastro de uma despesa em 6x cria seis despesas futuras, uma por
  // vencimento — do mesmo jeito que `LancamentoFinanceiro` faz. Expandir aqui
  // e materializar lá contaria a mesma parcela duas vezes.
  if (d.recorrencia !== 'RECORRENTE') {
    return periodos.includes(inicio)
      ? [{ periodo: inicio, valor: centavos(d.valor) }]
      : []
  }

  const fim = d.recorrenciaFim ? mesDe(d.recorrenciaFim) : null

  return periodos
    // Antes da data prevista não há despesa: a recorrência começa quando
    // começa, e não no início da janela consultada.
    .filter((p) => p >= inicio && (fim === null || p <= fim))
    .map((p) => ({ periodo: p, valor: centavos(d.valor) }))
}


/* ========================================================================= *
 * VOCABULÁRIO DA TELA — listas e rótulos
 *
 * ── POR QUE AQUI, E NÃO EM lib/previsao.ts ──────────────────────────────
 *
 * `lib/previsao.ts` importa Prisma, que importa `pg`, que faz `require('fs')`.
 * Um Client Component que importasse estas listas de lá arrastaria o driver do
 * Postgres para o bundle do navegador, e o BUILD FALHARIA com
 * "Module not found: Can't resolve 'fs'".
 *
 * `tsc` não pega esse erro — importar módulo de servidor num componente de
 * cliente é TypeScript válido. Só o bundler reclama, e só no build de
 * produção. Por isso o vocabulário vive neste módulo, que é puro, e
 * `lib/previsao.ts` o REEXPORTA para o código de servidor.
 * ========================================================================= */

/** As janelas que a tela oferece. Conjunto FECHADO. */
export const JANELAS_MESES = [1, 3, 12] as const
export type JanelaMeses = typeof JANELAS_MESES[number]

export const JANELA_LABEL: Record<JanelaMeses, string> = {
  1: 'Mês',
  3: 'Trimestre',
  12: 'Ano',
}

/** Os status de previsão que o produto oferece, e os rótulos da tela. */
export const STATUS_PREVISAO = ['PREVISTO', 'CONFIRMADO', 'REALIZADO', 'CANCELADO'] as const
export type StatusPrevisao = typeof STATUS_PREVISAO[number]

export const STATUS_PREVISAO_LABEL: Record<StatusPrevisao, string> = {
  PREVISTO: 'Previsto',
  CONFIRMADO: 'Confirmado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
}

export const STATUS_ORCAMENTO = ['RASCUNHO', 'APROVADO', 'ENCERRADO'] as const
export type StatusOrcamentoValor = typeof STATUS_ORCAMENTO[number]

export const STATUS_ORCAMENTO_LABEL: Record<StatusOrcamentoValor, string> = {
  RASCUNHO: 'Rascunho',
  APROVADO: 'Aprovado',
  ENCERRADO: 'Encerrado',
}

export const RECORRENCIAS = ['UNICA', 'RECORRENTE', 'PARCELADA'] as const
export type Recorrencia = typeof RECORRENCIAS[number]

export const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
  UNICA: 'Única',
  RECORRENTE: 'Recorrente',
  PARCELADA: 'Parcelada',
}

/* ========================================================================= *
 * RECEITA PREVISTA — a composição, e os rótulos que a tela usa
 *
 * A FÓRMULA:
 *
 *   RECEITA PREVISTA = MRR PROJETADO
 *                    + META DE RECEITA TARIFÁRIA
 *                    + META DE RECEITA DE LANÇAMENTOS WL/BAAS
 *                    + META DE RECEITA DE SERVIÇOS
 *                    + META DE RECEITA DE SETUP
 *                    + RECEITAS PREVISTAS LANÇADAS
 *
 * ── POR QUE ESTES SEIS, E POR QUE ELES NÃO SE SOBREPÕEM ─────────────────
 *
 * MRR PROJETADO é CONTRATO: sustentação das condições comerciais mais
 * mensalidade de API da carteira inteira. Vem do cadastro, não de alvo — já
 * está assinado.
 *
 * AS QUATRO METAS são DECISÃO: as linhas de receita que ninguém assina com
 * antecedência. Cada uma é uma fonte distinta de faturamento —
 *
 *   tarifária            a tarifa sobre o TPV PRÓPRIO (Lançamento Diário)
 *   lançamentos WL/BaaS  a apuração dos PARCEIROS (Lançamento BaaS)
 *   serviços             serviços contratados
 *   setup                implantação
 *
 * — e nenhuma delas é sustentação nem mensalidade de API. Metar sustentação
 * seria contar duas vezes o mesmo contrato, uma pelo MRR e outra pela meta;
 * é a dupla contagem mais provável desta conta, e é por isso que está escrita
 * aqui e no enum `MetaTipo`.
 *
 * RECEITAS PREVISTAS LANÇADAS é o cadastro manual que já existia
 * (`ReceitaPrevista`). Ele continua inteiro — lançar, editar, filtrar por
 * centro de custo — e entra como SEXTO componente em vez de ser somado à
 * parte. Fosse somado à parte, a tela teria dois totais de "receita prevista"
 * e ninguém saberia qual usar; fosse removido, uma função existente morreria
 * na consolidação.
 *
 * Quando não há linha lançada — que é o caso hoje — o total é exatamente a
 * fórmula de cinco termos.
 *
 * ── METAS EM PERCENTUAL FICAM FORA ──────────────────────────────────────
 *
 * Uma meta de receita pode ser gravada com unidade PERCENTUAL (o cadastro
 * aceita), e um percentual não tem o que somar em reais. Ela é IGNORADA na
 * composição e DECLARADA como ignorada — somá-la como se fosse valor
 * acrescentaria "3" a um total em milhões.
 * ========================================================================= */

export const COMPONENTES_RECEITA_PREVISTA = [
  'MRR_PROJETADO',
  'META_TARIFARIA',
  'META_LANCAMENTOS_WL_BAAS',
  'META_SERVICOS',
  'META_SETUP',
  'RECEITAS_LANCADAS',
] as const

export type ComponenteReceita = typeof COMPONENTES_RECEITA_PREVISTA[number]

export const COMPONENTE_RECEITA_LABEL: Record<ComponenteReceita, string> = {
  MRR_PROJETADO: 'MRR projetado',
  META_TARIFARIA: 'Meta de receita tarifária',
  META_LANCAMENTOS_WL_BAAS: 'Meta de receita de lançamentos WL/BaaS',
  META_SERVICOS: 'Meta de receita de serviços',
  META_SETUP: 'Meta de receita de setup',
  RECEITAS_LANCADAS: 'Receitas previstas lançadas',
}

/** O tipo de meta que alimenta cada componente. `null` nos dois que não são meta. */
export const META_DO_COMPONENTE: Record<ComponenteReceita, string | null> = {
  MRR_PROJETADO: null,
  META_TARIFARIA: 'RECEITA_TARIFARIA',
  META_LANCAMENTOS_WL_BAAS: 'RECEITA_LANCAMENTOS_WL_BAAS',
  META_SERVICOS: 'RECEITA_SERVICOS',
  META_SETUP: 'RECEITA_SETUP',
  RECEITAS_LANCADAS: null,
}

/**
 * Uma LINHA de composição de um componente — a origem auditável.
 *
 * É o que responde "de onde saiu este número" sem abrir outra tela: o MRR
 * projetado se abre em sustentação BaaS, sustentação White Label e as duas
 * mensalidades de API; cada meta se abre no período e no valor gravados.
 */
export interface LinhaOrigemReceita {
  label: string
  valor: number
  /** Onde conferir. `null` quando o componente não tem tela própria. */
  rota?: string | null
}

export interface ComponenteReceitaPrevista {
  chave: ComponenteReceita
  label: string
  valor: number
  /** De onde o número sai, em uma frase. A tela mostra isto, não deduz. */
  origem: string
  /** A tela onde o número é mantido. `null` quando não há uma. */
  rota: string | null
  /** A composição interna, quando há. */
  linhas: LinhaOrigemReceita[]
  /**
   * A FONTE do componente não existe para este período.
   *
   * Diferente de valor zero: "meta de setup não cadastrada" e "meta de setup
   * de R$ 0" são afirmações distintas, e a tela precisa poder separá-las em
   * vez de mostrar R$ 0,00 nas duas.
   */
  ausente: boolean
}

export interface ReceitaPrevistaComposta {
  periodo: string
  total: number
  componentes: ComponenteReceitaPrevista[]
  /** Quantos componentes estão sem fonte cadastrada. */
  ausentes: number
  /**
   * Metas do período gravadas em PERCENTUAL, que a composição ignorou.
   *
   * Declaradas para que o total não pareça errado a quem cadastrou a meta —
   * ver o cabeçalho desta seção.
   */
  ignoradasPorUnidade: string[]
}

/** O total de uma composição. Soma única, em centavos. */
export function totalDaComposicao(componentes: ComponenteReceitaPrevista[]): number {
  return centavos(componentes.reduce((a, c) => a + c.valor, 0))
}
