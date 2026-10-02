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

import { hasPermission, permissaoRestrita } from '@/lib/permissions'

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
   * Aceita UMA chave ou uma LISTA — qualquer uma delas libera.
   *
   * A lista existe para Usuários: `manage_usuarios` implica consulta (quem
   * edita também lê), e exigir só `view_usuarios` barraria quem tem a alçada
   * mais forte. O contrário não vale — ler não dá direito de escrever, e isso
   * é conferido no handler, não aqui.
   */
  permissao?: string | string[]
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
  // ORDEM DAS SEÇÕES, e a leitura que ela produz:
  //
  //   EXECUTIVO  o retrato da empresa;
  //   RECEITA    a meta e o insumo diário que a alimenta;
  //   CARTEIRA   quem já é cliente;
  //   COMERCIAL  de onde vem o próximo;
  //   OPERAÇÕES  o que mantém o cliente funcionando;
  //   FINANCEIRO o que se faz com o dinheiro que entrou;
  //   ADMIN      quem pode o quê.
  //
  // CARTEIRA antes de COMERCIAL: a base instalada vem antes da prospecção,
  // porque é dela que sai a receita que a meta mede.
  {
    key: 'executivo',
    label: 'EXECUTIVO',
    enabled: true,
    features: [
      { key: 'cockpit', label: 'Cockpit', route: '/dashboard', api: ['/api/dashboard'], enabled: true, exact: true },
      // CONSELHO: SÓCIO **E** `view_conselho`. As duas, nunca uma.
      //
      // São perguntas diferentes. "É dono da empresa?" é um fato sobre a
      // pessoa, gravado em `User.isPartner`. "Está autorizado a abrir o painel
      // do conselho?" é uma alçada que se concede e se revoga na tela de
      // Usuários. Um sócio sem a chave não entra, e quem tem a chave sem ser
      // sócio também não.
      //
      // Ser ADMIN, ser Diretor ou estar no departamento Conselho NÃO basta, e
      // nenhuma das três infere as outras duas: administrar o sistema, estar
      // no topo da hierarquia e trabalhar com o conselho são coisas distintas
      // de ser dono. Inferir qualquer uma daria falso positivo.
      //
      // `liberada` faz o E: `socio` barra quem não é, e `permissao` barra quem
      // não tem a chave — que é RESTRITA, então nem o atalho de ADMIN a
      // concede. A autoridade final é `podeVerConselho` (lib/autorizacao), que
      // lê as duas do banco; aqui é só o menu.
      //
      // `/api/conselho` ainda não existe — a página lê direto do servidor. O
      // prefixo fica registrado de propósito: no dia em que uma API do
      // Conselho nascer, ela já estará restrita, em vez de depender de alguém
      // lembrar de restringi-la.
      {
        key: 'conselho', label: 'Conselho', route: '/dashboard/conselho',
        api: ['/api/conselho'], enabled: true, socio: true,
        permissao: 'view_conselho',
      },
    ],
  },
  {
    key: 'receita',
    label: 'RECEITA',
    enabled: true,
    features: [
      // RECEITA é o OBJETIVO e o INSUMO: a meta e o lançamento diário que a
      // alimenta. O Lançamento BaaS saiu daqui para o Financeiro — ele gera
      // lançamento financeiro, título a receber e título a pagar, e é ao lado
      // desses três que ele se confere.
      { key: 'receita.metas', label: 'Metas', route: '/dashboard/metas', api: ['/api/metas'], enabled: true },
      { key: 'receita.forecast', label: 'Lançamento Diário', route: '/dashboard/forecast', api: ['/api/forecast'], enabled: true },
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
    key: 'financeiro',
    label: 'FINANCEIRO',
    enabled: true,
    features: [
      // `exact` na Visão Geral pelo mesmo motivo do Cockpit: ela mora na raiz
      // do ambiente, e sem isso casaria por prefixo com todos os menus abaixo.
      { key: 'financeiro.visao', label: 'Visão Geral', route: '/dashboard/financeiro', api: ['/api/financeiro/visao-geral'], enabled: true, exact: true },
      { key: 'financeiro.lancamentos', label: 'Lançamentos', route: '/dashboard/financeiro/lancamentos', api: ['/api/financeiro/lancamentos'], enabled: true },
      // Contas a Pagar lê os MESMOS lançamentos de despesa da tela de
      // Lançamentos, pela data de vencimento. Não existe uma segunda base.
      { key: 'financeiro.pagar', label: 'Contas a Pagar', route: '/dashboard/financeiro/contas-pagar', api: ['/api/financeiro/contas-pagar'], enabled: true },
      { key: 'financeiro.contas', label: 'Contas a Receber', route: '/dashboard/financeiro/contas-receber', api: ['/api/financeiro/contas-receber'], enabled: true },
      { key: 'financeiro.categorias', label: 'Categorias', route: '/dashboard/financeiro/categorias', api: ['/api/financeiro/categorias'], enabled: true },
      { key: 'financeiro.fornecedores', label: 'Fornecedores', route: '/dashboard/financeiro/fornecedores', api: ['/api/financeiro/fornecedores'], enabled: true },
      { key: 'financeiro.condicoes', label: 'Condições BaaS', route: '/dashboard/financeiro/condicoes-baas', api: ['/api/financeiro/condicoes-baas'], enabled: true },
      // LANÇAMENTOS BAAS fecha o ambiente: ele tarifa o volume do parceiro e
      // produz os três registros que os menus acima administram.
      { key: 'financeiro.baas', label: 'Lançamentos BaaS', route: '/dashboard/lancamento-baas', api: ['/api/lancamento-baas'], enabled: true },
    ],
  },
  {
    key: 'admin',
    label: 'ADMIN',
    enabled: true,
    roles: ['ADMIN'],
    features: [
      // USUÁRIOS tem alçada PRÓPRIA — e é a chave que decide, não o perfil.
      //
      // `roles` lista os quatro perfis de propósito: a seção ADMIN restringe
      // a ADMIN, e herdar essa restrição tornaria `view_usuarios` inútil —
      // ninguém além de ADMIN poderia recebê-la, que é exatamente o contrário
      // de ter uma chave própria. Quem decide é `permissao`.
      //
      // Editar exige `manage_usuarios`, conferido no handler: consultar quem
      // tem acesso a quê é trabalho de auditoria e de suporte; alterar é de
      // quem responde pelas alçadas.
      {
        key: 'admin.usuarios', label: 'Usuários', route: '/dashboard/usuarios',
        api: ['/api/users'], enabled: true,
        roles: ['ADMIN', 'OPERACIONAL', 'COMERCIAL', 'GESTOR'],
        // Qualquer uma das duas abre a tela. Quem só edita também consulta.
        permissao: ['view_usuarios', 'manage_usuarios'],
      },
      // AUDITORIA É DE POUCOS, e de quem for autorizado — não de todo ADMIN.
      //
      // Mesma razão de listar os quatro perfis: a chave é restrita (nunca
      // concedida por perfil), e herdar `roles: ['ADMIN']` da seção impediria
      // conceder auditoria a alguém que não é administrador do sistema. A
      // chave é o gate.
      {
        key: 'admin.auditoria', label: 'Auditoria', route: '/dashboard/auditoria',
        api: ['/api/auditoria'], enabled: true,
        roles: ['ADMIN', 'OPERACIONAL', 'COMERCIAL', 'GESTOR'],
        permissao: 'view_auditoria',
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
 * A chave da função está concedida?
 *
 * Delega a `hasPermission`, que é a ÚNICA regra de permissão do produto — e é
 * ela que distingue os dois casos:
 *
 *   CHAVE RESTRITA (`view_auditoria`) → exige a chave na lista do usuário.
 *     Ser ADMIN não substitui, que é o ponto da Auditoria.
 *
 *   CHAVE NORMAL (`view_usuarios`)    → vale o atalho de ADMIN e o default do
 *     perfil, como em qualquer outra permissão do sistema.
 *
 * Esta função já comparou a lista com `includes` cru, e o efeito era um bug:
 * um ADMIN sem lista explícita de permissões — que é o caso da maioria dos
 * usuários em Production — perdia o menu de Usuários, porque `null.includes`
 * nunca encontra nada. A regra de permissão não pode ter duas implementações.
 */
/**
 * A função exige CHAVE RESTRITA?
 *
 * Restrita = concedida uma a uma, conferida contra o BANCO a cada
 * requisição, sem atalho de ADMIN (`PERMISSOES_RESTRITAS`).
 */
function exigeChaveRestrita(feature: Feature): boolean {
  if (!feature.permissao) return false
  const chaves = Array.isArray(feature.permissao) ? feature.permissao : [feature.permissao]
  return chaves.some((k) => permissaoRestrita(k))
}

function permissaoConcedida(
  feature: Feature, permissoes?: string[] | null, role?: string,
): boolean {
  if (!feature.permissao) return true
  const chaves = Array.isArray(feature.permissao) ? feature.permissao : [feature.permissao]
  // QUALQUER uma libera. Ver o comentário em `Feature.permissao`.
  return chaves.some((k) => hasPermission(permissoes ?? null, k, role ?? ''))
}

/**
 * Quem está pedindo. Além do perfil técnico, carrega as chaves restritas e a
 * condição de sócio — os três eixos que podem barrar uma função.
 */
export interface Contexto {
  role?: string
  permissoes?: string[] | null
  /**
   * `true` libera, `false` barra, `undefined` NÃO DECIDE.
   *
   * A indecisão é deliberada: quem não consegue consultar o banco — o proxy —
   * não deve opinar sobre quem é sócio. Ver `liberada`.
   */
  socio?: boolean
  /**
   * As `permissoes` acima vieram DO BANCO?
   *
   * `true`  → lista atual: chaves restritas podem ser decididas aqui.
   * ausente → lista do TOKEN: chaves restritas NÃO são decididas aqui.
   *
   * Mesma lógica de `socio`, e pelo mesmo motivo. O JWT fotografa as
   * permissões no login e vive 7 dias; uma chave restrita concedida depois
   * disso não está nele. Decidir por essa lista barra quem acabou de ser
   * autorizado — e foi exatamente o que aconteceu com o Conselho. Ver
   * `liberada`.
   */
  doBanco?: boolean
}

/**
 * Passa pelos filtros que o CONTEXTO consegue decidir.
 *
 * `socio` só é aplicado quando o chamador o informa EXPLICITAMENTE — e isso
 * é a correção de um bug real.
 *
 * ── POR QUE O PROXY NÃO PODE DECIDIR SÓCIO ──────────────────────────────
 *
 * O proxy roda no edge e não consulta o banco: tudo o que ele sabe vem do
 * JWT, que vive 7 dias. `isPartner` passou a entrar no token só a partir de
 * uma versão — então o cookie de quem já estava logado não o tinha.
 *
 * Com `undefined` tratado como "não é sócio", o efeito foi o oposto do
 * esperado: o sócio legítimo era BARRADO. A sidebar mostrava o Conselho
 * (ela lê do banco, num server component) e o clique levava a um redirect.
 * Token velho, para uma marca que nasce ausente, é restritivo — não
 * permissivo.
 *
 * Então a autoridade sobre `socio` é a PÁGINA e a API, que leem
 * `User.isPartner` do banco a cada requisição (`socio()` em lib/autorizacao).
 * É mais seguro, não menos: revogar passa a valer na hora, em vez de esperar
 * o token expirar.
 */
function liberada(feature: ResolvedFeature, ctx: Contexto): boolean {
  if (feature.socio && ctx.socio === false) return false

  if (!roleAllowed(feature, ctx.role)) return false

  /**
   * CHAVE RESTRITA NÃO SE DECIDE PELO TOKEN — o mesmo erro, agora na outra
   * metade da regra.
   *
   * O bug do `isPartner` (documentado abaixo) foi corrigido tratando `socio`
   * como tri-estado. Depois o Conselho ganhou uma segunda condição,
   * `view_conselho`, e ela entrou por `permissao` — que o proxy DECIDE, com a
   * lista do JWT. O resultado foi idêntico ao bug original:
   *
   *   1. a migration concedeu `view_conselho` a João Lima e Manuel;
   *   2. o JWT deles foi emitido ANTES disso e não tem a chave;
   *   3. `hasPermission` de chave restrita não tem atalho de ADMIN — exige a
   *      chave na lista —, então devolveu `false`;
   *   4. o proxy barrou no edge e redirecionou;
   *   5. a página, que leria o banco e liberaria, nunca foi alcançada.
   *
   * A sidebar mostrava o Conselho (ela lê do banco) e o clique levava embora.
   * Exatamente o sintoma relatado.
   *
   * Então chave restrita só é decidida quando as permissões vêm DO BANCO
   * (`doBanco`). Sem isso, o portão aqui não opina, e a autoridade é a página
   * e a API — que leem a lista atual a cada requisição, via
   * `podeVerConselho` / `autorizado`.
   *
   * NÃO é afrouxamento de segurança: a página e a API continuam exigindo a
   * chave, e agora com a lista CORRETA. O que deixa de acontecer é negar
   * acesso a quem tem a permissão gravada só porque o cookie é antigo — e
   * revogar passa a valer na hora, em vez de esperar o token expirar.
   *
   * Chaves COMUNS seguem decididas aqui: elas têm atalho de ADMIN e fallback
   * por perfil, então uma lista velha não as nega indevidamente.
   */
  if (exigeChaveRestrita(feature) && !ctx.doBanco) return true

  return permissaoConcedida(feature, ctx.permissoes, ctx.role)
}

/**
 * A rota exige ser SÓCIO?
 *
 * Existe para que a obrigação fique visível do lado de quem pode cumpri-la: a
 * página e a API, que consultam o banco. Uma função marcada `socio: true` sem
 * `socio()` no handler seria uma rota aberta.
 */
export function exigeSocio(pathname: string): boolean {
  const isApi = pathname.startsWith('/api/')
  return activeFeatures().some((f) => {
    if (!f.socio) return false
    const paths = isApi ? (f.api ?? []) : [f.route]
    return paths.some((p) => pathname === p || pathname.startsWith(p + '/'))
  })
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
/**
 * O MENU. As permissões chegam aqui vindas DO BANCO — `app/dashboard/layout`
 * as busca com `estadoDoUsuario` a cada navegação —, então `doBanco: true`:
 * chaves restritas SÃO aplicadas, e quem não tem a chave não vê o item.
 *
 * É o oposto do proxy, que decide com o token e por isso não opina sobre
 * chave restrita. Ver `liberada`.
 */
export function navigationFor(
  role: string, permissoes?: string[] | null, socio?: boolean,
): Array<{ key: string; label: string; items: ResolvedFeature[] }> {
  const ctx: Contexto = { role, permissoes, socio, doBanco: true }
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
  role?: string, permissoes?: string[] | null, socio?: boolean, doBanco?: boolean,
): string | null {
  // Destino de fallback precisa ser uma tela de menu — mandar o usuário para
  // uma área interna seria levá-lo a um lugar sem caminho de volta. E nunca
  // para uma tela restrita: cair no Conselho sem ter a chave devolveria 403.
  const feature = activeFeatures().find(
    (f) => !f.oculto && liberada(f, { role, permissoes, socio, doBanco }),
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
  /**
   * As permissões vieram do banco? O proxy OMITE — ele só tem o token, e
   * decidir chave restrita por lista velha barra quem acabou de ser
   * autorizado. Páginas e APIs que leem o banco passam `true`.
   */
  doBanco?: boolean,
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
  return liberada(maisEspecifica, { role, permissoes, socio, doBanco }) ? 'allow' : 'forbidden'
}
