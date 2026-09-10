/**
 * REGISTRO CENTRAL DE MÓDULOS — fonte única de verdade do produto.
 *
 * Para desabilitar qualquer função do sistema, mude `enabled` para `false`
 * na entrada correspondente abaixo. Isso propaga automaticamente para:
 *
 *   1. Navegação  — o item some da sidebar
 *   2. Rota       — o acesso direto pela URL é bloqueado (proxy.ts)
 *   3. API        — os endpoints da função passam a responder 404
 *
 * Nenhuma outra alteração é necessária. Não existe painel de auto-serviço
 * para esses toggles: a mudança é feita aqui, em código, sob solicitação
 * do responsável pelo produto.
 *
 * Desabilitar um MÓDULO desliga todas as funções dentro dele.
 * Desabilitar uma FUNÇÃO desliga apenas ela.
 */

export type Role = 'ADMIN' | 'OPERACIONAL' | 'COMERCIAL' | 'GESTOR'

export interface Feature {
  /** Identificador estável. Usado por `isFeatureEnabled()` e pelos ícones da sidebar. */
  key: string
  label: string
  /** Rota da página no dashboard. */
  route: string
  /** Prefixos de API que pertencem a esta função. Bloqueados junto com ela. */
  api?: string[]
  enabled: boolean
  /** Perfis com acesso. Ausente = todos os perfis autenticados. */
  roles?: Role[]
  /** Casa a rota exatamente, sem subcaminhos. Usado só pelo Cockpit (`/dashboard`). */
  exact?: boolean
}

export interface Module {
  key: string
  label: string
  enabled: boolean
  roles?: Role[]
  features: Feature[]
}

/**
 * Rotas que nunca são bloqueadas por este registro — autenticação, perfil do
 * próprio usuário e os dados do cockpit. Desligá-las quebraria o login.
 */
export const ALWAYS_ON = [
  '/api/auth', '/api/perfil', '/dashboard/perfil',
  // Cada usuario ve as SUAS notificacoes; nao ha o que autorizar por modulo.
  '/api/notificacoes', '/dashboard/notificacoes',
]

export const MODULES: Module[] = [
  {
    key: 'executivo',
    label: 'EXECUTIVO',
    enabled: true,
    features: [
      { key: 'cockpit', label: 'Cockpit', route: '/dashboard', api: ['/api/dashboard'], enabled: true, exact: true },
      { key: 'conselho', label: 'Conselho', route: '/dashboard/conselho', enabled: true },
    ],
  },
  {
    key: 'receita',
    label: 'RECEITA',
    enabled: true,
    features: [
      { key: 'receita.forecast', label: 'Lançamento Diário', route: '/dashboard/forecast', api: ['/api/forecast'], enabled: true },
      { key: 'receita.metas', label: 'Metas', route: '/dashboard/metas', api: ['/api/metas'], enabled: true },
      { key: 'receita.relatorios', label: 'Relatórios', route: '/dashboard/relatorios', api: ['/api/relatorios'], enabled: true },
    ],
  },
  {
    key: 'carteira',
    label: 'CARTEIRA',
    enabled: true,
    features: [
      { key: 'carteira.clientes', label: 'Clientes', route: '/dashboard/carteira', api: ['/api/clientes'], enabled: true },
      { key: 'carteira.volumetria', label: 'Volumetria', route: '/dashboard/volumetria', api: ['/api/volumetria'], enabled: true },
      { key: 'carteira.alertas', label: 'Alertas', route: '/dashboard/alertas', enabled: true },
      { key: 'carteira.documentos', label: 'Documentos', route: '/dashboard/documentos', api: ['/api/documentos'], enabled: true },
      { key: 'carteira.certificados', label: 'Certificados', route: '/dashboard/certificados', api: ['/api/certificados'], enabled: true },
    ],
  },
  {
    key: 'operacoes',
    label: 'OPERAÇÕES',
    enabled: true,
    features: [
      { key: 'operacoes.incidentes', label: 'Incidentes', route: '/dashboard/incidentes', api: ['/api/incidentes'], enabled: true },
      { key: 'operacoes.tarefas', label: 'Tarefas', route: '/dashboard/tarefas', api: ['/api/tarefas'], enabled: true },
      { key: 'operacoes.metricas', label: 'Métricas Op.', route: '/dashboard/metricas-op', enabled: true },
      { key: 'operacoes.compliance', label: 'Compliance', route: '/dashboard/compliance', api: ['/api/compliance'], enabled: true },
    ],
  },
  {
    key: 'comercial',
    label: 'COMERCIAL',
    enabled: true,
    features: [
      { key: 'comercial.pipeline', label: 'Pipeline', route: '/dashboard/pipeline', api: ['/api/deals', '/api/pipeline'], enabled: true },
      // Ambiente administrativo dos funis. Fica sob /dashboard/pipeline, que o
      // `checkAccess` casa por prefixo — por isso o proxy NAO consegue separar as
      // duas rotas, e o `administrar` e verificado na pagina e em cada API.
      { key: 'comercial.funis', label: 'Funis', route: '/dashboard/pipeline/funis', enabled: true, roles: ['ADMIN'] },
      { key: 'comercial.leads', label: 'Leads', route: '/dashboard/leads', api: ['/api/leads'], enabled: true },
      { key: 'comercial.followup', label: 'Follow-up', route: '/dashboard/followup', api: ['/api/followup'], enabled: true },
      { key: 'comercial.crm', label: 'CRM', route: '/dashboard/crm', api: ['/api/crm'], enabled: true },
      { key: 'comercial.formularios', label: 'Formulários', route: '/dashboard/formularios', api: ['/api/formularios'], enabled: true },
    ],
  },
  {
    key: 'financeiro',
    label: 'FINANCEIRO',
    enabled: true,
    features: [
      { key: 'financeiro.contas', label: 'Contas a Receber', route: '/dashboard/financeiro', api: ['/api/financeiro'], enabled: true },
    ],
  },
  {
    key: 'admin',
    label: 'ADMIN',
    enabled: true,
    roles: ['ADMIN'],
    features: [
      { key: 'admin.usuarios', label: 'Usuários', route: '/dashboard/usuarios', api: ['/api/users'], enabled: true },
      { key: 'admin.parametros', label: 'Parâmetros', route: '/dashboard/parametros', api: ['/api/parametros', '/api/float-config'], enabled: true },
      { key: 'admin.auditoria', label: 'Auditoria', route: '/dashboard/auditoria', api: ['/api/auditoria'], enabled: true },
      { key: 'admin.automacoes', label: 'Automações', route: '/dashboard/automacoes', api: ['/api/automacoes'], enabled: true },
    ],
  },
]

/** Uma função ativa, já achatada com o módulo a que pertence. */
export interface ResolvedFeature extends Feature {
  moduleKey: string
  moduleLabel: string
  /** Perfis efetivos: os da função, ou os do módulo quando a função não define. */
  effectiveRoles?: Role[]
}

/** Todas as funções ligadas (módulo ligado E função ligada). */
export function activeFeatures(): ResolvedFeature[] {
  return MODULES.filter((m) => m.enabled).flatMap((m) =>
    m.features
      .filter((f) => f.enabled)
      .map((f) => ({
        ...f,
        moduleKey: m.key,
        moduleLabel: m.label,
        effectiveRoles: f.roles ?? m.roles,
      }))
  )
}

function roleAllowed(feature: ResolvedFeature, role?: string): boolean {
  if (!feature.effectiveRoles) return true
  return !!role && feature.effectiveRoles.includes(role as Role)
}

/**
 * Uma função está ligada? Use dentro de páginas e componentes para esconder
 * blocos de UI que pertencem a uma função desligada.
 */
export function isFeatureEnabled(key: string): boolean {
  return activeFeatures().some((f) => f.key === key)
}

/**
 * Navegação da sidebar para um perfil: só módulos e funções ligados, e só o
 * que o perfil pode ver. Seções que ficam vazias são omitidas.
 */
export function navigationFor(role: string): Array<{ key: string; label: string; items: ResolvedFeature[] }> {
  return MODULES.filter((m) => m.enabled)
    .map((m) => ({
      key: m.key,
      label: m.label,
      items: activeFeatures().filter((f) => f.moduleKey === m.key && roleAllowed(f, role)),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * Primeira rota que o perfil ainda pode acessar. Usada como destino quando o
 * usuário cai numa função desligada — inclusive quando o próprio Cockpit foi
 * desligado, caso em que redirecionar para `/dashboard` criaria um loop.
 */
export function firstAvailableRoute(role?: string): string | null {
  const feature = activeFeatures().find((f) => roleAllowed(f, role))
  return feature?.route ?? null
}

export type AccessVerdict = 'allow' | 'disabled' | 'forbidden'

/**
 * Decide o acesso a um caminho. Usado pelo proxy para bloquear tanto páginas
 * quanto APIs de funções desligadas — sem isso, desabilitar só esconderia o
 * item do menu e a URL continuaria acessível.
 *
 * Caminhos que não pertencem a nenhuma função registrada são liberados, para
 * que rotas novas não fiquem inacessíveis por esquecimento.
 */
export function checkAccess(pathname: string, role?: string): AccessVerdict {
  if (ALWAYS_ON.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'allow'

  const isApi = pathname.startsWith('/api/')
  const matches = (f: Feature) => {
    const paths = isApi ? (f.api ?? []) : [f.route]
    return paths.some((p) =>
      f.exact && !isApi ? pathname === p : pathname === p || pathname.startsWith(p + '/')
    )
  }

  // Registrado em alguma função, mas essa função está desligada?
  const known = MODULES.flatMap((m) => m.features).some(matches)
  if (!known) return 'allow'

  const active = activeFeatures().filter(matches)
  if (active.length === 0) return 'disabled'

  return active.some((f) => roleAllowed(f, role)) ? 'allow' : 'forbidden'
}
