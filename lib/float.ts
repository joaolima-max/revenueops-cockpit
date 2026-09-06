/**
 * CÁLCULO DO FLOAT — função centralizada. Não replicar esta fórmula em telas.
 *
 * Regra de negócio:
 *   FLOAT = SALDO QUE DORME × MULTIPLICADOR
 *
 * "Saldo que dorme" é o dinheiro que permaneceu em conta da virada de um dia
 * para o outro. Entre dois dias consecutivos D e D+1, o valor que efetivamente
 * atravessou a noite é o MENOR dos dois saldos:
 *
 *   - o que saiu antes da virada não dormiu;
 *   - o que entrou só no dia seguinte não estava lá durante a noite.
 *
 *   dorme(D → D+1) = min(saldo(D), saldo(D+1))
 *
 * Exemplo do documento: dia 01 = 10.000.000, dia 02 = 12.000.000.
 * Dormiu 10.000.000 — os 2 milhões extras chegaram depois da virada.
 *
 * Dias sem lançamento NÃO geram float. Sem saldo registrado não há como saber
 * o que havia em conta, e inventar um valor seria exatamente o tipo de fallback
 * silencioso que esta refatoração eliminou.
 *
 * O multiplicador é versionado por vigência: cada noite usa o multiplicador
 * vigente naquela data, para que alterar o valor hoje não reescreva o Float de
 * períodos já fechados.
 */

export interface SaldoDia {
  data: Date
  saldoEmConta: number
}

export interface VigenciaMultiplicador {
  vigenciaInicio: Date
  multiplicador: number
}

/** Uma noite: o saldo que atravessou de `de` para `ate`. */
export interface NoiteFloat {
  de: Date
  ate: Date
  saldoQueDormiu: number
  multiplicador: number
  rendimento: number
}

const DIA_MS = 86_400_000

function diaUTC(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DIA_MS)
}

/**
 * Multiplicador vigente numa data: a vigência mais recente que já começou.
 * Retorna null quando a data é anterior a qualquer configuração — nesse caso
 * a noite não rende, em vez de assumir um valor arbitrário.
 */
export function multiplicadorEm(data: Date, vigencias: VigenciaMultiplicador[]): number | null {
  const alvo = diaUTC(data)
  let escolhido: VigenciaMultiplicador | null = null
  for (const v of vigencias) {
    if (diaUTC(v.vigenciaInicio) <= alvo) {
      if (!escolhido || diaUTC(v.vigenciaInicio) > diaUTC(escolhido.vigenciaInicio)) escolhido = v
    }
  }
  return escolhido ? escolhido.multiplicador : null
}

/**
 * Decompõe o período em noites. Só há noite entre dias de calendário
 * consecutivos que tenham lançamento; lacunas interrompem a série.
 */
export function noitesDoPeriodo(
  dias: SaldoDia[],
  vigencias: VigenciaMultiplicador[]
): NoiteFloat[] {
  const ordenados = [...dias].sort((a, b) => a.data.getTime() - b.data.getTime())
  const noites: NoiteFloat[] = []

  for (let i = 0; i < ordenados.length - 1; i++) {
    const hoje = ordenados[i]
    const amanha = ordenados[i + 1]

    // Consecutivos? Um buraco no calendário não gera float.
    if (diaUTC(amanha.data) - diaUTC(hoje.data) !== 1) continue

    const saldoQueDormiu = Math.min(hoje.saldoEmConta, amanha.saldoEmConta)
    if (saldoQueDormiu <= 0) continue

    const multiplicador = multiplicadorEm(hoje.data, vigencias)
    if (multiplicador === null) continue

    noites.push({
      de: hoje.data,
      ate: amanha.data,
      saldoQueDormiu,
      multiplicador,
      rendimento: saldoQueDormiu * multiplicador,
    })
  }

  return noites
}

/**
 * Float do período. `null` quando não houve nenhuma noite elegível — ausência
 * de dado é diferente de zero e as telas devem distinguir os dois casos.
 */
export function calcularFloat(
  dias: SaldoDia[],
  vigencias: VigenciaMultiplicador[]
): number | null {
  const noites = noitesDoPeriodo(dias, vigencias)
  if (noites.length === 0) return null
  return noites.reduce((total, n) => total + n.rendimento, 0)
}
