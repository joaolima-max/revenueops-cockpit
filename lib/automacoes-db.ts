/**
 * Execucao das automacoes.
 *
 * Roda SEMPRE depois da transacao principal. Uma automacao com defeito nao
 * pode desfazer a movimentacao de card que ja aconteceu — por isso nada aqui
 * lanca para fora: toda falha vira uma linha em `AutomacaoExecucao`.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { notificar, destinatariosPorRole } from '@/lib/notificacoes'
import {
  automacoesQueDisparam, interpolar,
  type ContextoGatilho, type Gatilho,
} from '@/lib/automacoes'
import type { Role } from '@prisma/client'

export interface ContextoExecucao extends ContextoGatilho {
  /** Quem provocou o gatilho. As acoes gravam em nome dele. */
  userId: string
}

interface Resultado {
  disparadas: number
  sucesso: number
  falha: number
}

/** Destinatarios da acao: um usuario nomeado, ou todos os ativos de um perfil. */
async function resolverDestinatarios(
  userId: string | null, role: string | null,
): Promise<string[]> {
  if (userId) return [userId]
  if (role) return destinatariosPorRole(role as Role)
  return []
}

/**
 * Dispara as automacoes que casam com o contexto.
 *
 * Nunca lanca. Chamar sem `await` tambem e seguro, mas as rotas preferem
 * aguardar para que o efeito ja esteja visivel na resposta.
 */
export async function dispararAutomacoes(ctx: ContextoExecucao): Promise<Resultado> {
  const vazio: Resultado = { disparadas: 0, sucesso: 0, falha: 0 }

  try {
    const candidatas = await prisma.automacao.findMany({
      where: { ativo: true, gatilho: ctx.gatilho },
    })
    if (candidatas.length === 0) return vazio

    const alvo = automacoesQueDisparam(
      candidatas.map((a) => ({ ...a, gatilho: a.gatilho as Gatilho })),
      ctx,
    )
    if (alvo.length === 0) return vazio

    const resultado: Resultado = { disparadas: alvo.length, sucesso: 0, falha: 0 }

    // Sequencial de proposito: duas automacoes que mexem no mesmo card
    // precisam enxergar o efeito uma da outra.
    for (const a of alvo) {
      try {
        const descricao = await executar(a, ctx)
        await prisma.automacaoExecucao.create({
          data: {
            automacaoId: a.id,
            status: 'SUCESSO',
            dealId: ctx.dealId ?? null,
            respostaId: ctx.respostaId ?? null,
            contexto: { gatilho: ctx.gatilho, funilId: ctx.funilId, etapaId: ctx.etapaId },
            resultado: descricao,
          },
        })
        resultado.sucesso++
      } catch (e) {
        resultado.falha++
        await prisma.automacaoExecucao.create({
          data: {
            automacaoId: a.id,
            status: 'FALHA',
            dealId: ctx.dealId ?? null,
            respostaId: ctx.respostaId ?? null,
            contexto: { gatilho: ctx.gatilho, funilId: ctx.funilId, etapaId: ctx.etapaId },
            erro: e instanceof Error ? e.message.slice(0, 500) : 'Erro desconhecido',
          },
        }).catch(() => {})
      }
    }

    return resultado
  } catch {
    // Nem listar as automacoes pode derrubar a acao principal.
    return vazio
  }
}

type AutomacaoRow = Awaited<ReturnType<typeof prisma.automacao.findMany>>[number]

async function executar(a: AutomacaoRow, ctx: ContextoExecucao): Promise<string> {
  const vars: Record<string, string | null | undefined> = {
    card: ctx.titulo, cliente: ctx.clienteId, funil: ctx.funilId, etapa: ctx.etapaId,
  }
  const titulo = interpolar(a.titulo ?? a.nome, vars)
  const mensagem = interpolar(a.mensagem ?? '', vars)

  switch (a.acao) {
    // ------------------------------------------------------ TRANSFERIR_FUNIL
    case 'TRANSFERIR_FUNIL': {
      if (!a.funilDestinoId || !a.etapaDestinoId) throw new Error('Automação sem funil ou etapa de destino.')
      if (!ctx.dealId) throw new Error('Gatilho sem card associado.')
      if (ctx.funilId === a.funilDestinoId) return 'Card já está no funil de destino; nada a fazer.'

      const etapa = await prisma.pipelineEtapa.findUnique({ where: { id: a.etapaDestinoId } })
      if (!etapa || !etapa.ativo) throw new Error('Etapa de destino inexistente ou inativa.')
      if (etapa.funilId !== a.funilDestinoId) throw new Error('Etapa de destino não pertence ao funil.')

      await prisma.$transaction(async (tx) => {
        await tx.deal.update({
          where: { id: ctx.dealId },
          data: { funilId: a.funilDestinoId, etapaId: a.etapaDestinoId },
        })
        await tx.pipelineMovimentacao.create({
          data: {
            dealId: ctx.dealId!,
            tipo: 'TRANSFERENCIA_FUNIL',
            funilOrigemId: ctx.funilId,
            etapaOrigemId: ctx.etapaId,
            funilDestinoId: a.funilDestinoId!,
            etapaDestinoId: a.etapaDestinoId!,
            userId: ctx.userId,
            observacao: `Automação: ${a.nome}`,
          },
        })
      })

      await logAudit(ctx.userId, 'AUTOMACAO_TRANSFERIU_CARD', 'Deal', ctx.dealId, `Automação: ${a.nome}`)
      return `Card transferido para a etapa ${etapa.nome}.`
    }

    // ------------------------------------------------------------- NOTIFICAR
    case 'NOTIFICAR': {
      const destinatarios = await resolverDestinatarios(a.destinatarioUserId, a.destinatarioRole)
      if (destinatarios.length === 0) throw new Error('Nenhum destinatário resolvido.')

      const criadas = await notificar(destinatarios.map((id) => ({
        destinatarioId: id,
        titulo,
        mensagem: mensagem || titulo,
        origem: 'AUTOMACAO' as const,
        entidade: ctx.dealId ? 'Deal' : null,
        entidadeId: ctx.dealId ?? null,
        href: ctx.dealId ? '/dashboard/pipeline' : null,
      })))
      return `${criadas} notificação(ões) enviada(s).`
    }

    // ---------------------------------------------------------- CRIAR_TAREFA
    case 'CRIAR_TAREFA': {
      const destinatarios = await resolverDestinatarios(a.destinatarioUserId, a.destinatarioRole)
      if (destinatarios.length === 0) throw new Error('Nenhum responsável resolvido.')

      const responsavelId = destinatarios[0]
      const tarefa = await prisma.tarefa.create({
        data: {
          titulo,
          descricao: mensagem || null,
          clienteId: ctx.clienteId ?? null,
          criadoPorId: ctx.userId,
          responsavelId,
        },
      })

      await notificar({
        destinatarioId: responsavelId,
        titulo: 'Nova tarefa atribuída',
        mensagem: titulo,
        origem: 'AUTOMACAO',
        entidade: 'Tarefa',
        entidadeId: tarefa.id,
        href: '/dashboard/tarefas',
      })
      return `Tarefa criada para ${destinatarios.length === 1 ? 'o responsável' : 'a fila'}.`
    }

    // -------------------------------------------------------- ABRIR_PENDENCIA
    case 'ABRIR_PENDENCIA': {
      if (!ctx.clienteId) throw new Error('Pendência de compliance exige um cliente vinculado ao card.')

      const destinatarios = await resolverDestinatarios(a.destinatarioUserId, a.destinatarioRole)
      if (destinatarios.length === 0) throw new Error('Nenhum responsável resolvido.')

      const responsavelId = destinatarios[0]
      const pendencia = await prisma.$transaction(async (tx) => {
        const p = await tx.pendenciaCompliance.create({
          data: {
            clienteId: ctx.clienteId!,
            motivo: 'OUTRO',
            titulo,
            observacoes: mensagem || null,
            responsavelId,
          },
        })
        await tx.pendenciaEvento.create({
          data: {
            pendenciaId: p.id,
            userId: ctx.userId,
            statusPara: 'ABERTA',
            comentario: `Aberta pela automação "${a.nome}".`,
          },
        })
        return p
      })

      await notificar({
        destinatarioId: responsavelId,
        titulo: 'Nova pendência de compliance',
        mensagem: titulo,
        origem: 'COMPLIANCE',
        entidade: 'PendenciaCompliance',
        entidadeId: pendencia.id,
        href: '/dashboard/compliance',
      })
      return 'Pendência de compliance aberta.'
    }
  }

  throw new Error(`Ação desconhecida: ${a.acao}`)
}
