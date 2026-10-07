/**
 * Consultas e escritas do pipeline. As REGRAS ficam em lib/pipeline.ts, que
 * nao toca no banco; aqui so buscamos o material e aplicamos a decisao.
 */

import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import {
  resolverAcesso, type AcessoFunil, type SessaoMinima, type LinhaPermissao,
  type ResultadoCard,
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
    select: {
      id: true, ownerId: true, funilId: true, etapaId: true, clienteId: true,
      title: true, resultado: true,
      // Quem opera o card precisa saber se ele ainda está no quadro. O card
      // excluído continua sendo ENCONTRADO aqui de propósito: a rota de
      // exclusão precisa dele para ser idempotente, e as demais o recusam
      // explicitamente — um 404 esconderia a diferença entre "não existe" e
      // "foi excluído".
      deletedAt: true,
    },
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

/**
 * O CARD FOI EXCLUÍDO? Então não se opera mais sobre ele.
 *
 * Mover, mudar resultado, transferir de funil ou comentar um card que saiu do
 * quadro gravaria histórico sobre algo que ninguém enxerga. A mensagem diz o
 * que aconteceu em vez de devolver 404: "não existe" e "foi excluído" são
 * situações diferentes, e confundi-las manda a pessoa procurar um bug que não
 * existe.
 *
 * A exclusão em si NÃO usa esta guarda — ela trata o card já excluído como
 * sucesso, para ser idempotente.
 */
export function cardExcluido(deal: { deletedAt?: Date | null }): boolean {
  return !!deal.deletedAt
}

export const ERRO_CARD_EXCLUIDO =
  'Este card foi excluído do Pipeline. O lead continua em Leads — '
  + 'crie um card novo para ele, se o negócio voltou.'

/**
 * O que o card do quadro carrega.
 *
 * O SEGMENTO VEM DO LEAD, não do card. `Deal.segmento` existe na tabela, mas
 * é uma cópia que pode envelhecer: corrigir o segmento no cadastro do lead
 * deixaria o card mostrando o antigo. O lead é o dono do dado; o card só o
 * exibe.
 */
export const INCLUDE_CARD = {
  owner: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true, company: true, cnpj: true, segmento: true } },
  cliente: { select: { id: true, nome: true } },
} satisfies Prisma.DealInclude

/** Campos do card que o quadro precisa. O VALOR nao esta aqui: o card nao tem. */
export const SELECT_CARD_BASE = {
  id: true, title: true, etapaId: true, funilId: true,
  resultado: true, resultadoEm: true, createdAt: true, updatedAt: true,
  // O marco zero do SLA. Sem ele o quadro nao tem como desenhar o indicador —
  // e medir pelo `createdAt` acusaria atraso de quem acabou de receber o card.
  etapaEntradaEm: true,
} satisfies Prisma.DealSelect

/**
 * Os tipos de movimentacao que MUDAM A ETAPA do card — e portanto reiniciam o
 * relogio do SLA.
 *
 * MUDANCA_RESULTADO fica fora: o card nao sai do lugar quando o desfecho muda,
 * e reiniciar o SLA ali daria ao responsavel um prazo novo por ter marcado o
 * card como ganho. EXCLUSAO_CARD tambem: o card saiu do quadro, nao tem mais
 * etapa a cumprir.
 */
const TIPOS_QUE_MOVEM_ETAPA = [
  'CRIACAO', 'MOVIMENTO_ETAPA', 'TRANSFERENCIA_FUNIL',
] as const

/**
 * Grava a movimentacao e a trilha de auditoria na MESMA transacao da mudanca
 * do card — um card que mudou de lugar sem historico seria pior que nenhum
 * historico, porque parece completo.
 *
 * ── E GRAVA O MARCO ZERO DO SLA ─────────────────────────────────────────
 *
 * Toda movimentacao que muda de etapa ATUALIZA `Deal.etapaEntradaEm`, aqui
 * dentro, na mesma transacao.
 *
 * Nao e conveniencia: e a garantia. Sao TRES caminhos que movem um card —
 * criacao (`/api/deals`), movimento (`.../mover`) e transferencia de funil
 * (`.../transferir`) —, e todos passam por esta funcao. Carimbar o relogio em
 * cada um deles seria tres lugares para esquecer, e o sintoma do esquecimento
 * e silencioso: o card ficaria com o relogio da etapa ANTERIOR, e o SLA
 * acusaria atraso de quem acabou de receber o card.
 *
 * Na mesma transacao porque o historico e o marco zero descrevem o mesmo fato:
 * um gravado sem o outro deixaria a coluna derivada divergindo da tabela que a
 * origina.
 */
export async function registrarMovimentacao(
  tx: Prisma.TransactionClient,
  m: {
    dealId: string
    tipo: 'CRIACAO' | 'MOVIMENTO_ETAPA' | 'TRANSFERENCIA_FUNIL'
      | 'MUDANCA_RESULTADO' | 'EXCLUSAO_CARD'
    funilOrigemId: string | null
    etapaOrigemId: string | null
    funilDestinoId: string
    etapaDestinoId: string
    userId: string
    observacao?: string | null
    /** So em MUDANCA_RESULTADO: o card nao sai do lugar, o desfecho e que muda. */
    resultadoAnterior?: ResultadoCard | null
    resultadoNovo?: ResultadoCard | null
  },
) {
  const movimentacao = await tx.pipelineMovimentacao.create({
    data: {
      dealId: m.dealId,
      tipo: m.tipo,
      funilOrigemId: m.funilOrigemId,
      etapaOrigemId: m.etapaOrigemId,
      funilDestinoId: m.funilDestinoId,
      etapaDestinoId: m.etapaDestinoId,
      userId: m.userId,
      observacao: m.observacao ?? null,
      resultadoAnterior: m.resultadoAnterior ?? null,
      resultadoNovo: m.resultadoNovo ?? null,
    },
  })

  /**
   * O RELOGIO DO SLA REINICIA AQUI.
   *
   * `createdAt` da movimentacao, e nao `new Date()`: os dois valores sao do
   * mesmo instante na pratica, mas usar o da linha gravada mantem a coluna
   * derivada EXATAMENTE igual ao historico que a origina. Com dois relogios
   * independentes, a diferenca de milissegundos apareceria na primeira
   * reconstrucao de passagens por etapa.
   */
  if ((TIPOS_QUE_MOVEM_ETAPA as readonly string[]).includes(m.tipo)) {
    await tx.deal.update({
      where: { id: m.dealId },
      data: { etapaEntradaEm: movimentacao.createdAt },
    })
  }

  return movimentacao
}

/**
 * `Deal.stage` é o campo legado, anterior aos funis. Mantemos o campo em dia
 * enquanto o card estiver no funil de Vendas, cujas etapas nasceram dos
 * proprios valores do enum. Fora de Vendas o stage nao e mexido: o card ja nao
 * pertence ao relatorio comercial.
 *
 * GANHO e PERDIDO sairam deste mapa: deixaram de ser etapas e viraram
 * `Deal.resultado`. O stage passa a descrever so a ETAPA, que e o que ele
 * sempre deveria ter descrito.
 */
export const FUNIL_VENDAS_ID = 'fnl_vendas'

const STAGE_POR_ETAPA: Record<string, string> = {
  etp_vnd_prospeccao: 'PROSPECCAO',
  etp_vnd_qualificacao: 'QUALIFICACAO',
  etp_vnd_proposta: 'PROPOSTA',
  etp_vnd_negociacao: 'NEGOCIACAO',
  etp_vnd_fechamento: 'FECHAMENTO',
}

export function stageLegado(etapaId: string): string | undefined {
  return STAGE_POR_ETAPA[etapaId]
}

export async function auditarPipeline(
  userId: string, acao: string, entidade: string, entidadeId: string, detalhes: string,
) {
  await logAudit(userId, acao, entidade, entidadeId, detalhes)
}
