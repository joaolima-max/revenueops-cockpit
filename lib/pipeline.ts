/**
 * PIPELINE MULTI-FUNIL — regras de dominio.
 *
 * Este modulo NAO importa Prisma de proposito: as decisoes de alcada, ordem e
 * transferencia sao funcoes puras, exercitaveis sem banco. As consultas ficam
 * em lib/pipeline-db.ts.
 *
 * A alcada por funil NAO e um mecanismo paralelo de autorizacao. Ela refina,
 * dentro do modulo Pipeline, o que `view_pipeline` / `manage_pipeline` ja
 * liberaram em lib/permissions.ts — e o ADMIN continua passando por cima de
 * tudo, exatamente como `hasPermission` ja faz hoje.
 */

import { hasPermission } from '@/lib/permissions'

/* ========================================================================= *
 * RESULTADO DO CARD
 *
 * Ganho e Perdido NAO sao etapas — sao o desfecho do processo comercial. A
 * distincao nao e cosmetica: como coluna, "Ganho" engolia todos os cards
 * fechados e destruia a informacao de ONDE eles fecharam; e um card perdido na
 * Negociacao precisava sair da Negociacao para ser marcado como perdido, o que
 * falsificava a propria etapa.
 *
 * Etapa e resultado sao, por isso, dois eixos independentes do mesmo card.
 * ========================================================================= */

export const RESULTADOS = ['EM_ANDAMENTO', 'GANHO', 'PERDIDO'] as const
export type ResultadoCard = (typeof RESULTADOS)[number]

export const RESULTADO_LABEL: Record<ResultadoCard, string> = {
  EM_ANDAMENTO: 'Em andamento',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
}

/** Um resultado diferente de EM_ANDAMENTO encerra o card. */
export function encerraCard(r: ResultadoCard): boolean {
  return r !== 'EM_ANDAMENTO'
}

/**
 * Regras da mudanca de resultado. Devolve a mensagem de erro, ou null.
 *
 * Reabrir um card ganho/perdido e permitido de proposito: negocio volta atras,
 * e a alternativa seria o operador criar um card duplicado para corrigir o
 * desfecho — que e como uma base de pipeline vira duas.
 */
export function validarMudancaResultado(
  atual: ResultadoCard, novo: unknown,
): string | null {
  if (!RESULTADOS.includes(novo as ResultadoCard)) {
    return `Resultado invalido. Use: ${RESULTADOS.join(', ')}.`
  }
  if (novo === atual) return 'O card ja esta com esse resultado.'
  return null
}

export const ACOES_FUNIL = ['ver', 'editar', 'mover', 'criar', 'transferir', 'administrar'] as const
export type AcaoFunil = (typeof ACOES_FUNIL)[number]

export const ACAO_LABELS: Record<AcaoFunil, string> = {
  ver: 'Visualizar',
  editar: 'Editar',
  mover: 'Mover cards',
  criar: 'Criar',
  transferir: 'Transferir',
  administrar: 'Administrar',
}

export interface SessaoMinima {
  userId: string
  role: string
  permissoes?: string[]
}

export interface LinhaPermissao {
  role: string | null
  userId: string | null
  ver: boolean
  editar: boolean
  mover: boolean
  criar: boolean
  transferir: boolean
  administrar: boolean
  apenasProprios: boolean
}

export interface AcessoFunil {
  ver: boolean
  editar: boolean
  mover: boolean
  criar: boolean
  transferir: boolean
  administrar: boolean
  /** Verdadeiro quando o usuario so pode enxergar os cards de que e dono. */
  apenasProprios: boolean
}

const SEM_ACESSO: AcessoFunil = {
  ver: false, editar: false, mover: false, criar: false,
  transferir: false, administrar: false, apenasProprios: false,
}

const ACESSO_TOTAL: AcessoFunil = {
  ver: true, editar: true, mover: true, criar: true,
  transferir: true, administrar: true, apenasProprios: false,
}

/** Portao global de administracao: quem pode criar funil e mexer na estrutura. */
export function podeAdministrarPipeline(s: SessaoMinima): boolean {
  return s.role === 'ADMIN' || hasPermission(s.permissoes ?? null, 'admin_funis', s.role)
}

/**
 * Alcada de um usuario sobre UM funil.
 *
 *   ADMIN                  -> tudo.
 *   Funil sem nenhuma linha -> herda o modulo: quem tem `view_pipeline` ve, e
 *                             quem tem `manage_pipeline` opera. Um funil recem
 *                             criado nao pode nascer invisivel ate para quem o
 *                             criou.
 *   Funil com linhas        -> soma as linhas da role do usuario com as linhas
 *                             nominais dele. Nenhuma linha casando = sem acesso,
 *                             que e justamente o objetivo de configurar.
 *
 * `apenasProprios` so restringe quando TODAS as linhas que casam pedem isso:
 * uma concessao nominal mais ampla levanta a restricao da role.
 */
export function resolverAcesso(s: SessaoMinima, linhas: LinhaPermissao[]): AcessoFunil {
  if (s.role === 'ADMIN') return { ...ACESSO_TOTAL }

  const minhas = linhas.filter((l) => l.userId === s.userId || (l.userId === null && l.role === s.role))

  // Regra especifica configurada para este usuario ou para a role dele: e ela
  // que manda. A regra FOI criada pelo administrador dentro do sistema de
  // permissoes, entao exigir tambem a chave global `view_pipeline` faria a
  // configuracao por funil nao valer nada — o OPERACIONAL, por exemplo, nao
  // tem `view_pipeline` por padrao e nunca alcancaria o Onboarding.
  if (minhas.length > 0) {
    const algum = (k: AcaoFunil) => minhas.some((l) => l[k])
    return {
      ver: algum('ver'),
      editar: algum('editar'),
      mover: algum('mover'),
      criar: algum('criar'),
      transferir: algum('transferir'),
      // Administrar a estrutura do funil exige, alem da regra, o portao global.
      administrar: algum('administrar') && podeAdministrarPipeline(s),
      // So restringe quando TODAS as regras que casam pedem: uma concessao
      // nominal mais ampla levanta a restricao herdada da role.
      apenasProprios: minhas.every((l) => l.apenasProprios),
    }
  }

  // O funil tem regras, mas nenhuma alcanca este usuario. Sem acesso — e
  // justamente para isso que configurar serve.
  if (linhas.length > 0) return { ...SEM_ACESSO }

  // Funil sem nenhuma regra: herda o modulo. Um funil recem criado nao pode
  // nascer invisivel ate para quem o criou.
  if (!hasPermission(s.permissoes ?? null, 'view_pipeline', s.role)) return { ...SEM_ACESSO }
  const opera = hasPermission(s.permissoes ?? null, 'manage_pipeline', s.role)
  return {
    ver: true,
    editar: opera, mover: opera, criar: opera, transferir: opera,
    administrar: false,
    apenasProprios: false,
  }
}

/**
 * Quem pode mudar o RESULTADO de um card.
 *
 * E a mesma alcada de operar o card: quem move entre etapas, ou edita, decide
 * o desfecho. Criar uma acao propria para isso multiplicaria a matriz de
 * permissoes sem nenhum caso de uso que a justifique.
 */
export function podeAlterarResultado(acesso: AcessoFunil): boolean {
  return acesso.mover || acesso.editar
}

/**
 * PODE EXCLUIR O CARD?
 *
 * Exige `editar`, e não `mover`. Mudar o resultado ou arrastar de coluna é
 * operar o funil — alçada que se dá a quem trabalha o dia a dia. Tirar o card
 * do quadro é outra ordem de coisa: ele sai da leitura de todo mundo e dos
 * indicadores. Quem move não necessariamente exclui.
 *
 * `administrar` não é exigido de propósito: administrar é configurar o funil
 * (etapas, alçadas), não trabalhar os cards dele.
 */
export function podeExcluirCard(acesso: AcessoFunil): boolean {
  return acesso.editar
}

/** Renumera de 1..n na ordem recebida. Usado pela reordenacao de etapas e funis. */
export function reordenar(ids: string[]): Array<{ id: string; ordem: number }> {
  return ids.map((id, i) => ({ id, ordem: i + 1 }))
}

/**
 * A lista de ids da reordenacao precisa ser exatamente o conjunto atual: sem
 * faltar, sem sobrar e sem repetir. Caso contrario a operacao silenciosamente
 * deixaria etapas de fora ou moveria etapa de outro funil.
 */
export function validarReordenacao(idsAtuais: string[], idsNovos: string[]): string | null {
  if (idsNovos.length !== idsAtuais.length) {
    return 'A ordenação precisa conter todas as etapas do funil, e apenas elas.'
  }
  if (new Set(idsNovos).size !== idsNovos.length) {
    return 'A ordenação tem itens repetidos.'
  }
  const atuais = new Set(idsAtuais)
  if (idsNovos.some((id) => !atuais.has(id))) {
    return 'A ordenação inclui um item que não pertence a este funil.'
  }
  return null
}

export interface FunilDestino {
  id: string
  nome: string
  ativo: boolean
  exigeCliente: boolean
}

export interface EtapaDestino {
  id: string
  funilId: string
  ativo: boolean
}

export interface PedidoTransferencia {
  funilOrigemId: string | null
  destino: FunilDestino
  etapa: EtapaDestino
  /** Cliente ja vinculado ao card, se houver. */
  clienteAtualId: string | null
  /** Cliente informado no formulario de transferencia. */
  clienteInformadoId: string | null
}

/**
 * Regras da transferencia entre funis. Devolve a mensagem de erro, ou null
 * quando o pedido e valido.
 */
export function validarTransferencia(p: PedidoTransferencia): string | null {
  if (!p.destino.ativo) return 'O funil de destino está inativo.'
  if (p.etapa.funilId !== p.destino.id) return 'A etapa escolhida não pertence ao funil de destino.'
  if (!p.etapa.ativo) return 'A etapa de destino está inativa.'
  if (p.funilOrigemId === p.destino.id) return 'O card já está neste funil. Use mover para trocar de etapa.'
  if (p.destino.exigeCliente && !(p.clienteInformadoId ?? p.clienteAtualId)) {
    return `O funil ${p.destino.nome} exige um cliente vinculado ao card.`
  }
  return null
}

export interface EtapaAtual {
  id: string
  funilId: string
  ativo: boolean
}

/** Regras do movimento de etapa dentro do MESMO funil. */
export function validarMovimento(funilDoCard: string | null, destino: EtapaAtual): string | null {
  if (!destino.ativo) return 'A etapa de destino está inativa.'
  if (funilDoCard && destino.funilId !== funilDoCard) {
    return 'A etapa é de outro funil. Use transferir.'
  }
  return null
}

/**
 * Inativar uma etapa que ainda tem cards deixaria esses cards invisiveis no
 * quadro sem nenhum aviso. Exigimos uma etapa de destino para eles.
 */
export function validarInativacaoEtapa(cards: number, destinoInformado: string | null): string | null {
  if (cards === 0 || destinoInformado) return null
  return `Esta etapa ainda tem ${cards} ${cards === 1 ? 'card' : 'cards'}. Escolha uma etapa de destino para eles antes de inativar.`
}

/** Uma linha de alcada aponta para uma role OU um usuario — nunca os dois. */
export function validarLinhaPermissao(l: { role?: string | null; userId?: string | null }): string | null {
  const temRole = !!l.role
  const temUser = !!l.userId
  if (temRole === temUser) return 'Cada regra vale para uma role ou para um usuário, nunca para os dois.'
  return null
}

/* ========================================================================= *
 * EXCLUSAO DE ETAPA
 * ========================================================================= */

/** O que ainda aponta para a etapa. Zerado = seguro excluir fisicamente. */
export interface DependenciasEtapa {
  /** Cards que estao NA etapa agora (Deal.etapaId). */
  cards: number
  /** Linhas de historico que citam a etapa como origem ou destino. */
  movimentacoes: number
}

/**
 * Decide se a etapa pode ser excluida FISICAMENTE.
 *
 * Devolve a mensagem de impedimento, ou null quando nao ha dependencia alguma.
 *
 * A regra existe porque ha dois tipos de vinculo, e eles pedem respostas
 * diferentes:
 *
 *   * CARDS — o vinculo e o presente. Um card na etapa some do quadro se a
 *     etapa deixar de existir. Quem quer tirar a etapa de uso com cards dentro
 *     deve INATIVAR, que exige etapa de destino e realoca os cards.
 *
 *   * MOVIMENTACOES — o vinculo e o passado. PipelineMovimentacao e o historico
 *     de como cada card andou, e a etapa aparece nele como origem ou destino.
 *     Apagar a etapa exigiria apagar essas linhas, e isso reescreveria o
 *     historico do pipeline para viabilizar uma operacao de cadastro. Nao se
 *     faz: a etapa fica, inativa.
 *
 * Por isso a exclusao fisica so acontece no caso limpo — etapa criada e nunca
 * usada, que e exatamente o caso de quem errou o nome ou duplicou a coluna.
 */
export function impedimentoExclusaoEtapa(dep: DependenciasEtapa): string | null {
  if (dep.cards > 0 && dep.movimentacoes > 0) {
    return `Esta etapa tem ${dep.cards} card(s) e ${dep.movimentacoes} registro(s) de historico. `
      + 'Inative a etapa informando uma etapa de destino para os cards — excluir apagaria o historico de movimentacao do pipeline.'
  }
  if (dep.cards > 0) {
    return `Esta etapa tem ${dep.cards} card(s). `
      + 'Inative a etapa informando uma etapa de destino para eles, em vez de excluir.'
  }
  if (dep.movimentacoes > 0) {
    return `Esta etapa nao tem cards, mas aparece em ${dep.movimentacoes} registro(s) do historico de movimentacao. `
      + 'O historico do pipeline nao e apagado para permitir a exclusao — inative a etapa.'
  }
  return null
}
