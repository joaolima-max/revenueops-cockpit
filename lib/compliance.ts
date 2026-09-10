/**
 * PENDENCIAS DE COMPLIANCE — regras de dominio. Sem Prisma.
 */

export const MOTIVOS = [
  'ATUALIZACAO_CADASTRAL',
  'EXPLICACAO_MOVIMENTACAO',
  'EXPLICACAO_DENUNCIA',
  'REGULARIZACAO_DOCUMENTO',
  'OUTRO',
] as const
export type Motivo = (typeof MOTIVOS)[number]

export const STATUS = ['ABERTA', 'EM_ANALISE', 'AGUARDANDO_CLIENTE', 'RESOLVIDA', 'CANCELADA'] as const
export type Status = (typeof STATUS)[number]

export const CRITICIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const
export type Criticidade = (typeof CRITICIDADES)[number]

/** Status terminais nao voltam a andar sozinhos: exigem reabertura explicita. */
const TRANSICOES: Record<Status, Status[]> = {
  ABERTA:             ['EM_ANALISE', 'AGUARDANDO_CLIENTE', 'RESOLVIDA', 'CANCELADA'],
  EM_ANALISE:         ['ABERTA', 'AGUARDANDO_CLIENTE', 'RESOLVIDA', 'CANCELADA'],
  AGUARDANDO_CLIENTE: ['ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'CANCELADA'],
  RESOLVIDA:          ['ABERTA'],
  CANCELADA:          ['ABERTA'],
}

export function transicaoValida(de: Status, para: Status): boolean {
  if (de === para) return false
  return TRANSICOES[de].includes(para)
}

export function ehTerminal(s: Status): boolean {
  return s === 'RESOLVIDA' || s === 'CANCELADA'
}

/** Pendencia vencida e a que passou do prazo sem ter sido encerrada. */
export function estaVencida(prazo: Date | string | null, status: Status, agora = new Date()): boolean {
  if (!prazo || ehTerminal(status)) return false
  return new Date(prazo).getTime() < agora.getTime()
}

export function diasParaPrazo(prazo: Date | string | null, agora = new Date()): number | null {
  if (!prazo) return null
  const ms = new Date(prazo).getTime() - agora.getTime()
  return Math.ceil(ms / 86_400_000)
}
