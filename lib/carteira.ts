/**
 * CARTEIRA — helpers do indicador operacional diario. Sem Prisma.
 *
 * O grao e o dia, em UTC, para o "ultimos 5 dias" nao mudar de resultado
 * conforme o fuso de quem abre a tela.
 */

/** Os N dias que terminam hoje, como "AAAA-MM-DD", do mais antigo ao mais novo. */
export function ultimosDias(n: number, hoje = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - (n - 1 - i)))
    return d.toISOString().slice(0, 10)
  })
}

export type EstadoDia = 'SIM' | 'NAO' | 'SEM_REGISTRO'

/**
 * Tres estados a partir de um unico booleano: a AUSENCIA de registro nao e um
 * "nao". Um dia que ninguem preencheu nao pode parecer um dia sem movimento.
 */
export function estadoDoDia(registro: { movimentou: boolean } | undefined): EstadoDia {
  if (!registro) return 'SEM_REGISTRO'
  return registro.movimentou ? 'SIM' : 'NAO'
}

export const SIMBOLO_DIA: Record<EstadoDia, string> = {
  SIM: '\u2705', NAO: '\u274C', SEM_REGISTRO: '\u00B7',
}

/**
 * A serie dos ultimos N dias de um cliente, pronta para a tela.
 * `registros` pode conter varios clientes: filtramos aqui.
 */
export function serieDoCliente(
  clienteId: string,
  registros: Array<{ clienteId: string; data: string; movimentou: boolean }>,
  dias: string[],
): Array<{ data: string; estado: EstadoDia }> {
  const doCliente = new Map(
    registros.filter((r) => r.clienteId === clienteId).map((r) => [r.data, r]),
  )
  return dias.map((data) => ({ data, estado: estadoDoDia(doCliente.get(data)) }))
}
