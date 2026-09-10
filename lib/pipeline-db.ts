/**
 * Consultas e escritas do pipeline. As REGRAS ficam em lib/pipeline.ts, que
 * nao toca no banco; aqui so buscamos o material e aplicamos a decisao.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import {
  resolverAcesso, type AcessoFunil, type SessaoMinima, type LinhaPermissao,
} from '@/lib/pipeline'
import type { Prisma } from '@prisma/client'

export interface FunilComAcesso {
  id: string
  nome: string
  descricao: string | null
  area: string | null
  ordem: number
  ativo: boolean
  exigeCliente: boolean
  acesso: AcessoFunil
}

function paraLinha(p: {
  role: string | null; userId: string | null
  ver: boolean; editar: boolean; mover: boolean; criar: boolean
  transferir: boolean; administrar: boolean; apenasProprios: boolean
}): LinhaPermissao {
  return p
}

/**
 * Todos os funis que o usuario enxerga, com a alcada ja resolvida em cada um.
 * `incluirInativos` serve a tela administrativa; o quadro usa so os ativos.
 */
export async function funisVisiveis(
  session: SessaoMinima, incluirInativos = false,
): Promise<FunilComAcesso[]> {
  const funis = await prisma.pipelineFunil.findMany({
    where: incluirInativos ? {} : { ativo: true },
    include: { permissoes: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  })

  return funis
    .map((f) => ({
      id: f.id, nome: f.nome, descricao: f.descricao, area: f.area,
      ordem: f.ordem, ativo: f.ativo, exigeCliente: f.exigeCliente,
      acesso: resolverAcesso(session, f.permissoes.map(paraLinha)),
    }))
    .filter((f) => f.acesso.ver)
}

/** Alcada do usuario em UM funil. Devolve null quando o funil nao existe. */
export async function acessoAoFunil(
  session: SessaoMinima, funilId: string,
): Promise<AcessoFunil | null> {
  const funil = await prisma.pipelineFunil.findUnique({
    where: { id: funilId },
    include: { permissoes: true },
  })
  if (!funil) return null
  return resolverAcesso(session, funil.permissoes.map(paraLinha))
}

/** Alcada sobre o funil onde o card esta hoje. */
export async function acessoAoCard(session: SessaoMinima, dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, ownerId: true, funilId: true, etapaId: true, clienteId: true, title: true },
  })
  if (!deal) return null

  const acesso = deal.funilId
    ? await acessoAoFunil(session, deal.funilId)
    // Card ainda sem funil (backfill nao rodou): cai no comportamento antigo,
    // em que o modulo inteiro decidia.
    : resolverAcesso(session, [])

  if (!acesso) return null
  if (acesso.apenasProprios && deal.ownerId !== session.userId) return null
  return { deal, acesso }
}

export const INCLUDE_CARD = {
  owner: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true, company: true } },
  cliente: { select: { id: true, nome: true } },
} satisfies Prisma.DealInclude

/**
 * Grava a movimentacao e a trilha de auditoria na MESMA transacao da mudanca
 * do card — um card que mudou de lugar sem historico seria pior que nenhum
 * historico, porque parece completo.
 */
export async function registrarMovimentacao(
  tx: Prisma.TransactionClient,
  m: {
    dealId: string
    tipo: 'CRIACAO' | 'MOVIMENTO_ETAPA' | 'TRANSFERENCIA_FUNIL'
    funilOrigemId: string | null
    etapaOrigemId: string | null
    funilDestinoId: string
    etapaDestinoId: string
    userId: string
    observacao?: string | null
  },
) {
  return tx.pipelineMovimentacao.create({
    data: {
      dealId: m.dealId,
      tipo: m.tipo,
      funilOrigemId: m.funilOrigemId,
      etapaOrigemId: m.etapaOrigemId,
      funilDestinoId: m.funilDestinoId,
      etapaDestinoId: m.etapaDestinoId,
      userId: m.userId,
      observacao: m.observacao ?? null,
    },
  })
}

/**
 * `Deal.stage` continua sendo a fonte que app/api/relatorios usa. Mantemos o
 * campo em dia enquanto o card estiver no funil de Vendas, cujas etapas nasceram
 * dos proprios valores do enum. Fora de Vendas o stage nao e mexido: o card ja
 * nao pertence ao relatorio comercial.
 */
export const FUNIL_VENDAS_ID = 'fnl_vendas'

const STAGE_POR_ETAPA: Record<string, string> = {
  etp_vnd_prospeccao: 'PROSPECCAO',
  etp_vnd_qualificacao: 'QUALIFICACAO',
  etp_vnd_proposta: 'PROPOSTA',
  etp_vnd_negociacao: 'NEGOCIACAO',
  etp_vnd_fechamento: 'FECHAMENTO',
  etp_vnd_ganho: 'GANHO',
  etp_vnd_perdido: 'PERDIDO',
}

export function stageLegado(etapaId: string): string | undefined {
  return STAGE_POR_ETAPA[etapaId]
}

export async function auditarPipeline(
  userId: string, acao: string, entidade: string, entidadeId: string, detalhes: string,
) {
  await logAudit(userId, acao, entidade, entidadeId, detalhes)
}
