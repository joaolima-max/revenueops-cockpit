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
  /**
   * Chave RESTRITA que governa esta função (`PERMISSOES_RESTRITAS`).
   *
   * Existe para o Conselho e a Auditoria: o acesso a eles não acompanha o
   * cargo, então não pode ser expresso em `roles`. Quando presente, a função
   * só aparece no menu e só libera a rota para quem tem a chave gravada —
   * ser ADMIN não basta.
   *
   * O proxy confere pela lista do token (defesa em profundidade, podendo
   * estar até 7 dias atrasada no sentido PERMISSIVO); a palavra final é de
   * `autorizado()`, que lê do banco a cada requisição.
   */
  permissao?: string
  /**
   * Função que exige ser SÓCIO. Hoje, só o Conselho Administrativo.
   *
   * Não é `permissao` porque ser sócio não é uma chave que se concede e
   * revoga: é um fato sobre a pessoa, gravado em `User.isPartner`. Manter as
   * duas coisas criava duas fontes de verdade sobre o mesmo acesso.
   */
  socio?: boolean
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
      // CONSELHO É DOS SÓCIOS — `socio`, não `roles` nem `permissao`.
      //
      // Ser ADMIN é operar o sistema; ser Diretor é estar no topo da
      // hierarquia; estar no departamento Conselho é trabalhar com o conselho.
      // Nenhuma das três é ser dono da empresa, e inferir de qualquer uma
      // delas daria falso positivo.
      //
      // `/api/conselho` ainda não existe — a página lê direto do servidor. O
      // prefixo fica registrado de propósito: no dia em que uma API do
      // Conselho nascer, ela já estará restrita, em vez de depender de alguém
      // lembrar de restringi-la.
      {
        key: 'conselho', label: 'Conselho', route: '/dashboard/conselho',
        api: ['/api/conselho'], enabled: true, socio: true,
      },
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
      // ORDEM: Tarefas, Incidentes, Compliance.
      { key: 'operacoes.tarefas', label: 'Tarefas', route: '/dashboard/tarefas', api: ['/api/tarefas'], enabled: true },
      // As métricas operacionais não são um menu: são derivadas dos
      // incidentes, e separá-las obrigava a abrir duas telas para o mesmo
      // fato. Moram no topo de Incidentes, acima do registro.
      { key: 'operacoes.incidentes', label: 'Incidentes', route: '/dashboard/incidentes', api: ['/api/incidentes'], enabled: true },
      { key: 'operacoes.compliance', label: 'Compliance', route: '/dashboard/compliance', api: ['/api/compliance'], enabled: true },
    ],
  },
  {
    key: 'comercial',
    label: 'COMERCIAL',
    enabled: true,
    features: [
      // ORDEM: Visão geral, Leads, Pipeline, Follow Up.
      // A leitura agregada abre o ambiente; o cadastro do lead vem antes do
      // quadro, porque é o lead que alimenta o card.
      { key: 'comercial.crm', label: 'Visão geral', route: '/dashboard/crm', api: ['/api/crm'], enabled: true },
      { key: 'comercial.leads', label: 'Leads', route: '/dashboard/leads', api: ['/api/leads'], enabled: true },
      { key: 'comercial.pipeline', label: 'Pipeline', route: '/dashboard/pipeline', api: ['/api/deals', '/api/pipeline/board', '/api/pipeline/cards'], enabled: true },
      { key: 'comercial.followup', label: 'Follow Up', route: '/dashboard/followup', api: ['/api/followup'], enabled: true },
      // LIXEIRA DE LEADS — registrada e OCULTA, como os Funis. Não é um
      // ambiente: é a consulta do que foi descartado, e quem a vê são os
      // DIRETORES. A restrição por hierarquia não cabe em `roles` (que é
      // perfil técnico), então a página e a API conferem `diretor()` — este
      // registro existe para que a rota não fique aberta por omissão.
      {
        key: 'comercial.lixeira', label: 'Lixeira de Leads',
        route: '/dashboard/leads/lixeira', api: ['/api/leads/lixeira'],
        enabled: true, oculto: true,
      },
      // FUNIS NÃO É MENU. A administração de funis é área interna do Pipeline,
      // em `/dashboard/pipeline/funis`. O registro permanece — `oculto` tira
      // da sidebar sem tirar do controle de acesso, e é ele que mantém a rota
      // e as APIs restritas a ADMIN.
      {
        key: 'comercial.funis', label: 'Funis', route: '/dashboard/pipeline/funis',
        api: ['/api/pipeline/funis', '/api/pipeline/etapas'],
        enabled: true, roles: ['ADMIN'], oculto: true,
      },
    ],
  },
  {
    key: 'receita',
    label: 'RECEITA',
    enabled: true,
    features: [
      // RECEITA é separada de FINANCEIRO, de propósito. Receita é o que a
      // operação PRODUZ — o objetivo, o insumo diário e o faturamento dos
      // parceiros. Financeiro é o que se FAZ com isso: caixa, títulos,
      // categorias, fornecedores. Misturar as duas fazia a meta aparecer no
      // meio das contas a pagar.
      { key: 'receita.metas', label: 'Metas', route: '/dashboard/metas', api: ['/api/metas'], enabled: true },
      { key: 'receita.forecast', label: 'Lançamento Diário', route: '/dashboard/forecast', api: ['/api/forecast'], enabled: true },
      // Lançamento BaaS mora aqui porque é lançamento de RECEITA operacional:
      // tarifa o volume do parceiro e produz o faturamento do período.
      { key: 'receita.baas', label: 'Lançamento BaaS', route: '/dashboard/lancamento-baas', api: ['/api/lancamento-baas'], enabled: true },
    ],
  },
  {
    key: 'financeiro',
    label: 'FINANCEIRO',
    enabled: true,
    features: [
      // `exact` na Visão Geral pelo mesmo motivo do Cockpit: ela mora na raiz
      // do ambiente, e sem isso casaria por prefixo com todos os menus abaixo.
      { key: 'financeiro.visao', label: 'Visão Geral', route: '/dashboard/financeiro', api: ['/api/financeiro/visao-geral'], enabled: true, exact: true },
      { key: 'financeiro.lancamentos', label: 'Lançamentos', route: '/dashboard/financeiro/lancamentos', api: ['/api/financeiro/lancamentos'], enabled: true },
      { key: 'financeiro.contas', label: 'Contas a Receber', route: '/dashboard/financeiro/contas-receber', api: ['/api/financeiro/contas-receber'], enabled: true },
      // Contas a Pagar lê os MESMOS lançamentos de despesa da tela de
      // Lançamentos, pela data de vencimento. Não existe uma segunda base.
      { key: 'financeiro.pagar', label: 'Contas a Pagar', route: '/dashboard/financeiro/contas-pagar', api: ['/api/financeiro/contas-pagar'], enabled: true },
      { key: 'financeiro.categorias', label: 'Categorias', route: '/dashboard/financeiro/categorias', api: ['/api/financeiro/categorias'], enabled: true },
      { key: 'financeiro.fornecedores', label: 'Fornecedores', route: '/dashboard/financeiro/fornecedores', api: ['/api/financeiro/fornecedores'], enabled: true },
      { key: 'financeiro.condicoes', label: 'Condições BaaS', route: '/dashboard/financeiro/condicoes-baas', // `/produtos` não precisa de entrada própria: `checkAccess` casa por
      // prefixo, então o pai já protege a sub-rota. Listar os dois faria um
      // engolir o outro na resolução por rota mais específica.
      api: ['/api/financeiro/condicoes-baas'], enabled: true },
    ],
  },
  {
    key: 'admin',
    label: 'ADMIN',
    enabled: true,
    roles: ['ADMIN'],
    features: [
      { key: 'admin.usuarios', label: 'Usuários', route: '/dashboard/usuarios', api: ['/api/users'], enabled: true },
      // AUDITORIA É DE POUCOS. Mesmo raciocínio do Conselho: a chave é
      // restrita, então nem todo ADMIN entra — só quem foi autorizado.
      {
        key: 'admin.auditoria', label: 'Auditoria', route: '/dashboard/auditoria',
        api: ['/api/auditoria'], enabled: true, permissao: 'view_auditoria',
      },
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
 * A chave restrita da função está concedida?
 *
 * Função sem `permissao` passa direto. Com `permissao`, exige a chave na lista
 * — e ser ADMIN não substitui, que é exatamente o ponto do Conselho e da
 * Auditoria.
 */
function permissaoConcedida(feature: Feature, permissoes?: string[] | null): boolean {
  if (!feature.permissao) return true
  return !!permissoes && permissoes.includes(feature.permissao)
}

/**
 * Quem está pedindo. Além do perfil técnico, carrega as chaves restritas e a
 * condição de sócio — os três eixos que podem barrar uma função.
 */
export interface Contexto {
  role?: string
  permissoes?: string[] | null
  socio?: boolean
}

/** Passa pelos três filtros: perfil, chave restrita e sócio. */
function liberada(feature: ResolvedFeature, ctx: Contexto): boolean {
  if (feature.socio && !ctx.socio) return false
  return roleAllowed(feature, ctx.role) && permissaoConcedida(feature, ctx.permissoes)
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
export function navigationFor(
  role: string, permissoes?: string[] | null, socio?: boolean,
): Array<{ key: string; label: string; items: ResolvedFeature[] }> {
  const ctx: Contexto = { role, permissoes, socio }
  return MODULES.filter((m) => m.enabled)
    .map((m) => ({
      key: m.key,
      label: m.label,
      items: activeFeatures().filter(
        (f) => f.moduleKey === m.key && !f.oculto && liberada(f, ctx),
      ),
    }))
    .filter((section) => section.items.length > 0)
}

/**
 * Primeira rota que o perfil ainda pode acessar. Usada como destino quando o
 * usuário cai numa função desligada — inclusive quando o próprio Cockpit foi
 * desligado, caso em que redirecionar para `/dashboard` criaria um loop.
 */
export function firstAvailableRoute(
  role?: string, permissoes?: string[] | null, socio?: boolean,
): string | null {
  // Destino de fallback precisa ser uma tela de menu — mandar o usuário para
  // uma área interna seria levá-lo a um lugar sem caminho de volta. E nunca
  // para uma tela restrita: cair no Conselho sem ter a chave devolveria 403.
  const feature = activeFeatures().find(
    (f) => !f.oculto && liberada(f, { role, permissoes, socio }),
  )
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
export function checkAccess(
  pathname: string, role?: string, permissoes?: string[] | null, socio?: boolean,
): AccessVerdict {
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
  return liberada(maisEspecifica, { role, permissoes, socio }) ? 'allow' : 'forbidden'
}
