/**
 * NOTIFICACOES — criacao e leitura. Mensagem dirigida a UM usuario.
 *
 * Nao se confunde com Alertas: alerta e verificacao operacional derivada, sem
 * dono e sem estado de leitura; notificacao tem destinatario, lida/nao lida e
 * um contexto para onde voltar.
 *
 * Nao ha chave de permissao — cada usuario ve as suas, filtradas por
 * `destinatarioId`. Uma chave aqui so criaria a chance de configurar errado.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma, NotificacaoOrigem, Role } from '@prisma/client'

export interface NovaNotificacao {
  destinatarioId: string
  titulo: string
  mensagem: string
  origem?: NotificacaoOrigem
  entidade?: string | null
  entidadeId?: string | null
  href?: string | null
}

/**
 * Notificar nunca pode derrubar a acao que a originou: uma transferencia de
 * card valida nao pode falhar porque o aviso nao saiu. Por isso engole o erro
 * e devolve quantas foram criadas.
 */
export async function notificar(
  n: NovaNotificacao | NovaNotificacao[], tx?: Prisma.TransactionClient,
): Promise<number> {
  const lista = Array.isArray(n) ? n : [n]
  if (lista.length === 0) return 0

  const db = tx ?? prisma
  try {
    const { count } = await db.notificacao.createMany({
      data: lista.map((x) => ({
        destinatarioId: x.destinatarioId,
        titulo: x.titulo.slice(0, 160),
        mensagem: x.mensagem.slice(0, 600),
        origem: x.origem ?? 'SISTEMA',
        entidade: x.entidade ?? null,
        entidadeId: x.entidadeId ?? null,
        href: x.href ?? null,
      })),
    })
    return count
  } catch {
    return 0
  }
}

/** Usuarios ativos de um perfil. Usado quando a automacao notifica uma role inteira. */
export async function destinatariosPorRole(role: Role): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role, active: true },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

export async function contarNaoLidas(userId: string): Promise<number> {
  return prisma.notificacao.count({ where: { destinatarioId: userId, lidaEm: null } })
}
