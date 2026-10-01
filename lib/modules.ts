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
  /** Casa a rota exatamente, sem subcaminhos. Usado pelas funções que moram na
   * raiz de um ambiente — o Cockpit (`/dashboard`) e a Visão Geral do
   * Financeiro (`/dashboard/financeiro`) — para que não engulam os menus que
   * ficam abaixo delas. */
  exact?: boolean
  /**
   * Função REGISTRADA mas fora da sidebar.
   *
   * Existe para a administração de funis: ela deixou de ser um menu e virou
   * uma área interna do Pipeline, mas continua precisando do registro — é ele
   * que aplica a restrição de ADMIN à rota e às APIs (`checkAccess`). Apagar a
   * entrada em vez de ocultá-la liberaria `/api/pipeline/funis` para qualquer
   * usuário autenticado, porque caminho não registrado é caminho permitido.
   */
  oculto?: boolean
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
    ],
  },
  {
    key: 'carteira',
    label: 'CARTEIRA',
    enabled: true,
    features: [
      { key: 'carteira.clientes', label: 'Clientes', route: '/dashboard/carteira', api: ['/api/clientes'], enabled: true },
      { key: 'carteira.volumetria', label: 'Volumetria', route: '/dashboard/volumetria', api: ['/api/volumetria'], enabled: true },
      { key: 'carteira.certificados', label: 'Certificados', route: '/dashboard/certificados', api: ['/api/certificados'], enabled: true },
    ],
  },
  {
    key: 'operacoes',
    label: 'OPERAÇÕES',
    enabled: true,
    features: [
      // As métricas operacionais deixaram de ser um menu: elas são derivadas
      // dos incidentes, e separá-las obrigava a abrir duas telas para ler o
      // mesmo fato. Agora moram no topo de Incidentes, acima do registro.
      { key: 'operacoes.incidentes', label: 'Incidentes', route: '/dashboard/incidentes', api: ['/api/incidentes'], enabled: true },
      { key: 'operacoes.tarefas', label: 'Tarefas', route: '/dashboard/tarefas', api: ['/api/tarefas'], enabled: true },
      { key: 'operacoes.compliance', label: 'Compliance', route: '/dashboard/compliance', api: ['/api/compliance'], enabled: true },
    ],
  },
  {
    key: 'comercial',
    label: 'COMERCIAL',
    enabled: true,
    features: [
      // A analítica do Pipeline abre o ambiente: a pergunta "como está o
      // comercial" vem antes de "o que fazer com este card".
      { key: 'comercial.crm', label: 'Visão geral', route: '/dashboard/crm', api: ['/api/crm'], enabled: true },
      { key: 'comercial.pipeline', label: 'Pipeline', route: '/dashboard/pipeline', api: ['/api/deals', '/api/pipeline/board', '/api/pipeline/cards'], enabled: true },
      // FUNIS NÃO É MENU. A administração de funis virou área interna do
      // Pipeline, em `/dashboard/pipeline/funis`. O registro permanece —
      // `oculto` tira da sidebar sem tirar do controle de acesso, e é ele que
      // mantém a rota e as APIs restritas a ADMIN.
      {
        key: 'comercial.funis', label: 'Funis', route: '/dashboard/pipeline/funis',
        api: ['/api/pipeline/funis', '/api/pipeline/etapas'],
        enabled: true, roles: ['ADMIN'], oculto: true,
      },
      { key: 'comercial.leads', label: 'Leads', route: '/dashboard/leads', api: ['/api/leads'], enabled: true },
      { key: 'comercial.followup', label: 'Follow-up', route: '/dashboard/followup', api: ['/api/followup'], enabled: true },
    ],
  },
  {
    key: 'financeiro',
    label: 'FINANCEIRO',
    enabled: true,
    features: [
      // `exact` na Visao Geral pelo mesmo motivo do Cockpit: ela mora na raiz
      // do ambiente, e sem isso casaria por prefixo com todos os menus abaixo.
      { key: 'financeiro.visao', label: 'Visão Geral', route: '/dashboard/financeiro', api: ['/api/financeiro/visao-geral'], enabled: true, exact: true },
      { key: 'financeiro.lancamentos', label: 'Lançamentos', route: '/dashboard/financeiro/lancamentos', api: ['/api/financeiro/lancamentos'], enabled: true },
      { key: 'financeiro.contas', label: 'Contas a Receber', route: '/dashboard/financeiro/contas-receber', api: ['/api/financeiro/contas-receber'], enabled: true },
      // Contas a Pagar le os MESMOS lancamentos de despesa da tela de
      // Lancamentos, pela data de vencimento. Nao existe uma segunda base.
      { key: 'financeiro.pagar', label: 'Contas a Pagar', route: '/dashboard/financeiro/contas-pagar', api: ['/api/financeiro/contas-pagar'], enabled: true },
      { key: 'financeiro.categorias', label: 'Categorias', route: '/dashboard/financeiro/categorias', api: ['/api/financeiro/categorias'], enabled: true },
      { key: 'financeiro.fornecedores', label: 'Fornecedores', route: '/dashboard/financeiro/fornecedores', api: ['/api/financeiro/fornecedores'], enabled: true },
      { key: 'financeiro.condicoes', label: 'Condições BaaS', route: '/dashboard/financeiro/condicoes-baas', api: ['/api/financeiro/condicoes-baas'], enabled: true },
    ],
  },
  {
    key: 'admin',
    label: 'ADMIN',
    enabled: true,
    roles: ['ADMIN'],
    features: [
      { key: 'admin.usuarios', label: 'Usuários', route: '/dashboard/usuarios', api: ['/api/users'], enabled: true },
      { key: 'admin.auditoria', label: 'Auditoria', route: '/dashboard/auditoria', api: ['/api/auditoria'], enabled: true },
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
      items: activeFeatures().filter((f) => f.moduleKey === m.key && !f.oculto && roleAllowed(f, role)),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * Primeira rota que o perfil ainda pode acessar. Usada como destino quando o
 * usuário cai numa função desligada — inclusive quando o próprio Cockpit foi
 * desligado, caso em que redirecionar para `/dashboard` criaria um loop.
 */
export function firstAvailableRoute(role?: string): string | null {
  // Destino de fallback precisa ser uma tela de menu — mandar o usuário para
  // uma área interna seria levá-lo a um lugar sem caminho de volta.
  const feature = activeFeatures().find((f) => !f.oculto && roleAllowed(f, role))
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

  /**
   * `/dashboard/pipeline/funis` casa com DUAS funções: Pipeline (por prefixo) e
   * Funis (exata). Quem decide é a MAIS ESPECÍFICA — senão a permissão aberta
   * do Pipeline anularia a restrição de ADMIN da administração de funis.
   */
  const maisEspecifica = active.reduce((a, b) => (b.route.length > a.route.length ? b : a))
  return roleAllowed(maisEspecifica, role) ? 'allow' : 'forbidden'
}
