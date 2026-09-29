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
