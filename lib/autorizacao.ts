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
import { hasPermission, permissaoRestrita, ehSocio, podeVerLixeira } from '@/lib/permissions'

/**
 * O que o banco diz sobre o usuário AGORA: sócio, hierarquia e permissões.
 *
 * Uma consulta por verificação, por chave primária, numa tabela pequena. É o
 * preço de poder revogar na hora — e é por isso que o Conselho não depende do
 * token, que viveria sete dias desatualizado.
 */
export interface EstadoDoUsuario {
  isPartner: boolean
  hierarquia: string | null
  departamento: string | null
  permissoes: string[]
}

function listaDe(bruto: string | null): string[] {
  if (!bruto) return []
  try {
    const lista = JSON.parse(bruto)
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    // Lista corrompida é ausência de permissão, nunca permissão total.
    return []
  }
}

export async function estadoDoUsuario(userId: string): Promise<EstadoDoUsuario | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      active: true, permissoes: true, isPartner: true,
      hierarquia: true, departamento: true,
    },
  })
  if (!u || !u.active) return null
  return {
    isPartner: u.isPartner,
    hierarquia: u.hierarquia,
    departamento: u.departamento,
    permissoes: listaDe(u.permissoes),
  }
}

/**
 * O usuário da sessão é SÓCIO?
 *
 * Metade da autorização do Conselho — a outra é `view_conselho`. Para decidir
 * o acesso, use `podeVerConselho`, que junta as duas.
 */
export async function socio(session: TokenPayload | null): Promise<boolean> {
  if (!session) return false
  const e = await estadoDoUsuario(session.userId)
  return ehSocio(e)
}

/**
 * PODE ABRIR O CONSELHO? — o ÚNICO lugar que decide isso.
 *
 * Exige as DUAS condições:
 *
 *   1. ser SÓCIO       (`User.isPartner`) — um fato sobre a pessoa;
 *   2. ter `view_conselho` — uma alçada que se concede e se revoga.
 *
 * Por que uma função só, e não duas checagens espalhadas: quando as condições
 * são conferidas em lugares diferentes, elas discordam. Foi exatamente assim
 * que o acesso quebrou antes — o menu consultava um eixo, a rota consultava
 * outro, e o sócio legítimo via o item do Conselho levar a um redirect. Página,
 * API e menu chamam ESTA função; nenhum deles repete a regra.
 *
 * UMA consulta ao banco para as duas respostas, não duas: `estadoDoUsuario`
 * traz `isPartner` e as permissões gravadas juntos.
 *
 * `view_conselho` é RESTRITA (`PERMISSOES_RESTRITAS`), então não há atalho de
 * ADMIN nem fallback por perfil: a chave tem de estar gravada no usuário.
 *
 * Lê do BANCO a cada requisição, nunca do token: o JWT vive 7 dias, e isso
 * faria tanto a concessão quanto a revogação esperarem uma semana.
 */
export async function podeVerConselho(session: TokenPayload | null): Promise<boolean> {
  if (!session) return false
  const e = await estadoDoUsuario(session.userId)
  if (!e) return false
  return ehSocio(e) && e.permissoes.includes('view_conselho')
}

/** O usuário da sessão é DIRETOR? É esta a autorização da Lixeira de Leads. */
export async function diretor(session: TokenPayload | null): Promise<boolean> {
  if (!session) return false
  const e = await estadoDoUsuario(session.userId)
  return podeVerLixeira(e)
}

/** As permissões GRAVADAS do usuário, ou null se ele não existe ou está inativo. */
export async function permissoesDoBanco(userId: string): Promise<string[] | null> {
  const e = await estadoDoUsuario(userId)
  return e?.permissoes ?? null
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
