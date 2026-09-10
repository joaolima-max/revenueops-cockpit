/**
 * CERTIFICADOS — regras de dominio. Sem Prisma, testavel sem banco.
 *
 * Dois conceitos que nao se misturam:
 *   VERSAO/ZIP = estoque. Sempre 50 certificados, numerados de 1 a 50.
 *   ENVIO      = distribuicao ao cliente. UNICO = 1, LOTE = 10.
 *
 * A numeracao e RELATIVA a versao, entao um intervalo so tem sentido citado
 * junto dela: "versao 002, certificados 1-10". "certificados 1-10" sozinho e
 * ambiguo, porque 1-10 existe em toda versao.
 */

export const CERTIFICADOS_POR_VERSAO = 50

export const QUANTIDADE_POR_TIPO = { UNICO: 1, LOTE: 10 } as const
export type EnvioTipo = keyof typeof QUANTIDADE_POR_TIPO

export const ENVIO_TIPO_LABELS: Record<EnvioTipo, string> = {
  UNICO: 'Único (1 certificado)',
  LOTE: 'Lote (10 certificados)',
}

export function quantidadeDoTipo(tipo: EnvioTipo): number {
  return QUANTIDADE_POR_TIPO[tipo]
}

/** Os numeros 1..50 de uma versao nova. */
export function numerosDaVersao(): number[] {
  return Array.from({ length: CERTIFICADOS_POR_VERSAO }, (_, i) => i + 1)
}

/** Rotulo que sempre carrega a versao junto — nunca só o intervalo. */
export function rotuloIntervalo(versao: string, inicial: number, final: number): string {
  return inicial === final
    ? `Versão ${versao} — certificado ${inicial}`
    : `Versão ${versao} — certificados ${inicial}–${final}`
}

/** Aceita "1 - 10", "1-10", "1 a 10" ou "11". Devolve null se nao entender. */
export function parseIntervalo(entrada: string): { inicial: number; final: number } | null {
  const texto = String(entrada).trim()
  const faixa = texto.match(/^(\d{1,3})\s*(?:-|–|a|até)\s*(\d{1,3})$/i)
  if (faixa) {
    const inicial = Number(faixa[1])
    const final = Number(faixa[2])
    return final < inicial ? null : { inicial, final }
  }
  const unico = texto.match(/^(\d{1,3})$/)
  if (unico) {
    const n = Number(unico[1])
    return { inicial: n, final: n }
  }
  return null
}

export interface PedidoEnvio {
  tipo: EnvioTipo
  inicial: number
  final: number
  /** Numeros que ainda estao em estoque nesta versao. */
  disponiveis: number[]
}

/**
 * Valida um envio. Devolve a mensagem de erro, ou null quando o pedido e
 * aceitavel.
 */
export function validarEnvio(p: PedidoEnvio): string | null {
  const esperado = quantidadeDoTipo(p.tipo)
  const pedidos = p.final - p.inicial + 1

  if (p.inicial < 1 || p.final > CERTIFICADOS_POR_VERSAO) {
    return `Os números precisam estar entre 1 e ${CERTIFICADOS_POR_VERSAO} — a numeração é relativa à versão.`
  }
  if (pedidos !== esperado) {
    return p.tipo === 'UNICO'
      ? 'Envio único usa exatamente 1 certificado. Informe um número só.'
      : `Envio em lote usa exatamente ${esperado} certificados. O intervalo informado tem ${pedidos}.`
  }

  const disponiveis = new Set(p.disponiveis)
  const indisponiveis: number[] = []
  for (let n = p.inicial; n <= p.final; n++) if (!disponiveis.has(n)) indisponiveis.push(n)

  if (indisponiveis.length > 0) {
    return indisponiveis.length === 1
      ? `O certificado ${indisponiveis[0]} desta versão já foi enviado.`
      : `Os certificados ${indisponiveis.join(', ')} desta versão já foram enviados.`
  }
  return null
}

/**
 * Primeiro intervalo contiguo livre com a quantidade pedida. Serve para a tela
 * sugerir o proximo envio sem o usuario ter que caçar os numeros.
 */
export function proximoIntervalo(
  disponiveis: number[], tipo: EnvioTipo,
): { inicial: number; final: number } | null {
  const n = quantidadeDoTipo(tipo)
  const ordenados = [...new Set(disponiveis)].sort((a, b) => a - b)

  for (let i = 0; i + n - 1 < ordenados.length; i++) {
    const inicial = ordenados[i]
    const final = ordenados[i + n - 1]
    if (final - inicial + 1 === n) return { inicial, final }
  }
  return null
}
