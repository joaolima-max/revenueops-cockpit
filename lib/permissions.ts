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
]

export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS.map(p => p.key),
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
  if (role === 'ADMIN') return true
  if (!permissoes || permissoes.length === 0) {
    return (DEFAULT_PERMISSIONS[role] || []).includes(key)
  }
  return permissoes.includes(key)
}
