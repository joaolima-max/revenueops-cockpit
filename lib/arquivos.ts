/**
 * ARQUIVOS — formatos, limites e sanitizacao de nome. Sem Prisma, sem SDK.
 *
 * Vive separado de lib/storage.ts porque o construtor e a pagina publica de
 * formularios precisam destas regras no NAVEGADOR. Importar lib/storage la
 * arrastaria o SDK do Supabase — e a service role key junto — para o bundle
 * do cliente.
 */

/** 25 MB. Vercel Functions aceitam ate 100 MB de corpo; o limite aqui e de produto. */
export const TAMANHO_MAX = 25 * 1024 * 1024

/** Extensao -> MIMEs aceitos. Validamos os dois: extensao sozinha se falsifica. */
const FORMATOS: Record<string, string[]> = {
  pdf:  ['application/pdf'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv:  ['text/csv', 'application/csv', 'text/plain'],
  txt:  ['text/plain'],
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png:  ['image/png'],
  webp: ['image/webp'],
  zip:  ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
}

export const EXTENSOES_ACEITAS = Object.keys(FORMATOS)

export function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf('.')
  return i === -1 ? '' : nome.slice(i + 1).toLowerCase()
}

/** Devolve a mensagem de erro, ou null quando o arquivo e aceitavel. */
export function validarArquivo(nome: string, mime: string, tamanho: number): string | null {
  const ext = extensaoDe(nome)
  if (!ext) return 'O arquivo precisa ter extensão.'

  const mimesAceitos = FORMATOS[ext]
  if (!mimesAceitos) {
    return `Extensão .${ext} não é aceita. Aceitos: ${EXTENSOES_ACEITAS.join(', ')}.`
  }
  if (mime && !mimesAceitos.includes(mime)) {
    return `O conteúdo do arquivo (${mime}) não corresponde à extensão .${ext}.`
  }
  if (!Number.isFinite(tamanho) || tamanho <= 0) return 'Arquivo vazio.'
  if (tamanho > TAMANHO_MAX) {
    return `Arquivo maior que o limite de ${Math.round(TAMANHO_MAX / 1024 / 1024)} MB.`
  }
  return null
}

/**
 * Remove tudo que possa escapar do prefixo do cliente no bucket.
 *
 * Alem de tirar barras, corta pontos iniciais: `../fuga.pdf` viraria
 * `.._fuga.pdf`, que nao atravessa diretorio nenhum mas deixa um `..` no nome
 * — inutil e confuso para qualquer ferramenta que leia a chave depois.
 */
export function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 120)
  return limpo || 'arquivo'
}

export function chaveDocumento(clienteId: string, documentoId: string, nome: string): string {
  return `clientes/${clienteId}/${documentoId}/${nomeSeguro(nome)}`
}
