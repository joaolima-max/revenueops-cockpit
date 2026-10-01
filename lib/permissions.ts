/**
 * CHAVES DE PERMISSÃO DO PRODUTO.
 *
 * Saíram nesta rodada, junto com os ambientes que eram os únicos a usá-las:
 * `view_relatorios`, `view_documents`, `download_documents`,
 * `manage_documents`, `view_forms`, `manage_forms`, `view_alertas`,
 * `manage_parametros` e `manage_automations`.
 *
 * Anexar arquivo continua existindo — em Lançamentos —, mas é autorizado por
 * `view_financeiro` / `manage_financeiro`: o anexo pertence ao lançamento, e
 * quem pode o lançamento pode o comprovante dele.
 *
 * `view_metricas_op` saiu junto com a tela: as métricas operacionais passaram a
 * ser o topo de Incidentes, e quem vê o incidente vê o indicador derivado dele.
 * Oferecer a permissão de uma tela inexistente faria o administrador conceder
 * um acesso que não abre nada.
 *
 * A CHAVE `view_crm` FICOU. Só o rótulo mudou, porque a tela virou "Visão
 * geral": renomear a chave invalidaria a permissão já gravada em cada usuário.
 */
export const ALL_PERMISSIONS = [
  // Cockpit
  { key: 'view_dashboard',   label: 'Ver Dashboard',           group: 'Cockpit' },
  { key: 'view_carteira',    label: 'Ver Carteira',             group: 'Cockpit' },
  { key: 'manage_carteira',  label: 'Gerenciar Clientes',       group: 'Cockpit' },
  { key: 'view_forecast',    label: 'Ver Forecast',             group: 'Cockpit' },
  { key: 'manage_forecast',  label: 'Editar Forecast',          group: 'Cockpit' },
  // Financeiro
  { key: 'view_financeiro',  label: 'Ver Financeiro',           group: 'Financeiro' },
  { key: 'manage_financeiro',label: 'Gerenciar Financeiro',     group: 'Financeiro' },
  { key: 'view_receita',     label: 'Ver Receita',              group: 'Financeiro' },
  { key: 'manage_receita',   label: 'Editar Receita',           group: 'Financeiro' },
  { key: 'view_metas',       label: 'Ver Metas',                group: 'Financeiro' },
  { key: 'manage_metas',     label: 'Editar Metas',             group: 'Financeiro' },
  { key: 'view_pedidos',     label: 'Ver Pedidos',              group: 'Financeiro' },
  { key: 'manage_pedidos',   label: 'Gerenciar Pedidos',        group: 'Financeiro' },
  { key: 'view_metricas',    label: 'Ver Métricas',             group: 'Financeiro' },
  // Operacional
  { key: 'view_incidentes',  label: 'Ver Incidentes',           group: 'Operacional' },
  { key: 'manage_incidentes',label: 'Gerenciar Incidentes',     group: 'Operacional' },
  { key: 'view_tarefas',     label: 'Ver Tarefas',              group: 'Operacional' },
  { key: 'manage_tarefas',   label: 'Gerenciar Tarefas',        group: 'Operacional' },
  { key: 'view_volumetria',  label: 'Ver Volumetria',           group: 'Operacional' },
  // CRM
  { key: 'view_leads',       label: 'Ver Leads',                group: 'CRM' },
  { key: 'manage_leads',     label: 'Gerenciar Leads',          group: 'CRM' },
  { key: 'view_pipeline',    label: 'Ver Pipeline',             group: 'CRM' },
  { key: 'manage_pipeline',  label: 'Gerenciar Pipeline',       group: 'CRM' },
  { key: 'admin_funis',      label: 'Administrar Funis',        group: 'CRM' },
  { key: 'view_followup',    label: 'Ver Follow-up',            group: 'CRM' },
  { key: 'manage_followup',  label: 'Gerenciar Follow-up',      group: 'CRM' },
  { key: 'view_crm',         label: 'Ver Visão Geral',          group: 'CRM' },
  // Certificados
  { key: 'view_certificates',   label: 'Ver Certificados',      group: 'Certificados' },
  { key: 'manage_certificates', label: 'Gerenciar Certificados', group: 'Certificados' },
  { key: 'reveal_certificate_password', label: 'Revelar Senha de Certificado', group: 'Certificados' },
  // Compliance
  { key: 'view_compliance',  label: 'Ver Compliance',           group: 'Compliance' },
  { key: 'manage_compliance',label: 'Gerenciar Compliance',     group: 'Compliance' },
  // Governança — concedidas UMA A UMA, nunca por perfil. Ver PERMISSOES_RESTRITAS.
  //
  // O CONSELHO NÃO ESTÁ AQUI. Ele é governado por `User.isPartner`, uma
  // coluna própria: ter a chave numa lista E a condição de sócio noutra
  // coluna criava duas fontes de verdade sobre o mesmo acesso, e foi
  // exatamente assim que o acesso ficou bloqueado para quem estava
  // configurado "no contexto de Conselho". Um eixo, um lugar.
  { key: 'view_auditoria',   label: 'Ver Auditoria',            group: 'Governança' },
  { key: 'manage_auditoria', label: 'Administrar Auditoria',     group: 'Governança' },
]

/**
 * CHAVES RESTRITAS — nunca concedidas por perfil, só por atribuição explícita.
 *
 * A Auditoria é de poucas pessoas, e o acesso a ela não acompanha o cargo:
 * ser ADMIN é poder operar o sistema, não ser auditor. Por isso
 * `hasPermission` não aplica aqui o atalho de ADMIN nem o fallback por perfil
 * — a chave precisa estar na lista do próprio usuário.
 *
 * Elas também ficam FORA de `DEFAULT_PERMISSIONS`, inclusive do ADMIN: um
 * default as devolveria pela porta de trás no primeiro usuário sem lista.
 *
 * O CONSELHO não é uma chave: é `User.isPartner` (ver `ehSocio`).
 */
export const PERMISSOES_RESTRITAS: readonly string[] = [
  'view_auditoria', 'manage_auditoria',
]

export function permissaoRestrita(key: string): boolean {
  return PERMISSOES_RESTRITAS.includes(key)
}

export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  // Tudo MENOS as restritas: ser ADMIN não é ser sócio nem auditor.
  ADMIN: ALL_PERMISSIONS.map(p => p.key).filter(k => !permissaoRestrita(k)),
  OPERACIONAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_receita', 'view_metas', 'view_pedidos', 'view_metricas',
    'view_incidentes', 'manage_incidentes', 'view_tarefas', 'manage_tarefas',
    'view_volumetria',
    'view_followup',
    // Compliance é operação: quem trata a pendência é o time operacional.
    'view_compliance', 'manage_compliance',
  ],
  COMERCIAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_metas', 'view_pedidos',
    'view_leads', 'manage_leads', 'view_pipeline', 'manage_pipeline',
    'view_followup', 'manage_followup',
  ],
  // Gestor de carteira: comercial + leitura do que cerca o cliente.
  // Sem administração de estrutura (funis).
  GESTOR: [
    'view_dashboard', 'view_carteira', 'manage_carteira', 'view_forecast',
    'view_metas', 'view_pedidos',
    'view_leads', 'manage_leads', 'view_pipeline', 'manage_pipeline',
    'view_followup', 'manage_followup',
    'view_crm', 'view_volumetria', 'view_compliance',
  ],
}

export function hasPermission(permissoes: string[] | null, key: string, role: string): boolean {
  // RESTRITAS PRIMEIRO. Sem atalho de ADMIN e sem fallback por perfil: a
  // chave tem de estar na lista do próprio usuário, ou o acesso não existe.
  if (permissaoRestrita(key)) return (permissoes ?? []).includes(key)

  if (role === 'ADMIN') return true
  if (!permissoes || permissoes.length === 0) {
    return (DEFAULT_PERMISSIONS[role] || []).includes(key)
  }
  return permissoes.includes(key)
}

/* ========================================================================= *
 * PERFIL · DEPARTAMENTO · HIERARQUIA
 *
 * Três eixos independentes, e nenhum deles concede acesso a Conselho ou
 * Auditoria — isso é sempre `PERMISSOES_RESTRITAS`.
 *
 *   PERFIL       o que o usuário é no sistema: Admin ou Colaborador.
 *   DEPARTAMENTO o contexto de trabalho — e quem recebe o aviso de uma área.
 *   HIERARQUIA   Diretor ou Operador.
 *
 * PERFIL É DERIVADO DE `role`, NÃO É UMA COLUNA NOVA. A coluna técnica
 * continua sendo a fonte do acesso por módulo, e há usuários em Production em
 * OPERACIONAL, COMERCIAL e GESTOR — as alçadas de funil referenciam esses
 * valores. Colapsá-la em dois perfis apagaria essa granularidade. A tela
 * apresenta dois perfis; o banco preserva os quatro.
 * ========================================================================= */

export type Perfil = 'ADMIN' | 'COLABORADOR'

export const DEPARTAMENTOS = [
  'FINANCEIRO', 'COMERCIAL', 'COMPLIANCE', 'OPERACOES', 'CONSELHO',
] as const
export type Departamento = typeof DEPARTAMENTOS[number]

export const DEPARTAMENTO_LABEL: Record<Departamento, string> = {
  FINANCEIRO: 'Financeiro',
  COMERCIAL: 'Comercial',
  COMPLIANCE: 'Compliance',
  OPERACOES: 'Operações',
  CONSELHO: 'Conselho',
}

export const HIERARQUIAS = ['DIRETOR', 'OPERADOR'] as const
export type Hierarquia = typeof HIERARQUIAS[number]

export const HIERARQUIA_LABEL: Record<Hierarquia, string> = {
  DIRETOR: 'Diretor',
  OPERADOR: 'Operador',
}

export const PERFIL_LABEL: Record<Perfil, string> = {
  ADMIN: 'Admin',
  COLABORADOR: 'Colaborador',
}

/** O perfil apresentado para uma role técnica. */
export function perfilDe(role: string): Perfil {
  return role === 'ADMIN' ? 'ADMIN' : 'COLABORADOR'
}

/**
 * A role técnica a gravar quando a tela escolhe um perfil.
 *
 * Admin é inequívoco. Colaborador NÃO é: existem três roles não-admin, e
 * escolher ao acaso trocaria as alçadas do usuário. Então:
 *
 *   - se a role atual já é de colaborador, ela é PRESERVADA;
 *   - só quando se está rebaixando um ADMIN é que o departamento decide a
 *     role, porque é a única pista disponível sobre o trabalho da pessoa.
 */
export function roleDoPerfil(
  perfil: Perfil, departamento: Departamento | null, roleAtual?: string | null,
): string {
  if (perfil === 'ADMIN') return 'ADMIN'
  if (roleAtual && roleAtual !== 'ADMIN') return roleAtual
  switch (departamento) {
    case 'COMERCIAL': return 'COMERCIAL'
    case 'FINANCEIRO': return 'GESTOR'
    case 'CONSELHO': return 'GESTOR'
    default: return 'OPERACIONAL'
  }
}

/** O departamento responsável por uma origem de notificação. */
export const DEPARTAMENTO_DA_ORIGEM: Record<string, Departamento> = {
  CONTA_PAGAR: 'FINANCEIRO',
  CONTA_RECEBER: 'FINANCEIRO',
  LANCAMENTO_DIARIO: 'FINANCEIRO',
  COMPLIANCE: 'COMPLIANCE',
}

/* ========================================================================= *
 * SÓCIO — a autorização do Conselho Administrativo
 * ========================================================================= */

/**
 * O Conselho Administrativo é dos SÓCIOS.
 *
 * Por que uma coluna e não uma chave de permissão: ser sócio não é uma
 * autorização que se concede e revoga como "ver tarefas" — é um fato sobre a
 * pessoa. E manter as duas coisas (uma flag de sócio E uma chave na lista)
 * criava duas fontes de verdade sobre o mesmo acesso: o usuário aparecia
 * configurado no contexto de Conselho e continuava bloqueado, porque a outra
 * metade não tinha sido marcada.
 *
 * NENHUM outro eixo implica em sócio, de propósito:
 *
 *   - PERFIL Admin        → administra o sistema;
 *   - HIERARQUIA Diretor  → está no topo da hierarquia;
 *   - DEPARTAMENTO Conselho → trabalha com o conselho;
 *
 * e nada disso é ser dono da empresa. Inferir de qualquer um dos três daria
 * falso positivo — é justamente o que esta função existe para impedir.
 */
export function ehSocio(u: { isPartner?: boolean | null } | null | undefined): boolean {
  return !!u?.isPartner
}

/**
 * A LIXEIRA DE LEADS é de DIRETORES.
 *
 * Hierarquia, não perfil: um Diretor Colaborador vê a lixeira, e um Admin
 * Operador não. São eixos independentes — a hierarquia diz quem responde pela
 * área, e é quem responde que precisa poder auditar o que foi descartado.
 */
export function podeVerLixeira(
  u: { hierarquia?: string | null } | null | undefined,
): boolean {
  return u?.hierarquia === 'DIRETOR'
}

/**
 * GESTOR DE CONTA é responsabilidade pela conta — e nada além disso.
 *
 * Não é Diretor, não é sócio, não é Admin. Um Operador Colaborador pode ser
 * gestor; um Diretor pode não ser. Por isso a elegibilidade é só "usuário
 * ativo": qualquer filtro por hierarquia ou perfil aqui transformaria uma
 * atribuição operacional numa questão de cargo.
 */
export function podeSerGestorDeConta(
  u: { active?: boolean | null } | null | undefined,
): boolean {
  return !!u?.active
}
