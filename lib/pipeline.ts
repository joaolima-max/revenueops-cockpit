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
