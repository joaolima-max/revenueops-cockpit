/**
 * PERÍODO "YYYY-MM" — conversões de calendário, sem Prisma e sem regra de negócio.
 *
 * Mora fora de lib/kpi.ts porque lib/financeiro.ts também precisa destas
 * funções, e kpi.ts importa financeiro.ts. Deixá-las em kpi.ts criaria um ciclo
 * de imports entre os dois módulos de indicadores.
 */

/** Primeiro instante do mês e o primeiro do mês seguinte, para "YYYY-MM". */
export function intervaloMes(periodo: string): { inicio: Date; fim: Date } {
  const [ano, mes] = periodo.split('-').map(Number)
  return { inicio: new Date(Date.UTC(ano, mes - 1, 1)), fim: new Date(Date.UTC(ano, mes, 1)) }
}

export function periodoAtual(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Os N períodos "YYYY-MM" terminando no mês corrente. */
export function ultimosPeriodos(n: number): string[] {
  const h = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - (n - 1 - i), 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/* ========================================================================= *
 * COMPARAÇÃO EQUIVALENTE — a janela parcial de um período em curso
 *
 * ── O DEFEITO QUE ISTO CORRIGE ──────────────────────────────────────────
 *
 * Os lançamentos são DIÁRIOS, e o mês corrente está sempre pela metade. Até
 * esta rodada a variação de um KPI comparava o acumulado parcial do mês atual
 * com o mês anterior INTEIRO:
 *
 *   dia 07 do mês   →  R$ 10 mi (7 dias)  vs  R$ 40 mi (30 dias)  →  −75%
 *
 * A seta ficava vermelha todo começo de mês, em todos os indicadores, por
 * motivo nenhum: o mês atual ainda não aconteceu. Um indicador que é negativo
 * por construção não informa nada — e pior, treina quem o lê a ignorá-lo.
 *
 * A comparação correta é EQUIVALENTE: a mesma quantidade de dias de calendário
 * nos dois lados.
 *
 *   dia 07  →  01–07 do mês atual  vs  01–07 do mês anterior
 *
 * ── POR QUE DIA DE CALENDÁRIO, E NÃO DIAS LANÇADOS ──────────────────────
 *
 * "Os primeiros 7 dias" é uma janela de calendário. Contar dias LANÇADOS
 * faria a janela comparável mudar de tamanho conforme o parceiro tenha ou não
 * operado no fim de semana — e um mês com 5 dias lançados seria comparado com
 * os 5 primeiros dias lançados do mês anterior, que podem cobrir 8 dias de
 * calendário. A janela é o tempo decorrido, não o volume de registros.
 *
 * ── UM PERÍODO FECHADO NÃO SE TRUNCA ────────────────────────────────────
 *
 * Só o período EM CURSO é parcial. Comparar dois meses fechados é comparar os
 * dois inteiros: truncar setembro no dia 7 para compará-lo com agosto jogaria
 * fora 23 dias de dado real.
 * ========================================================================= */

/** O dia do mês, em UTC. É o tamanho da janela decorrida do mês corrente. */
export function diaDoMes(d: Date = new Date()): number {
  return d.getUTCDate()
}

/** O período "YYYY-MM" é o mês EM CURSO? */
export function periodoEmCurso(periodo: string, hoje: Date = new Date()): boolean {
  const atual = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`
  return periodo === atual
}

/** Quantos dias tem o mês de "YYYY-MM". */
export function diasNoMes(periodo: string): number {
  const [ano, mes] = periodo.split('-').map(Number)
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/**
 * A janela do período, opcionalmente TRUNCADA no dia `ateDia` (inclusivo).
 *
 * `ateDia` ausente, zero ou negativo devolve o mês inteiro — é o
 * comportamento de `intervaloMes`, e é o que um período fechado usa.
 *
 * O truncamento é CAPADO pelo fim do mês: comparar "até o dia 31" com
 * fevereiro não pode produzir uma janela que invade março. Isso importa de
 * verdade — no dia 31 de um mês, a janela equivalente de fevereiro é
 * fevereiro inteiro, e não há como ser mais que isso.
 */
export function intervaloParcial(
  periodo: string, ateDia?: number | null,
): { inicio: Date; fim: Date } {
  const mes = intervaloMes(periodo)
  if (!ateDia || ateDia <= 0) return mes

  const [ano, m] = periodo.split('-').map(Number)
  // `ateDia` é INCLUSIVO, e o fim da janela é exclusivo: o dia seguinte.
  const fimParcial = new Date(Date.UTC(ano, m - 1, ateDia + 1))
  return {
    inicio: mes.inicio,
    fim: fimParcial.getTime() < mes.fim.getTime() ? fimParcial : mes.fim,
  }
}

/**
 * O TAMANHO DA JANELA a usar nos dois lados de uma comparação mensal.
 *
 * Devolve `null` quando o período de referência está FECHADO — aí não há
 * truncamento, e os dois meses são comparados inteiros.
 *
 * Quando o período está em curso, devolve o dia do mês de hoje: é quantos dias
 * de calendário já decorreram, e é a janela que os dois lados compartilham.
 */
export function janelaComparavel(
  periodo: string, hoje: Date = new Date(),
): number | null {
  return periodoEmCurso(periodo, hoje) ? diaDoMes(hoje) : null
}
