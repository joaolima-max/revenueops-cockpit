/**
 * ALÇADA DA PREVISÃO — um lugar só decide quem vê e quem lança.
 *
 * ── POR QUE UM MÓDULO PRÓPRIO, E NÃO `hasPermission` DIRETO NAS ROTAS ───
 *
 * Porque a regra tem DUAS chaves e um ponto de contato com o Financeiro, e
 * repetir essa combinação em nove rotas é como as rotas passam a discordar —
 * foi exatamente isso que aconteceu com o Conselho neste produto, e a correção
 * foi a mesma: uma função, chamada por página, API e menu.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────
 *
 * VER:     `view_previsao`  OU  `manage_previsao`
 * LANÇAR:  `manage_previsao`
 *
 * Quem edita também lê — por isso `podeVerPrevisao` aceita as duas. O
 * contrário não vale: ler não dá direito de escrever.
 *
 * ── O CENTRO DE CUSTO É CASO À PARTE ────────────────────────────────────
 *
 * Ele mora em **Cadastros Financeiros**, ao lado de Categorias e Fornecedores,
 * e é usado pelos LANÇAMENTOS além da Previsão. Então quem administra o
 * Financeiro administra o centro de custo, e quem administra a Previsão
 * também: são as duas áreas que dependem dele.
 *
 * Exigir só `manage_previsao` trancaria o cadastro para quem já responde pelo
 * Financeiro mas não pelo planejamento — e ele não conseguiria classificar um
 * lançamento. Exigir só `manage_financeiro` faria o contrário, impedindo quem
 * monta o orçamento de criar a área onde ele vai.
 *
 * Nenhuma das chaves é RESTRITA, então as duas seguem o atalho de ADMIN e o
 * default por perfil — a decisão aqui é sobre qual combinação libera, não
 * sobre como cada chave é concedida.
 */

import { hasPermission } from '@/lib/permissions'

/** O mínimo que estas funções precisam saber de quem pede. */
export interface SessaoPrevisao {
  role: string
  permissoes?: string[] | null
}

/** Pode ABRIR o módulo Previsão? Ver também libera para quem gerencia. */
export function podeVerPrevisao(s: SessaoPrevisao | null | undefined): boolean {
  if (!s) return false
  const p = s.permissoes ?? null
  return hasPermission(p, 'view_previsao', s.role)
    || hasPermission(p, 'manage_previsao', s.role)
}

/**
 * Pode CRIAR, EDITAR e EXCLUIR orçamento, despesa futura e receita prevista?
 *
 * Só `manage_previsao`. Consultar o forecast é leitura executiva; reescrever o
 * orçamento é decisão de quem responde pelo planejamento.
 */
export function podeGerenciarPrevisao(s: SessaoPrevisao | null | undefined): boolean {
  if (!s) return false
  return hasPermission(s.permissoes ?? null, 'manage_previsao', s.role)
}

/** Pode VER os centros de custo? Financeiro ou Previsão — os dois usam. */
export function podeVerCentrosCusto(s: SessaoPrevisao | null | undefined): boolean {
  if (!s) return false
  return hasPermission(s.permissoes ?? null, 'view_financeiro', s.role)
    || podeVerPrevisao(s)
}

/**
 * Pode ADMINISTRAR centros de custo?
 *
 * `manage_financeiro` OU `manage_previsao`. Ver o cabeçalho deste arquivo para
 * por que as duas, e não uma.
 */
export function podeGerenciarCentrosCusto(s: SessaoPrevisao | null | undefined): boolean {
  if (!s) return false
  return hasPermission(s.permissoes ?? null, 'manage_financeiro', s.role)
    || podeGerenciarPrevisao(s)
}

/* ========================================================================= *
 * A AUTORIDADE: AS PERMISSÕES DO BANCO
 *
 * ── POR QUE AS VARIANTES ASSÍNCRONAS EXISTEM ────────────────────────────
 *
 * As funções acima decidem com a lista que recebem — que, vinda de uma sessão,
 * é a lista do TOKEN. O JWT fotografa as permissões no login e vive 7 dias.
 *
 * `view_previsao` e `manage_previsao` NASCERAM nesta rodada. Então todo token
 * emitido antes do deploy está sem elas, e um usuário não-ADMIN com lista
 * explícita de permissões seria barrado por uma foto antiga mesmo tendo a
 * chave gravada no banco (ver `PERMISSOES_RECENTES`, em lib/permissions).
 *
 * É o mesmo defeito que o Conselho teve duas vezes, e a correção é a mesma: a
 * AUTORIDADE é quem consulta o banco. O proxy não decide essas chaves; a
 * página e a API decidem, com a lista de agora.
 *
 * Custo: uma consulta por verificação, por chave primária, numa tabela
 * pequena. É o preço de a concessão valer na hora em vez de em sete dias — e
 * de a revogação valer na hora também.
 * ========================================================================= */

/**
 * Pode abrir a Previsão, conferido CONTRA O BANCO.
 *
 * É esta que o layout de `/dashboard/financeiro/previsao` usa, e é ela a
 * autoridade sobre o acesso à tela. A variante síncrona continua servindo onde
 * a lista já veio do banco (a sidebar, que `estadoDoUsuario` alimenta).
 *
 * Usuário inexistente ou INATIVO devolve `false`: `estadoDoUsuario` já filtra
 * `active`, e desativar alguém passa a valer na hora.
 */
export async function podeVerPrevisaoDoBanco(
  session: { userId: string; role: string } | null,
): Promise<boolean> {
  if (!session) return false
  const { estadoDoUsuario } = await import('@/lib/autorizacao')
  const e = await estadoDoUsuario(session.userId)
  if (!e) return false
  return podeVerPrevisao({ role: session.role, permissoes: e.permissoes })
}

/** Pode LANÇAR na Previsão, conferido contra o banco. */
export async function podeGerenciarPrevisaoDoBanco(
  session: { userId: string; role: string } | null,
): Promise<boolean> {
  if (!session) return false
  const { estadoDoUsuario } = await import('@/lib/autorizacao')
  const e = await estadoDoUsuario(session.userId)
  if (!e) return false
  return podeGerenciarPrevisao({ role: session.role, permissoes: e.permissoes })
}

/** Pode administrar centros de custo, conferido contra o banco. */
export async function podeGerenciarCentrosCustoDoBanco(
  session: { userId: string; role: string } | null,
): Promise<boolean> {
  if (!session) return false
  const { estadoDoUsuario } = await import('@/lib/autorizacao')
  const e = await estadoDoUsuario(session.userId)
  if (!e) return false
  return podeGerenciarCentrosCusto({ role: session.role, permissoes: e.permissoes })
}
