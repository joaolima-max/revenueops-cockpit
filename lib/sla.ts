/**
 * SLA POR ETAPA DO PIPELINE — as regras, sem banco.
 *
 * Funções PURAS: recebem o instante de entrada na etapa, o SLA configurado e a
 * hora de referência, e devolvem o estado. Nenhuma consulta e nenhum relógio
 * implícito — é o que permite verificar "8 dias numa etapa de 5 está 3 dias
 * atrasado" sem esperar oito dias.
 *
 * As consultas e as escritas moram em `lib/pipeline-db.ts` e nas rotas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O RELÓGIO REINICIA A CADA ETAPA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É a regra central, e a mais fácil de errar: o SLA NÃO é medido desde a
 * criação do card.
 *
 *   Prospecção   3 dias  →  o card passa 3 dias ali
 *   Qualificação 5 dias  →  o relógio da Qualificação começa NAQUELE momento
 *
 * Medir desde `createdAt` faria um card que acabou de chegar em Proposta
 * aparecer como vencido por causa do tempo que passou em Prospecção — e o
 * indicador acusaria atraso de quem acabou de receber o card.
 *
 * O marco zero é `Deal.etapaEntradaEm`, gravado a cada mudança de etapa na
 * MESMA transação que registra a movimentação (ver `registrarMovimentacao`).
 * O histórico canônico continua sendo `PipelineMovimentacao`; a coluna é
 * derivada dele, para que o quadro não precise de uma subconsulta por card.
 */

/** Um dia, em milissegundos. */
const DIA_MS = 86_400_000

/**
 * A fração do SLA a partir da qual o card entra em "próximo do vencimento".
 *
 * 75% — e o número tem razão de ser. Num SLA de 4 dias, avisa no dia 3: sobra
 * um dia para agir. A 90% o aviso chega quando já não há o que fazer; a 50% ele
 * dispara na metade de todos os cards, e um alerta que sempre está aceso deixa
 * de ser lido.
 *
 * Exportado para que a tela, o alerta e o teste citem a MESMA constante em vez
 * de cada um repetir 0.75.
 */
export const FRACAO_PROXIMO = 0.75

export type EstadoSla =
  /** Dentro do prazo, com folga. */
  | 'DENTRO'
  /** Passou de `FRACAO_PROXIMO` do SLA e ainda não venceu. */
  | 'PROXIMO'
  /** Passou do SLA. */
  | 'VENCIDO'
  /**
   * A etapa NÃO TEM SLA configurado.
   *
   * Estado de primeira classe, e não um `null` tratado como "dentro": uma
   * etapa sem prazo definido é diferente de uma etapa cujo prazo está sendo
   * cumprido, e a tela precisa poder dizer qual é qual. Confundir as duas faria
   * toda etapa não configurada aparecer como verde, escondendo que ninguém
   * definiu prazo para ela.
   */
  | 'SEM_SLA'

export interface Sla {
  estado: EstadoSla
  /** Dias corridos desde a entrada na etapa. Fracionário. */
  diasNaEtapa: number
  /** O SLA configurado, em dias. `null` quando a etapa não tem. */
  slaDias: number | null
  /**
   * Dias que faltam para vencer. Negativo quando já venceu; `null` sem SLA.
   */
  diasRestantes: number | null
  /**
   * Dias de ATRASO — zero quando não venceu, `null` sem SLA.
   *
   * É `-diasRestantes` quando negativo, e existe como campo próprio porque é o
   * número que o alerta mostra: "atraso: 3 dias" se lê, e "faltam −3 dias" não.
   */
  atrasoDias: number | null
  /** `diasNaEtapa / slaDias`, de 0 a ∞. `null` sem SLA. */
  consumo: number | null
}

/**
 * O estado de SLA de um card.
 *
 * `entradaEm` nulo devolve `SEM_SLA`: um card sem marco zero não tem relógio
 * para medir. Acontece com cards anteriores ao registro de movimentações — a
 * migration v28 os preenche a partir do histórico e, na falta dele, de
 * `createdAt`, mas o código não pode supor que a coluna esteja sempre cheia.
 *
 * `slaDias` nulo ou não positivo também devolve `SEM_SLA`. Zero não é um SLA de
 * zero dias: é a ausência de um, e tratá-lo como prazo faria todo card vencer
 * no instante em que entrasse na etapa.
 */
export function slaDoCard(
  entradaEm: Date | string | null | undefined,
  slaDias: number | null | undefined,
  agora: Date = new Date(),
): Sla {
  const semSla: Sla = {
    estado: 'SEM_SLA',
    diasNaEtapa: 0,
    slaDias: null,
    diasRestantes: null,
    atrasoDias: null,
    consumo: null,
  }

  if (!entradaEm) return semSla
  if (typeof slaDias !== 'number' || !Number.isFinite(slaDias) || slaDias <= 0) {
    // SEM SLA, mas o tempo na etapa é um fato e continua útil: a tela mostra
    // "12 dias nesta etapa" mesmo sem prazo configurado.
    const entrada = new Date(entradaEm)
    const dias = Number.isNaN(entrada.getTime())
      ? 0
      : Math.max(0, (agora.getTime() - entrada.getTime()) / DIA_MS)
    return { ...semSla, diasNaEtapa: dias }
  }

  const entrada = new Date(entradaEm)
  if (Number.isNaN(entrada.getTime())) return semSla

  /**
   * NUNCA NEGATIVO.
   *
   * Uma entrada no futuro — relógio do servidor atrasado, dado importado com
   * data errada — produziria dias negativos, e o card apareceria como "dentro
   * do SLA" por um prazo que ainda não começou. Zero é a leitura honesta: o
   * card acabou de chegar.
   */
  const diasNaEtapa = Math.max(0, (agora.getTime() - entrada.getTime()) / DIA_MS)
  const diasRestantes = slaDias - diasNaEtapa
  const consumo = diasNaEtapa / slaDias

  return {
    estado: diasNaEtapa > slaDias ? 'VENCIDO'
      : consumo >= FRACAO_PROXIMO ? 'PROXIMO'
      : 'DENTRO',
    diasNaEtapa,
    slaDias,
    diasRestantes,
    atrasoDias: diasRestantes < 0 ? -diasRestantes : 0,
    consumo,
  }
}

/** Rótulo do estado, como a tela o escreve. */
export const ESTADO_SLA_LABEL: Record<EstadoSla, string> = {
  DENTRO: 'Dentro do SLA',
  PROXIMO: 'Próximo do vencimento',
  VENCIDO: 'SLA vencido',
  SEM_SLA: 'Sem SLA',
}

/**
 * Dias em texto, para o alerta e o card.
 *
 * Arredonda para baixo em dias inteiros porque é como se fala de prazo: "3
 * dias" e não "3,4 dias". A precisão fracionária existe no cálculo — ela é o
 * que decide o estado —, mas não na leitura.
 */
export function diasTexto(dias: number): string {
  const n = Math.floor(dias)
  if (n < 1) {
    const horas = Math.floor(dias * 24)
    if (horas < 1) return 'menos de 1 hora'
    return `${horas} ${horas === 1 ? 'hora' : 'horas'}`
  }
  return `${n} ${n === 1 ? 'dia' : 'dias'}`
}

/* ========================================================================= *
 * VALIDAÇÃO DA CONFIGURAÇÃO
 * ========================================================================= */

/**
 * Teto do SLA, em dias: 365.
 *
 * Não é um limite técnico — é o ponto em que o número deixa de ser um SLA. Um
 * prazo de dois anos para uma etapa comercial não é acompanhamento, é ausência
 * dele, e aceitar 99999 só esconderia um erro de digitação atrás de um card
 * eternamente verde.
 */
export const SLA_MAX_DIAS = 365

/**
 * Valida o SLA informado para uma etapa.
 *
 * `null` é VÁLIDO e significa "sem SLA" — é assim que se remove o prazo de uma
 * etapa. Zero NÃO é: ele seria lido como um SLA de zero dias e faria todo card
 * vencer ao entrar.
 *
 * Devolve o valor normalizado, ou a mensagem que impede gravar.
 */
export function validarSla(valor: unknown): number | null | string {
  if (valor === null || valor === undefined || valor === '') return null

  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n)) return 'Informe o SLA em dias, ou deixe em branco para nenhum.'
  if (!Number.isInteger(n)) return 'O SLA deve ser um número inteiro de dias.'
  if (n <= 0) {
    return 'O SLA deve ser de pelo menos 1 dia. Deixe em branco para a etapa não ter SLA.'
  }
  if (n > SLA_MAX_DIAS) return `O SLA deve ser de no máximo ${SLA_MAX_DIAS} dias.`

  return n
}

/* ========================================================================= *
 * O ALERTA
 * ========================================================================= */

export interface CardParaAlerta {
  id: string
  titulo: string
  /** Nome da empresa ou do lead — quem o alerta identifica. */
  empresa: string
  funil: string
  /** Nome da etapa, para a mensagem. */
  etapa: string
  /**
   * ID da etapa, para a CHAVE de idempotência.
   *
   * Separado do nome de propósito: renomear "Proposta" não deve reabrir avisos
   * já enviados, e uma chave construída sobre o nome faria exatamente isso.
   */
  etapaId: string
  responsavelId: string
  responsavelNome: string
  entradaEm: Date | null
  slaDias: number | null
}

export interface AlertaSla {
  destinatarioId: string
  titulo: string
  mensagem: string
  cardId: string
  /** Idempotência: identifica o EVENTO, não a mensagem. */
  chave: string
  sla: Sla
}

/**
 * A CHAVE de idempotência de um alerta de SLA.
 *
 * `sla:<cardId>:<etapaId>:<marco>:<destinatario>`
 *
 * ── POR QUE A ETAPA ENTRA NA CHAVE ──────────────────────────────────────
 *
 * Porque o SLA reinicia a cada etapa. Sem ela, um card que vence em Proposta,
 * avança para Negociação e vence de novo não receberia o segundo aviso — a
 * chave seria a mesma, e o banco recusaria a inserção.
 *
 * ── POR QUE O MARCO ENTRA ───────────────────────────────────────────────
 *
 * Para que o aviso de "próximo do vencimento" e o de "vencido" sejam eventos
 * diferentes: o primeiro não deve impedir o segundo.
 *
 * ── E POR QUE NÃO ENTRA A DATA ──────────────────────────────────────────
 *
 * Um card vencido continua vencido todos os dias. Com a data na chave, o
 * responsável receberia o mesmo aviso toda manhã até mover o card — e um aviso
 * que chega todo dia deixa de ser lido. Então o alerta sai UMA VEZ por etapa e
 * por marco; o atraso continua visível no próprio quadro.
 *
 * É a mesma decisão que `lib/lembretes.ts` tomou para o aviso de atraso ("só o
 * -1 é tratado como 'a partir de'").
 */
export function chaveAlertaSla(
  cardId: string, etapaId: string, marco: 'PROXIMO' | 'VENCIDO', destinatarioId: string,
): string {
  return `sla:${cardId}:${etapaId}:${marco}:${destinatarioId}`
}

/**
 * Os alertas de SLA a criar, a partir dos cards abertos.
 *
 * ── O QUE O ALERTA DIZ ──────────────────────────────────────────────────
 *
 * Tudo o que o pedido lista: empresa/lead, funil, etapa, responsável, tempo
 * transcorrido, SLA configurado e quanto está atrasado. Um alerta que diz só
 * "SLA vencido" obriga a abrir o card para saber de qual card se trata.
 *
 * ── CARD SEM RESPONSÁVEL NÃO GERA ALERTA ────────────────────────────────
 *
 * Não há a quem avisar, e mandar para "todo mundo" transformaria o alerta em
 * ruído para quem não pode agir. O card sem dono continua visível no quadro com
 * o indicador — que é onde essa ausência aparece.
 *
 * Função PURA: recebe os cards e a hora, devolve os avisos. Quem consulta e
 * quem grava é a rota do cron.
 */
export function alertasDeSla(
  cards: CardParaAlerta[], agora: Date = new Date(),
): AlertaSla[] {
  const saida: AlertaSla[] = []

  for (const c of cards) {
    if (!c.responsavelId) continue

    const sla = slaDoCard(c.entradaEm, c.slaDias, agora)
    if (sla.estado !== 'VENCIDO' && sla.estado !== 'PROXIMO') continue

    const vencido = sla.estado === 'VENCIDO'

    /**
     * O CORPO DO ALERTA, com os sete campos do pedido.
     *
     * Em linhas separadas de propósito: a central de notificações mostra a
     * mensagem inteira, e um parágrafo corrido com sete informações não se lê
     * em dois segundos — que é o tempo que um alerta tem.
     */
    const mensagem = [
      `Empresa: ${c.empresa}`,
      `Funil: ${c.funil}`,
      `Etapa: ${c.etapa}`,
      `Responsável: ${c.responsavelNome}`,
      `SLA: ${diasTexto(c.slaDias ?? 0)}`,
      `Tempo na etapa: ${diasTexto(sla.diasNaEtapa)}`,
      vencido
        ? `Atraso: ${diasTexto(sla.atrasoDias ?? 0)}`
        : `Vence em: ${diasTexto(Math.max(0, sla.diasRestantes ?? 0))}`,
    ].join('\n')

    saida.push({
      destinatarioId: c.responsavelId,
      titulo: vencido
        ? `SLA vencido: ${c.empresa} em ${c.etapa}`
        : `SLA perto de vencer: ${c.empresa} em ${c.etapa}`,
      mensagem,
      cardId: c.id,
      chave: chaveAlertaSla(
        c.id, c.etapaId, vencido ? 'VENCIDO' : 'PROXIMO', c.responsavelId,
      ),
      sla,
    })
  }

  return saida
}

/* ========================================================================= *
 * HISTÓRICO — quanto tempo o card passou em cada etapa
 * ========================================================================= */

export interface PassagemEtapa {
  etapaId: string
  etapaNome: string
  funilNome: string
  entrouEm: Date
  /** `null` na etapa ATUAL: ela ainda não terminou. */
  saiuEm: Date | null
  /** Dias que o card passou ali. Na etapa atual, até agora. */
  dias: number
  /** O SLA da etapa na configuração ATUAL. `null` quando não tem. */
  slaDias: number | null
  /**
   * A passagem cumpriu o SLA?
   *
   * `null` quando a etapa não tem SLA — e não `false`: "não cumpriu" e "não
   * havia prazo" são coisas diferentes, e colapsá-las faria toda etapa sem
   * configuração aparecer como descumprida no histórico.
   */
  dentroDoSla: boolean | null
}

export interface MovimentoHistorico {
  etapaDestinoId: string
  etapaDestinoNome: string
  funilDestinoNome: string
  createdAt: Date
}

/**
 * Reconstrói QUANTO TEMPO o card passou em cada etapa, do histórico.
 *
 * ── POR QUE RECONSTRUIR, E NÃO GRAVAR A DURAÇÃO ─────────────────────────
 *
 * Porque a duração é derivada: ela é a diferença entre duas movimentações que
 * já estão gravadas. Uma coluna `duracao` seria um terceiro registro do mesmo
 * fato, e divergiria da primeira correção de histórico — e correções acontecem
 * (um card movido por engano e devolvido).
 *
 * `movimentos` deve vir ORDENADO do mais antigo para o mais recente, e conter
 * só os que MUDAM de etapa (criação, movimento, transferência). Mudança de
 * resultado não move o card de lugar: incluí-la criaria uma passagem de
 * duração zero na mesma etapa.
 *
 * `slaPorEtapa` é a configuração ATUAL. Isso é deliberado e tem um custo
 * conhecido: mudar o SLA de uma etapa reavalia o histórico inteiro dela. A
 * alternativa — fotografar o SLA em cada movimentação — guardaria um prazo por
 * linha e faria a tela de configuração parecer não ter efeito sobre o passado.
 * Entre as duas, a leitura "com o prazo de hoje, estas passagens teriam
 * cumprido" é a mais útil, e é a que a tela declara.
 */
export function passagensPorEtapa(
  movimentos: MovimentoHistorico[],
  slaPorEtapa: Map<string, number | null>,
  agora: Date = new Date(),
): PassagemEtapa[] {
  return movimentos.map((m, i) => {
    const proximo = movimentos[i + 1]
    const saiuEm = proximo ? proximo.createdAt : null
    const fim = saiuEm ?? agora
    const dias = Math.max(0, (fim.getTime() - m.createdAt.getTime()) / DIA_MS)
    const slaDias = slaPorEtapa.get(m.etapaDestinoId) ?? null

    return {
      etapaId: m.etapaDestinoId,
      etapaNome: m.etapaDestinoNome,
      funilNome: m.funilDestinoNome,
      entrouEm: m.createdAt,
      saiuEm,
      dias,
      slaDias,
      dentroDoSla: typeof slaDias === 'number' && slaDias > 0 ? dias <= slaDias : null,
    }
  })
}
