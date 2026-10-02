import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { acessoAoCard, registrarMovimentacao, auditarPipeline } from '@/lib/pipeline-db'
import { podeExcluirCard } from '@/lib/pipeline'

/**
 * DETALHES DO CARD — tudo o que a visão de detalhe mostra, numa chamada.
 *
 * Lead vinculado (com empresa e CNPJ), cliente, responsável, funil, etapa,
 * resultado, datas, histórico completo e anotações. Nada aqui é copiado: o
 * CNPJ é o do Lead, o responsável é o `owner` do card, e o histórico é a mesma
 * `PipelineMovimentacao` que o quadro grava.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const [card, historico, comentarios] = await Promise.all([
    prisma.deal.findUnique({
      where: { id },
      select: {
        id: true, title: true, notes: true, resultado: true, resultadoEm: true,
        createdAt: true, updatedAt: true, closedAt: true, expectedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        funil: { select: { id: true, nome: true, area: true } },
        etapa: { select: { id: true, nome: true, ordem: true } },
        cliente: { select: { id: true, nome: true, cnpj: true } },
        lead: {
          select: {
            id: true, name: true, company: true, cnpj: true, email: true,
            phone: true, position: true, segmento: true, canal: true,
            status: true, source: true, createdAt: true,
          },
        },
      },
    }),
    prisma.pipelineMovimentacao.findMany({
      where: { dealId: id },
      include: {
        user: { select: { name: true } },
        funilOrigem: { select: { nome: true } },
        etapaOrigem: { select: { nome: true } },
        funilDestino: { select: { nome: true } },
        etapaDestino: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.dealComentario.findMany({
      where: { dealId: id },
      include: { autor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  if (!card) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })

  return NextResponse.json({ card, historico, comentarios, acesso: ctx.acesso })
}

/**
 * DELETE — EXCLUI O CARD DO PIPELINE. **NÃO** EXCLUI O LEAD.
 *
 * Esta é a distinção inteira desta rota, e vale repeti-la: o lead continua
 * existindo em Leads, com seu cadastro, seus comentários, suas atividades e
 * seu histórico. Pode ser trabalhado de novo, e pode receber um card novo
 * amanhã. O que sai do quadro é o CARD.
 *
 * A Lixeira de Leads não é tocada por aqui — é outro mecanismo, para outra
 * entidade, e um card excluído não aparece lá.
 *
 * SOFT DELETE, pelo mesmo motivo que em Lead: as movimentações e os
 * comentários do card apontam para ele. Apagar fisicamente levaria embora
 * justamente o histórico que a exclusão precisa preservar — e a trilha de
 * quem excluiu ficaria apontando para um id que não existe mais.
 *
 * O histórico registra uma MOVIMENTAÇÃO `EXCLUSAO_CARD` com funil e etapa de
 * origem, na mesma transação da exclusão: quem excluiu, quando, qual card,
 * qual lead, de qual funil e de qual etapa. Mais a trilha de auditoria.
 *
 * Idempotente: excluir duas vezes devolve o mesmo sucesso, sem gravar um
 * segundo histórico.
 */
export async function DELETE(
  request: NextRequest, { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!podeExcluirCard(ctx.acesso)) {
    return NextResponse.json({ error: 'Você não pode excluir cards deste funil.' }, { status: 403 })
  }

  // Estado completo ANTES de excluir: o histórico precisa dos valores, não só
  // do id de algo que saiu do quadro.
  const card = await prisma.deal.findUnique({
    where: { id },
    select: {
      id: true, title: true, deletedAt: true, funilId: true, etapaId: true,
      funil: { select: { nome: true } },
      etapa: { select: { nome: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  })
  if (!card) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })

  // Já excluído: nada a fazer, e nada a registrar de novo.
  if (card.deletedAt) {
    return NextResponse.json({ success: true, jaExcluido: true })
  }

  /**
   * Motivo da exclusão, quando informado. Opcional: o DELETE pode vir sem
   * corpo, e um `await request.json()` num corpo vazio estoura.
   */
  let observacao: string | null = null
  try {
    const body = await request.json()
    if (body && typeof body.observacao === 'string') {
      observacao = body.observacao.slice(0, 500) || null
    }
  } catch {
    // Sem corpo: exclusão sem motivo declarado.
  }

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: session.userId },
    })

    /**
     * A movimentação só é gravada quando o card TEM funil e etapa.
     *
     * `funilDestinoId` e `etapaDestinoId` são obrigatórios em
     * `PipelineMovimentacao`, e um card de antes do backfill da v11 pode não
     * ter nenhum dos dois. Nesse caso a exclusão acontece e fica registrada na
     * auditoria — inventar um funil para preencher a FK seria gravar
     * histórico falso.
     */
    if (card.funilId && card.etapaId) {
      await registrarMovimentacao(tx, {
        dealId: id,
        tipo: 'EXCLUSAO_CARD',
        // De onde o card saiu. O destino repete a origem porque ele não foi
        // para outro lugar — saiu do quadro.
        funilOrigemId: card.funilId,
        etapaOrigemId: card.etapaId,
        funilDestinoId: card.funilId,
        etapaDestinoId: card.etapaId,
        userId: session.userId,
        observacao,
      })
    }
  })

  await auditarPipeline(
    session.userId, 'EXCLUIU_CARD_PIPELINE', 'Deal', id,
    `${card.title} · funil ${card.funil?.nome ?? '—'} · etapa ${card.etapa?.nome ?? '—'}`
    + (card.lead
      ? ` · lead ${card.lead.name}${card.lead.company ? ` (${card.lead.company})` : ''} `
        + `[${card.lead.id}] PRESERVADO em Leads`
      : ' · sem lead vinculado'),
  )

  return NextResponse.json({ success: true, leadPreservado: card.lead?.id ?? null })
}
