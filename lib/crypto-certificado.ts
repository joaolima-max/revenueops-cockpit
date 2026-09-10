/**
 * Cifragem das senhas de certificado.
 *
 * Senha de certificado NAO e senha de login: precisa ser lida de volta para
 * ser entregue ao cliente, entao hash nao serve. Usamos AES-256-GCM, que
 * alem de cifrar autentica o texto — um registro adulterado no banco falha ao
 * decifrar em vez de devolver lixo silenciosamente.
 *
 * A chave vive so no servidor, em CERTIFICADO_ENCRYPTION_KEY. Este modulo
 * nunca deve ser importado por componente de cliente.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const ALGORITMO = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Aceita a chave em hex de 64 caracteres (32 bytes, o ideal) ou qualquer
 * string, que e entao derivada por SHA-256. A segunda forma existe para nao
 * travar ambiente de desenvolvimento, mas em producao use hex de 32 bytes:
 *   openssl rand -hex 32
 */
function chave(): Buffer {
  const bruta = process.env.CERTIFICADO_ENCRYPTION_KEY
  if (!bruta) {
    throw new Error(
      'CERTIFICADO_ENCRYPTION_KEY nao configurada. Sem ela nao e possivel cifrar ou revelar senhas de certificado.',
    )
  }
  if (/^[0-9a-fA-F]{64}$/.test(bruta)) return Buffer.from(bruta, 'hex')
  return createHash('sha256').update(bruta).digest()
}

export function chaveConfigurada(): boolean {
  return !!process.env.CERTIFICADO_ENCRYPTION_KEY
}

/** Formato guardado: iv:tag:conteudo, tudo em base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITMO, chave(), iv)
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), cifrado.toString('base64url')].join(':')
}

export function decifrar(guardado: string): string {
  const partes = guardado.split(':')
  if (partes.length !== 3) throw new Error('Senha cifrada em formato invalido.')

  const iv = Buffer.from(partes[0], 'base64url')
  const tag = Buffer.from(partes[1], 'base64url')
  const dados = Buffer.from(partes[2], 'base64url')

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Senha cifrada em formato invalido.')
  }

  const decipher = createDecipheriv(ALGORITMO, chave(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(dados), decipher.final()]).toString('utf8')
}

/**
 * Senha aleatoria para um certificado novo. Alfabeto sem caracteres que se
 * confundem lidos em voz alta ou copiados a mao (0/O, 1/l/I).
 */
export function gerarSenha(tamanho = 14): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(tamanho)
  let saida = ''
  for (let i = 0; i < tamanho; i++) saida += alfabeto[bytes[i] % alfabeto.length]
  return saida
}
