/**
 * ANALÍTICA COMERCIAL — a Visão geral.
 *
 * Funções PURAS sobre listas já carregadas. Nenhuma consulta aqui: quem busca
 * é a API, que passa os mesmos registros para todos os cortes. Isso garante
 * que "Leads por segmento" e "Leads por etapa" somem o mesmo total — dois
 * SELECTs diferentes para a mesma pergunta é como as telas começam a discordar.
 *
 * NENHUM VALOR MONETÁRIO. O valor comercial de um lead não está validado, e
 * por isso não existe aqui: nem KPI, nem série, nem ranking, nem tooltip.
 * Contagem, percentual e tempo são as únicas unidades.
 */

export type Resultado = 'EM_ANDAMENTO' | 'GANHO' | 'PERDIDO'

export interface LeadBruto {
  id: string
  /** Enum `Segmento`, ou null quando o cadastro não informou. */
  segmento: string | null
  criadoEm: Date
  /** Etapa do card mais recente do lead. Null quando o lead não está no Pipeline. */
  etapaId: string | null
  /** Desfecho do card. Null quando o lead nunca entrou no Pipeline. */
  resultado: Resultado | null
  /** Responsável do card. É o "responsável definido" da atividade assistida. */
  responsavelId: string | null
  /**
   * Há tarefa ou follow-up EM ABERTO, com responsável, para o cliente deste
   * lead. Calculado pela API; aqui entra como fato.
   */
  temAtividadeAberta: boolean
}

export interface Fatia {
  chave: string
  label: string
  total: number
  /** Percentual do total da base. Null quando a base é vazia — nunca 0%. */
  percentual: number | null
}

function fatias(
  contagem: Map<string, number>, base: number, label: (k: string) => string,
): Fatia[] {
  return [...contagem.entries()]
    .map(([chave, total]) => ({
      chave, label: label(chave), total,
      percentual: base > 0 ? (total / base) * 100 : null,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
}

/* ========================================================================= *
 * DISTRIBUIÇÕES
 * ========================================================================= */

/**
 * Leads por segmento.
 *
 * Lead sem segmento entra como "Não informado" em vez de ser descartado: um
 * gráfico que soma menos que a base faz o leitor procurar o erro na conta.
 */
export function leadsPorSegmento(
  leads: LeadBruto[], label: (s: string) => string = (s) => s,
): Fatia[] {
  const c = new Map<string, number>()
  for (const l of leads) {
    const k = l.segmento ?? '__SEM__'
    c.set(k, (c.get(k) ?? 0) + 1)
  }
  return fatias(c, leads.length, (k) => (k === '__SEM__' ? 'Não informado' : label(k)))
}

/**
 * Leads por etapa do funil — só os que estão no Pipeline e ainda ABERTOS.
 *
 * Card decidido sai da contagem: um lead ganho em Negociação não é "um lead
 * em Negociação", é um lead ganho. Contá-lo na etapa infla a coluna com
 * trabalho que já terminou.
 *
 * As etapas entram na ORDEM DO FUNIL, com zero quando vazias — uma etapa que
 * desaparece do gráfico por não ter lead esconde exatamente o buraco que o
 * gráfico existe para mostrar.
 */
export function leadsPorEtapa(
  leads: LeadBruto[], etapas: Array<{ id: string; nome: string }>,
): Fatia[] {
  const abertos = leads.filter((l) => l.resultado === 'EM_ANDAMENTO' && l.etapaId)
  const c = new Map<string, number>()
  for (const l of abertos) c.set(l.etapaId!, (c.get(l.etapaId!) ?? 0) + 1)

  return etapas.map((e) => ({
    chave: e.id,
    label: e.nome,
    total: c.get(e.id) ?? 0,
    percentual: abertos.length > 0 ? ((c.get(e.id) ?? 0) / abertos.length) * 100 : null,
  }))
}

export interface CelulaMatriz {
  segmento: string
  segmentoLabel: string
  /** Uma entrada por etapa, na ordem do funil. */
  porEtapa: number[]
  total: number
}

/**
 * SEGMENTO × ETAPA — quais segmentos estão em cada etapa.
 *
 * Mesma base de `leadsPorEtapa` (abertos, no Pipeline), para que as duas
 * visões fechem. Linhas ordenadas por volume, e segmento sem nenhum lead
 * aberto não vira linha: a matriz cresceria com linhas de zeros.
 */
export function segmentoPorEtapa(
  leads: LeadBruto[],
  etapas: Array<{ id: string; nome: string }>,
  label: (s: string) => string = (s) => s,
): CelulaMatriz[] {
  const abertos = leads.filter((l) => l.resultado === 'EM_ANDAMENTO' && l.etapaId)
  const indice = new Map(etapas.map((e, i) => [e.id, i]))

  const porSegmento = new Map<string, number[]>()
  for (const l of abertos) {
    const i = indice.get(l.etapaId!)
    if (i === undefined) continue
    const k = l.segmento ?? '__SEM__'
    const linha = porSegmento.get(k) ?? new Array(etapas.length).fill(0)
    linha[i] += 1
    porSegmento.set(k, linha)
  }

  return [...porSegmento.entries()]
    .map(([k, porEtapa]) => ({
      segmento: k,
      segmentoLabel: k === '__SEM__' ? 'Não informado' : label(k),
      porEtapa,
      total: porEtapa.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total || a.segmentoLabel.localeCompare(b.segmentoLabel))
}

/* ========================================================================= *
 * ATIVIDADE ASSISTIDA
 * ========================================================================= */

/**
 * ATIVIDADE ASSISTIDA — quantos leads estão de fato sendo acompanhados.
 *
 * A definição usa só o que o modelo já grava, sem inventar atividade:
 *
 *   um lead está em atividade assistida quando tem um card ABERTO no Pipeline
 *   com RESPONSÁVEL definido, ou uma tarefa / follow-up EM ABERTO com
 *   responsável.
 *
 * As duas condições são a mesma ideia — existe trabalho comercial agendado e
 * alguém respondendo por ele. Card aberto sem responsável NÃO conta: é
 * justamente o lead que ninguém está tocando, e contá-lo transformaria o
 * indicador em mais uma contagem de pipeline.
 *
 * O denominador é a base inteira de leads, inclusive os que nunca entraram no
 * Pipeline: a pergunta é "que fração da base está sendo trabalhada".
 */
export function emAtividadeAssistida(leads: LeadBruto[]): Fatia {
  const n = leads.filter(
    (l) => (l.resultado === 'EM_ANDAMENTO' && !!l.responsavelId) || l.temAtividadeAberta,
  ).length

  return {
    chave: 'ATIVIDADE_ASSISTIDA',
    label: 'Em atividade assistida',
    total: n,
    percentual: leads.length > 0 ? (n / leads.length) * 100 : null,
  }
}

/* ========================================================================= *
 * PERÍODO E COMPARATIVOS
 * ========================================================================= */

/** "YYYY-MM" da data, em UTC — mesma convenção de `lib/periodo`. */
export function periodoDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** O período anterior a "YYYY-MM". */
export function periodoAnterior(periodo: string): string {
  const [ano, mes] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 2, 1))
  return periodoDe(d)
}

/** Leads CRIADOS no período. */
export function geradosNoPeriodo(leads: LeadBruto[], periodo: string): number {
  return leads.filter((l) => periodoDe(l.criadoEm) === periodo).length
}

export interface Comparativo {
  atual: number
  anterior: number
  /** Variação percentual. Null quando o anterior é zero — não existe "∞%". */
  variacao: number | null
}

/**
 * Compara dois períodos.
 *
 * Anterior zero devolve variação NULL, não 100% nem infinito: sair de zero não
 * é um crescimento percentual, é um começo. A tela mostra os dois números e
 * deixa o leitor concluir.
 */
export function comparar(atual: number, anterior: number): Comparativo {
  return {
    atual, anterior,
    variacao: anterior > 0 ? ((atual - anterior) / anterior) * 100 : null,
  }
}

/**
 * Taxa de conversão sobre os DECIDIDOS.
 *
 * Incluir os cards em aberto no denominador puniria pipeline cheio: entrar
 * cinquenta leads novos derrubaria a conversão sem nenhuma perda ter
 * acontecido. Null quando nada foi decidido — nunca 0%.
 */
export function taxaConversao(ganhos: number, perdidos: number): number | null {
  const decididos = ganhos + perdidos
  return decididos > 0 ? (ganhos / decididos) * 100 : null
}
