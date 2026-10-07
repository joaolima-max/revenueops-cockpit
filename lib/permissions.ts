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
  /**
   * PREVISÃO — chaves COMUNS, não restritas.
   *
   * Seguem o atalho de ADMIN e o default por perfil, como `view_financeiro`:
   * previsão é trabalho do Financeiro, não um dado de sócio. Entrar em
   * `PERMISSOES_RESTRITAS` obrigaria a conceder a chave uma a uma a quem já
   * responde pelo módulo, sem ganho de segurança.
   *
   * SÃO DUAS, e a separação é a mesma de Usuários: CONSULTAR o orçamento e o
   * forecast é leitura executiva, que muita gente precisa; LANÇAR orçamento,
   * despesa futura e receita prevista é decisão de quem responde pelo
   * planejamento. Com uma chave só, quem precisasse ver o forecast ganharia o
   * poder de reescrever o orçamento.
   */
  { key: 'view_previsao',    label: 'Ver Previsão',             group: 'Financeiro' },
  { key: 'manage_previsao',  label: 'Gerenciar Previsão',       group: 'Financeiro' },
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
  // Administração
  { key: 'view_usuarios',    label: 'Ver Usuários',             group: 'Administração' },
  { key: 'manage_usuarios',  label: 'Gerenciar Usuários',       group: 'Administração' },
  // Governança — concedidas UMA A UMA, nunca por perfil. Ver PERMISSOES_RESTRITAS.
  //
  // O CONSELHO EXIGE AS DUAS COISAS: ser sócio (`User.isPartner`) E ter esta
  // chave. São perguntas diferentes — "é dono da empresa?" e "está autorizado
  // a abrir o painel do conselho?" —, e cada uma vive num lugar só.
  //
  // O risco aqui é real e já aconteceu: quando as duas condições são checadas
  // em lugares DIFERENTES, elas discordam, e o sócio legítimo fica trancado
  // com o menu aberto na cara. Por isso há exatamente UMA função que combina
  // as duas (`podeVerConselho`, em lib/autorizacao), e é ela que a página, a
  // API e o menu consultam. Duas condições, um ponto de decisão.
  { key: 'view_conselho',    label: 'Visualizar Conselho',      group: 'Governança' },
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
 * O CONSELHO é uma chave restrita E exige ser sócio. `view_conselho` entra
 * aqui para que ser ADMIN não a conceda sozinho: o Conselho não acompanha o
 * cargo. A condição de sócio é a outra metade, e `podeVerConselho` (em
 * lib/autorizacao) é o único lugar que junta as duas.
 */
export const PERMISSOES_RESTRITAS: readonly string[] = [
  'view_conselho', 'view_auditoria', 'manage_auditoria',
]

export function permissaoRestrita(key: string): boolean {
  return PERMISSOES_RESTRITAS.includes(key)
}

/**
 * CHAVES INTRODUZIDAS NESTA RODADA — e por que isso importa para o acesso.
 *
 * ── O PROBLEMA, QUE JÁ ACONTECEU NESTE PRODUTO ──────────────────────────
 *
 * O JWT fotografa as permissões no login e vive 7 dias. O proxy decide no edge
 * com essa foto, sem consultar o banco.
 *
 * Para uma chave que JÁ EXISTIA quando o token foi emitido, isso é seguro: se
 * ela não está na lista, é porque não foi concedida. O comentário em `liberada`
 * (lib/modules) diz exatamente isso — "chaves comuns têm atalho de ADMIN e
 * fallback por perfil, então uma lista velha não as nega indevidamente".
 *
 * Para uma chave NOVA, o raciocínio se inverte. Considere um GESTOR com lista
 * explícita de permissões, a quem a migration v28 concedeu `view_previsao`:
 *
 *   1. o JWT dele foi emitido ANTES da migration e não tem a chave;
 *   2. a lista do token NÃO está vazia, então o fallback por perfil
 *      (`DEFAULT_PERMISSIONS`) não é consultado;
 *   3. ele não é ADMIN, então o atalho não se aplica;
 *   4. `hasPermission` devolve `false` e o proxy redireciona;
 *   5. a SIDEBAR mostra o item — ela lê do banco, num server component.
 *
 * O sintoma é o item visível levando a um redirect. É o mesmo defeito do
 * `isPartner` e o mesmo do `view_conselho`, pela terceira vez, por um caminho
 * novo: lista velha para uma chave que nasce ausente é RESTRITIVA, não
 * permissiva.
 *
 * ── A CORREÇÃO ──────────────────────────────────────────────────────────
 *
 * O proxy NÃO DECIDE estas chaves (ver `liberada`). A autoridade é a página e
 * a API, que leem a lista atual do banco a cada requisição. Não é afrouxamento:
 * as duas continuam exigindo a chave, e agora com a lista CORRETA.
 *
 * ── QUANDO ESTA LISTA ESVAZIA ───────────────────────────────────────────
 *
 * Quando todo token emitido antes da v28 tiver expirado — 7 dias após o deploy.
 * A partir daí ela pode ser zerada sem efeito nenhum, e o proxy volta a decidir
 * as duas chaves pelo token, como faz com as demais chaves comuns.
 *
 * Deixá-la cheia para sempre também é inofensivo: o custo é uma consulta ao
 * banco na página e na API, que elas já fazem de todo modo.
 */
export const PERMISSOES_RECENTES: readonly string[] = [
  'view_previsao', 'manage_previsao',
]

export function permissaoRecente(key: string): boolean {
  return PERMISSOES_RECENTES.includes(key)
}

export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  // Tudo MENOS as restritas: ser ADMIN não é ser sócio nem auditor.
  ADMIN: ALL_PERMISSIONS.map(p => p.key).filter(k => !permissaoRestrita(k)),
  // As chaves de Usuários NÃO entram nos perfis não-admin: conceder alçada é
  // decisão de quem responde por elas, não consequência do departamento.
  OPERACIONAL: [
    'view_dashboard', 'view_carteira', 'view_forecast',
    'view_receita', 'view_metas', 'view_pedidos', 'view_metricas',
    // LEITURA da Previsão, não escrita: lançar orçamento é decisão de quem
    // responde pelo planejamento, e não consequência de ser do operacional.
    'view_previsao',
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
    // Gestor de carteira LÊ a previsão. Escrever continua sendo alçada
    // concedida, não herdada do perfil.
    'view_previsao',
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


/* ========================================================================= *
 * USUÁRIOS — ver e editar são alçadas SEPARADAS
 * ========================================================================= */

/**
 * Por que duas chaves e não uma.
 *
 * Consultar quem tem acesso a quê é trabalho de auditoria e de suporte;
 * ALTERAR isso é trabalho de quem responde pelas alçadas. Com uma chave só,
 * quem precisa conferir uma permissão ganharia o poder de conceder qualquer
 * outra — inclusive a si mesmo.
 *
 * `manage_usuarios` NÃO implica `view_usuarios` por acidente: quem edita
 * também lê, e por isso `podeVerUsuarios` aceita as duas. O contrário não
 * vale — ler não dá direito de escrever.
 */
export function podeVerUsuarios(permissoes: string[] | null, role: string): boolean {
  return hasPermission(permissoes, 'view_usuarios', role)
    || hasPermission(permissoes, 'manage_usuarios', role)
}

export function podeGerenciarUsuarios(permissoes: string[] | null, role: string): boolean {
  return hasPermission(permissoes, 'manage_usuarios', role)
}
