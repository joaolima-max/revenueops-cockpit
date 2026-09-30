/**
 * INCIDENTES — regras de domínio. Sem Prisma.
 *
 * A regra central: **downtime não é digitado, é derivado**.
 *
 *   downtime = fim − início
 *
 * Antes existia uma coluna `downtimeMins` preenchida à mão, ao lado de `inicio`
 * e `fim`. Eram duas verdades sobre o mesmo fato, e nada impedia que
 * discordassem — um incidente podia declarar 30 minutos de downtime com uma
 * janela de 4 horas entre início e fim. Agora há uma fonte só, e ela é a
 * janela: qualquer tela que mostre duração mostra o mesmo número.
 *
 * Enquanto o incidente está aberto, a duração é "em andamento" e conta até
 * agora. Não se exige downtime para registrar um incidente que acabou de abrir.
 */

export const CRITICIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] as const
export type Criticidade = (typeof CRITICIDADES)[number]

export interface Downtime {
  /** Minutos decorridos. Sempre um número — zero quando início e fim coincidem. */
  minutos: number
  /** Falso enquanto o incidente não tem `fim`: o número ainda está crescendo. */
  encerrado: boolean
  /** Rótulo pronto: "2h 15min", "45min", "em andamento · 12min". */
  rotulo: string
}

const MINUTO_MS = 60_000

/** "2h 15min", "3d 4h", "45min". Zero minutos é "menos de 1min", não "0min". */
export function formatarDuracao(minutos: number): string {
  if (minutos < 1) return 'menos de 1min'

  const dias = Math.floor(minutos / 1440)
  const horas = Math.floor((minutos % 1440) / 60)
  const mins = Math.round(minutos % 60)

  if (dias > 0) return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`
  if (horas > 0) return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`
  return `${mins}min`
}

/**
 * Downtime de um incidente.
 *
 * `agora` é parâmetro para a função ser determinística nos testes — e porque
 * quem renderiza no servidor e quem renderiza no cliente têm relógios
 * diferentes.
 *
 * Um `fim` anterior ao `inicio` é dado inconsistente, não downtime negativo:
 * devolve zero. A validação que impede gravar isso está na API.
 */
export function calcularDowntime(
  inicio: Date | string,
  fim: Date | string | null | undefined,
  agora: Date = new Date(),
): Downtime {
  const t0 = new Date(inicio).getTime()
  const encerrado = !!fim
  const t1 = encerrado ? new Date(fim!).getTime() : agora.getTime()

  if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
    return { minutos: 0, encerrado, rotulo: '—' }
  }

  const minutos = Math.max(0, Math.round((t1 - t0) / MINUTO_MS))

  return {
    minutos,
    encerrado,
    rotulo: encerrado ? formatarDuracao(minutos) : `em andamento · ${formatarDuracao(minutos)}`,
  }
}

/** Um `fim` antes do `inicio` é inválido. Devolve a mensagem, ou null. */
export function validarJanela(inicio: Date, fim: Date | null): string | null {
  if (!Number.isFinite(inicio.getTime())) return 'Data de início inválida.'
  if (fim === null) return null
  if (!Number.isFinite(fim.getTime())) return 'Data de encerramento inválida.'
  if (fim.getTime() < inicio.getTime()) {
    return 'O encerramento não pode ser anterior ao início.'
  }
  return null
}

/**
 * Quem pode editar e excluir incidente: **somente ADMIN**.
 *
 * Registrar e fechar continuam abertos a quem opera (não-COMERCIAL): fechar um
 * incidente é parte do trabalho do turno. Reescrever a janela de um incidente
 * já registrado, ou apagá-lo, mexe no histórico de disponibilidade — e isso é
 * decisão de administrador.
 */
export function podeAdministrarIncidente(role: string): boolean {
  return role === 'ADMIN'
}

/** Quem pode registrar e fechar. COMERCIAL não opera incidente. */
export function podeRegistrarIncidente(role: string): boolean {
  return role !== 'COMERCIAL'
}
