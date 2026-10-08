/**
 * COMPARAÇÃO TEMPORAL — o serviço único de "período atual × período
 * comparável", em todas as granularidades do produto.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────
 *
 * Toda seta de variação do produto responde à mesma pergunta: "comparado com
 * o quê?". Até esta rodada cada tela respondia por conta própria, e as
 * respostas discordavam:
 *
 *   - os KPIs mensais comparavam o acumulado parcial do mês com o mês
 *     anterior INTEIRO (corrigido na rodada passada, em `comparacaoMensal`);
 *   - os gráficos diários comparavam o último ponto com o penúltimo DEPOIS DE
 *     DESCARTAR zeros — e podiam acabar comparando o dia 06 com o dia 03;
 *   - não havia leitura semanal nem trimestral, e quem precisasse de uma
 *     escreveria a terceira versão da mesma regra.
 *
 * Três implementações da mesma conta é como três telas passam a mostrar três
 * variações para o mesmo indicador. Então a regra mora AQUI, uma vez, e cada
 * tela declara apenas a GRANULARIDADE que está lendo.
 *
 * ── A REGRA, EM UMA FRASE ───────────────────────────────────────────────
 *
 * As duas janelas cobrem SEMPRE o mesmo número de dias de calendário.
 *
 * Isso é o que impede a comparação que não informa nada — parcial contra
 * completo. É a mesma regra nas quatro granularidades; o que muda é o tamanho
 * da janela e onde ela começa.
 *
 *   DIÁRIA      um dia contra o dia anterior
 *   SEMANAL     os N dias decorridos da semana contra os N primeiros da
 *               semana anterior
 *   MENSAL      01–07/10 contra 01–07/09
 *   TRIMESTRAL  os N dias decorridos do trimestre contra os N primeiros do
 *               trimestre anterior
 *
 * ── E QUANDO O PERÍODO ANTERIOR É MENOR ─────────────────────────────────
 *
 * Em 31/03, "os 31 dias decorridos de março" não existem em fevereiro. A
 * janela é então encurtada NOS DOIS LADOS para 28 dias — não só no lado de
 * fevereiro. Encurtar um lado só devolveria o defeito que o serviço existe
 * para corrigir, agora invertido: 31 dias de março contra 28 de fevereiro.
 *
 * O preço é visível e é o certo: a comparação ignora 3 dias reais de março.
 * O indicador do mês continua mostrando o mês inteiro — é só a BASE
 * COMPARÁVEL que se encurta, e `rotuloDoPar` diz em voz alta qual janela foi
 * usada.
 *
 * ── TUDO EM UTC, TUDO SEM PRISMA ────────────────────────────────────────
 *
 * As colunas de data do produto são `DATE` e são lidas em UTC (ver
 * `serieDiaria`). Um serviço que usasse o fuso local trocaria o dia na
 * virada. E nada aqui consulta banco: é calendário puro, testável sem
 * infraestrutura.
 */

import { diasNoMes } from '@/lib/periodo'

export const GRANULARIDADES = ['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL'] as const
export type Granularidade = typeof GRANULARIDADES[number]

export const GRANULARIDADE_LABEL: Record<Granularidade, string> = {
  DIARIA: 'diária',
  SEMANAL: 'semanal',
  MENSAL: 'mensal',
  TRIMESTRAL: 'trimestral',
}

const DIA_MS = 86_400_000

/** Meia-noite UTC do dia da data. O grão das colunas `DATE`. */
export function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function maisDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DIA_MS)
}

function diasEntre(inicio: Date, fim: Date): number {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS))
}

export interface Janela {
  /** Primeiro dia, INCLUSIVO, à meia-noite UTC. */
  inicio: Date
  /** Limite superior EXCLUSIVO. */
  fim: Date
  /** Dias de calendário cobertos. */
  dias: number
}

function janela(inicio: Date, dias: number): Janela {
  return { inicio, fim: maisDias(inicio, dias), dias }
}

/* ========================================================================= *
 * OS INÍCIOS DE CADA GRANULARIDADE
 * ========================================================================= */

/**
 * Início da SEMANA ISO (segunda-feira) do dia informado.
 *
 * Segunda e não domingo: é a semana de trabalho, e é como a operação fala de
 * "esta semana". `getUTCDay()` devolve 0 para domingo, então domingo recua 6
 * dias em vez de 0.
 */
export function inicioDaSemana(d: Date): Date {
  const dia = diaUtc(d)
  const dow = dia.getUTCDay()
  return maisDias(dia, dow === 0 ? -6 : 1 - dow)
}

/** Início do MÊS do dia informado. */
export function inicioDoMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

/** O trimestre civil do dia: 1 a 4. */
export function trimestreDe(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3) + 1
}

/** Início do TRIMESTRE civil do dia informado. */
export function inicioDoTrimestre(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), (trimestreDe(d) - 1) * 3, 1))
}

/** Quantos dias tem o trimestre que começa em `inicio`. */
function diasNoTrimestre(inicio: Date): number {
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 3, 1))
  return diasEntre(inicio, fim)
}

/** Quantos dias tem o período completo da granularidade que começa em `inicio`. */
function diasDoPeriodoCompleto(gran: Granularidade, inicio: Date): number {
  switch (gran) {
    case 'DIARIA': return 1
    case 'SEMANAL': return 7
    case 'MENSAL':
      return diasNoMes(
        `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, '0')}`,
      )
    case 'TRIMESTRAL': return diasNoTrimestre(inicio)
  }
}

/** Início do período ANTERIOR ao que começa em `inicio`. */
function inicioAnterior(gran: Granularidade, inicio: Date): Date {
  switch (gran) {
    case 'DIARIA': return maisDias(inicio, -1)
    case 'SEMANAL': return maisDias(inicio, -7)
    case 'MENSAL':
      return new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - 1, 1))
    case 'TRIMESTRAL':
      return new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - 3, 1))
  }
}

/* ========================================================================= *
 * O PAR COMPARÁVEL
 * ========================================================================= */

export interface ParTemporal {
  granularidade: Granularidade
  /** A janela do período de REFERÊNCIA, já equalizada. */
  atual: Janela
  /** A janela EQUIVALENTE do período anterior. Mesmo número de dias. */
  anterior: Janela
  /**
   * O período de referência está EM CURSO?
   *
   * Quando está, a janela é o decorrido. Quando não, é o período inteiro —
   * truncar um período fechado jogaria fora dado real.
   */
  emCurso: boolean
  /**
   * A janela foi ENCURTADA para caber no período anterior?
   *
   * Acontece em 31/03 (fevereiro não tem 31 dias) e no 4º trimestre contra o
   * 3º. A tela declara isso em vez de deixar o leitor supor.
   */
  equalizada: boolean
}

/**
 * O par "período atual × período comparável" de uma granularidade.
 *
 * `referencia` é o dia que define o período — HOJE, na leitura ao vivo, e o
 * último dia com dado quando a série é que manda (é o caso da leitura
 * DIÁRIA: o lançamento do dia pode ainda não ter sido feito, e comparar um
 * dia sem lançamento com o anterior produziria −100% todo começo de manhã).
 */
export function parTemporal(
  gran: Granularidade, referencia: Date = new Date(),
): ParTemporal {
  const ref = diaUtc(referencia)
  const inicio = gran === 'DIARIA' ? ref
    : gran === 'SEMANAL' ? inicioDaSemana(ref)
      : gran === 'MENSAL' ? inicioDoMes(ref)
        : inicioDoTrimestre(ref)

  const completo = diasDoPeriodoCompleto(gran, inicio)
  // O DECORRIDO inclui o dia de referência: no dia 07, são 7 dias.
  const decorrido = diasEntre(inicio, maisDias(ref, 1))
  const emCurso = decorrido < completo

  const inicioAnt = inicioAnterior(gran, inicio)
  const completoAnt = diasDoPeriodoCompleto(gran, inicioAnt)

  // A JANELA É A MESMA NOS DOIS LADOS. Quando o período anterior é menor, os
  // dois encurtam — ver o cabeçalho.
  const pedidos = emCurso ? decorrido : completo
  const dias = Math.min(pedidos, completoAnt)

  return {
    granularidade: gran,
    atual: janela(inicio, dias),
    anterior: janela(inicioAnt, dias),
    emCurso,
    equalizada: dias < pedidos,
  }
}

/** "dd/mm" de um dia, em UTC. */
function ddmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/`
    + `${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * O que a tela DECLARA sob a seta.
 *
 * Sem isso "+21,4%" é um número sem referência — e foi a ausência dessa
 * referência que deixou a comparação errada passar tanto tempo invisível.
 */
export function rotuloDoPar(par: ParTemporal): string {
  const { atual, anterior, granularidade } = par
  const ultimo = (j: Janela) => maisDias(j.fim, -1)

  if (granularidade === 'DIARIA') {
    return `${ddmm(atual.inicio)} vs ${ddmm(anterior.inicio)}`
  }

  const faixa = (j: Janela) => j.dias === 1
    ? ddmm(j.inicio)
    : `${ddmm(j.inicio)}–${ddmm(ultimo(j))}`

  const base = `${faixa(atual)} vs ${faixa(anterior)}`
  return par.equalizada ? `${base} · janela igualada em ${atual.dias} dias` : base
}

/**
 * A granularidade é apurável com o número de períodos disponíveis?
 *
 * Existe para que a tela não desenhe uma comparação contra um período que não
 * existe. Uma base de dois meses não tem trimestre anterior, e inventar um
 * daria uma variação contra nada.
 */
export function temBaseComparavel(
  par: ParTemporal, primeiroDiaComDado: Date | null,
): boolean {
  if (!primeiroDiaComDado) return false
  // A janela anterior precisa estar INTEIRA dentro do período com dado. Uma
  // base que cobre metade da janela anterior produz uma variação contra um
  // período pela metade — o mesmo defeito, por outro caminho.
  return diaUtc(primeiroDiaComDado).getTime() <= par.anterior.inicio.getTime()
}
