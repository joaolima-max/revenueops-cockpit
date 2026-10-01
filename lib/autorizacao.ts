/**
 * AUTORIZAÇÃO DAS CHAVES RESTRITAS — Conselho e Auditoria.
 *
 * Por que isto não é `hasPermission` direto: a sessão vive num JWT de 7 dias.
 * Se a autorização do Conselho viesse do token, revogar o acesso de alguém só
 * teria efeito no próximo login — até uma semana depois. Para uma chave que
 * guarda dado de sócio, isso é inaceitável.
 *
 * Então as chaves restritas são conferidas CONTRA O BANCO, a cada requisição:
 * revogar tem efeito imediato, e desativar o usuário também. As chaves comuns
 * continuam pelo caminho antigo (token + perfil), sem mudança de comportamento.
 *
 * Custo: uma consulta por verificação, numa tabela pequena e por chave
 * primária. É o preço de poder revogar na hora.
 */

import { prisma } from '@/lib/prisma'
import type { TokenPayload } from '@/lib/auth'
import { hasPermission, permissaoRestrita } from '@/lib/permissions'

/** As permissões GRAVADAS do usuário, ou null se ele não existe ou está inativo. */
export async function permissoesDoBanco(userId: string): Promise<string[] | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, permissoes: true },
  })
  if (!u || !u.active) return null
  if (!u.permissoes) return []
  try {
    const lista = JSON.parse(u.permissoes)
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Lista corrompida é ausência de permissão, nunca permissão total.
    return []
  }
}

/**
 * O usuário da sessão pode `key`?
 *
 * Chave restrita → lê do banco e exige a chave explícita.
 * Chave comum    → mantém o comportamento por token e perfil.
 */
export async function autorizado(
  session: TokenPayload | null, key: string,
): Promise<boolean> {
  if (!session) return false

  if (!permissaoRestrita(key)) {
    return hasPermission(session.permissoes ?? null, key, session.role)
  }

  const gravadas = await permissoesDoBanco(session.userId)
  if (gravadas === null) return false
  return gravadas.includes(key)
}
