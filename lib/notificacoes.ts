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
import type { Prisma, NotificacaoOrigem, Role, Departamento } from '@prisma/client'

export interface NovaNotificacao {
  destinatarioId: string
  titulo: string
  mensagem: string
  origem?: NotificacaoOrigem
  entidade?: string | null
  entidadeId?: string | null
  href?: string | null
  /**
   * IDEMPOTENCIA. Identifica o EVENTO, nao a mensagem:
   * `tarefa:<id>:D-3:<destinatario>`. A coluna e UNIQUE, entao o banco recusa
   * a segunda insercao do mesmo lembrete e reprocessar o dia nao duplica
   * avisos.
   *
   * Ausente nas notificacoes de ACAO DIRETA (uma transferencia de card, por
   * exemplo): elas acontecem uma vez, nao sao reprocessadas, e dar chave a
   * elas impediria o segundo aviso legitimo da mesma acao repetida.
   */
  chave?: string | null
}

/**
 * Notificar nunca pode derrubar a acao que a originou: uma transferencia de
 * card valida nao pode falhar porque o aviso nao saiu. Por isso engole o erro
 * e devolve quantas foram criadas.
 *
 * `skipDuplicates` e o par do UNIQUE em `chave`: um lembrete que ja existe e
 * ignorado em silencio em vez de derrubar o lote inteiro. E por isso que
 * reprocessar o dia e seguro — e o banco, nao o codigo, que garante.
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
        chave: x.chave ?? null,
      })),
      skipDuplicates: true,
    })
    return count
  } catch {
    return 0
  }
}

/**
 * Usuarios ATIVOS de um departamento.
 *
 * E assim que os avisos de Contas a Pagar/Receber e de Lancamento Diario
 * acham o Financeiro: pelo departamento do usuario, nao por uma lista mantida
 * a mao que envelheceria na primeira troca de equipe.
 *
 * Lista VAZIA e um resultado possivel — ninguem cadastrado naquele
 * departamento. O chamador precisa tratar, e nao substituir por "todos os
 * ADMIN": isso mandaria titulo financeiro para quem nao e do Financeiro.
 */
export async function destinatariosPorDepartamento(
  departamento: Departamento,
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { departamento, active: true },
    select: { id: true },
  })
  return users.map((u) => u.id)
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
