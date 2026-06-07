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
  { key: 'view_relatorios',  label: 'Ver Relatórios',           group: 'Financeiro' },
  { key: 'view_metricas',    label: 'Ver Métricas',             group: 'Financeiro' },
  // Operacional
  { key: 'view_incidentes',  label: 'Ver Incidentes',           group: 'Operacional' },
  { key: 'manage_incidentes',label: 'Gerenciar Incidentes',     group: 'Operacional' },
  { key: 'view_tarefas',     label: 'Ver Tarefas',              group: 'Operacional' },
  { key: 'manage_tarefas',   label: 'Gerenciar Tarefas',        group: 'Operacional' },
  { key: 'view_ranking',     label: 'Ver Ranking',              group: 'Operacional' },
  { key: 'view_metricas_op', label: 'Ver Métricas Operacionais',group: 'Operacional' },
  { key: 'view_volumetria',  label: 'Ver Volumetria',           group: 'Operacional' },
  // CRM
  { key: 'view_leads',       label: 'Ver Leads',                group: 'CRM' },
  { key: 'manage_leads',     label: 'Gerenciar Leads',          group: 'CRM' },
  { key: 'view_pipeline',    label: 'Ver Pipeline',             group: 'CRM' },
  { key: 'manage_pipeline',  label: 'Gerenciar Pipeline',       group: 'CRM' },
  { key: 'view_followup',    label: 'Ver Follow-up',            group: 'CRM' },
  { key: 'manage_followup',  label: 'Gerenciar Follow-up',      group: 'CRM' },
  // Admin
  { key: 'view_alertas',     label: 'Ver Alertas',              group: 'Admin' },
  { key: 'manage_parametros',label: 'Gerenciar Parâmetros',     group: 'Admin' },
]

export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSIONS.map(p => p.key),
  OPERACIONAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_receita', 'view_metas', 'view_pedidos', 'view_metricas',
    'view_incidentes', 'manage_incidentes', 'view_tarefas', 'manage_tarefas',
    'view_ranking', 'view_metricas_op', 'view_volumetria', 'view_alertas',
    'view_followup',
  ],
  COMERCIAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_metas', 'view_pedidos',
    'view_leads', 'manage_leads', 'view_pipeline', 'manage_pipeline',
    'view_followup', 'manage_followup',
  ],
}

export function hasPermission(permissoes: string[] | null, key: string, role: string): boolean {
  if (role === 'ADMIN') return true
  if (!permissoes || permissoes.length === 0) {
    return (DEFAULT_PERMISSIONS[role] || []).includes(key)
  }
  return permissoes.includes(key)
}
