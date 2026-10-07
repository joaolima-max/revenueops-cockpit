import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { acessoAoCard } from '@/lib/pipeline-db'
import { passagensPorEtapa } from '@/lib/sla'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const ctx = await acessoAoCard(session, id)
  if (!ctx) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (!ctx.acesso.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // A linha do tempo do card: criacao, movimento de etapa, transferencia de
  // funil e mudanca de resultado — na MESMA tabela, porque sao eventos do
  // mesmo objeto e separa-los obrigaria a tela a intercalar duas listas.
  const historico = await prisma.pipelineMovimentacao.findMany({
    where: { dealId: id },
    include: {
      user: { select: { name: true } },
      funilOrigem: { select: { nome: true } },
      etapaOrigem: { select: { nome: true } },
      funilDestino: { select: { nome: true } },
      etapaDestino: { select: { nome: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  /**
   * ── AS PASSAGENS POR ETAPA — o histórico de SLA ────────────────────────
   *
   * Quanto tempo o card passou em CADA etapa, e se cumpriu o prazo dela.
   *
   * RECONSTRUÍDO do histórico, não gravado: a duração é a diferença entre duas
   * movimentações que já estão na tabela. Uma coluna `duracao` seria um
   * terceiro registro do mesmo fato, e divergiria na primeira correção de
   * histórico — e correções acontecem (um card movido por engano e devolvido).
   *
   * Só os movimentos que MUDAM DE ETAPA entram. Mudança de resultado não move o
   * card de lugar: incluí-la criaria uma passagem de duração zero na mesma
   * etapa, e o histórico mostraria o card "entrando em Proposta" duas vezes.
   *
   * ORDEM CRESCENTE aqui, ao contrário da lista acima: a duração de uma
   * passagem é a distância até a PRÓXIMA, e reconstruí-la exige o tempo
   * correndo para frente.
   */
  const movimentos = historico
    .filter((m) => m.tipo === 'CRIACAO' || m.tipo === 'MOVIMENTO_ETAPA'
      || m.tipo === 'TRANSFERENCIA_FUNIL')
    .slice()
    .reverse()

  // O SLA é o CONFIGURADO HOJE. Isso é deliberado: mudar o prazo de uma etapa
  // reavalia o histórico dela. A alternativa — fotografar o SLA em cada
  // movimentação — faria a tela de configuração parecer não ter efeito sobre o
  // passado. Ver `passagensPorEtapa`.
  const etapaIds = [...new Set(movimentos.map((m) => m.etapaDestinoId))]
  const etapas = etapaIds.length > 0
    ? await prisma.pipelineEtapa.findMany({
        where: { id: { in: etapaIds } },
        select: { id: true, slaDias: true },
      })
    : []

  const passagens = passagensPorEtapa(
    movimentos.map((m) => ({
      etapaDestinoId: m.etapaDestinoId,
      etapaDestinoNome: m.etapaDestino.nome,
      funilDestinoNome: m.funilDestino.nome,
      createdAt: m.createdAt,
    })),
    new Map(etapas.map((e) => [e.id, e.slaDias])),
  )

  return NextResponse.json({ historico, passagens })
}
