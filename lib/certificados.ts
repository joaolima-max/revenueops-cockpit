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

/* ========================================================================= *
 * DESTINATARIO DO ENVIO — cliente atual ou cliente antigo
 *
 * Ha envios historicos para empresas que nao estao mais na base. Recriar a
 * empresa como Cliente so para registrar o envio sujaria a Carteira com uma
 * linha que nao e cliente — contaminando contagens, MRR e filtros. Por isso o
 * envio aceita DUAS formas de destinatario, e exatamente uma delas.
 * ========================================================================= */

export interface Destinatario {
  /** Cliente da base. Nulo quando a empresa nao esta mais ativa. */
  clienteId: string | null
  /** Nome digitado. Obrigatorio quando nao ha cliente; ignorado quando ha. */
  clienteNomeHistorico: string | null
}

/**
 * Valida o destinatario. Devolve a mensagem de erro, ou null.
 *
 * `clienteAntigo` e a marcacao da tela ("Cliente nao esta mais ativo na base").
 * E ela que decide qual dos dois campos e exigido — nao a presenca de um ou de
 * outro no corpo, que deixaria o estado ambiguo quando viessem os dois.
 */
export function validarDestinatario(
  clienteAntigo: boolean,
  clienteId: unknown,
  nomeHistorico: unknown,
): { erro: string } | { destinatario: Destinatario } {
  if (clienteAntigo) {
    const nome = String(nomeHistorico ?? '').trim()
    if (!nome) {
      return { erro: 'Informe o nome do cliente. Mesmo fora da base, o envio precisa dizer para quem foi.' }
    }
    return { destinatario: { clienteId: null, clienteNomeHistorico: nome.slice(0, 200) } }
  }

  const id = String(clienteId ?? '').trim()
  if (!id) return { erro: 'Selecione o cliente.' }
  return { destinatario: { clienteId: id, clienteNomeHistorico: null } }
}

/** Nome a exibir, venha de onde vier. Nunca devolve vazio. */
export function nomeDestinatario(
  envio: { cliente?: { nome: string } | null; clienteNomeHistorico?: string | null },
): string {
  return envio.cliente?.nome ?? envio.clienteNomeHistorico ?? 'Cliente nao identificado'
}


/* ========================================================================= *
 * ORDENAÇÃO E BUSCA
 * ========================================================================= */

/**
 * Compara duas identificações de versão NUMERICAMENTE quando elas são números.
 *
 * O problema que isto resolve: `identificacao` e um texto, e a ordenacao
 * alfabetica de "1", "2", "10", "11", "50" produz 1, 10, 11, 2, 50. Uma
 * versao chamada "2" aparecia depois de "11", e a lista ficava ilegivel
 * justamente quando havia versoes suficientes para precisar de ordem.
 *
 * Identificacoes que NAO sao numeros (p. ex. "2026-A") caem no alfabetico, e
 * vao depois das numericas — e o alfabetico e o certo para elas.
 */
export function compararIdentificacao(a: string, b: string): number {
  const na = Number(a.trim())
  const nb = Number(b.trim())
  const aNum = Number.isFinite(na) && a.trim() !== ''
  const bNum = Number.isFinite(nb) && b.trim() !== ''

  if (aNum && bNum) return na - nb
  // Numerica antes de textual: "1" vem antes de "2026-A".
  if (aNum) return -1
  if (bNum) return 1
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

/** Normaliza para busca: sem acento, sem caixa. */
function normalizar(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * O termo casa com o envio?
 *
 * Busca por RAZAO SOCIAL e por NUMERO do certificado. O numero e procurado
 * dentro do INTERVALO do envio: quem tem o certificado 37 na mao quer saber
 * para quem ele foi, e o envio que o contem e o que registra "30 a 40" — nao
 * uma linha com "37".
 */
export function envioCasaBusca(
  envio: {
    destinatario?: string | null
    numeroInicial: number
    numeroFinal: number
    versaoIdentificacao?: string | null
  },
  termo: string,
): boolean {
  const t = normalizar(termo.trim())
  if (!t) return true

  if (envio.destinatario && normalizar(envio.destinatario).includes(t)) return true
  if (envio.versaoIdentificacao && normalizar(envio.versaoIdentificacao).includes(t)) return true

  // Numero DENTRO do intervalo — e assim que o envio registra a entrega.
  const n = Number(t)
  if (Number.isInteger(n) && n >= envio.numeroInicial && n <= envio.numeroFinal) return true

  return false
}
