import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { funisVisiveis, acessoAoFunil, INCLUDE_CARD } from '@/lib/pipeline-db'

/**
 * Tudo que o quadro precisa numa chamada: os funis que o usuário enxerga, o
 * funil escolhido com suas etapas ativas, e os cards já filtrados pela alçada.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const funis = await funisVisiveis(session)
  if (funis.length === 0) {
    return NextResponse.json({ funis: [], funil: null, etapas: [], cards: [], acesso: null })
  }

  const pedido = request.nextUrl.searchParams.get('funilId')
  const funil = funis.find((f) => f.id === pedido) ?? funis[0]

  const acesso = await acessoAoFunil(session, funil.id)
  if (!acesso?.ver) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const [etapas, cards] = await Promise.all([
    // `slaDias` vem junto: o quadro desenha o indicador de SLA no card, e sem o
    // prazo da etapa ele não tem contra o que medir o tempo de permanência.
    prisma.pipelineEtapa.findMany({ where: { funilId: funil.id, ativo: true }, orderBy: { ordem: 'asc' } }),
    prisma.deal.findMany({
      where: {
        funilId: funil.id,
        // CARD EXCLUÍDO NÃO APARECE NO QUADRO. É o que torna a exclusão real:
        // sem este filtro, o soft delete seria só uma coluna marcada.
        deletedAt: null,
        // Preserva a regra que hoje está embutida na página: o COMERCIAL só
        // enxerga os próprios negócios. Agora ela é configuração, não código.
        ...(acesso.apenasProprios ? { ownerId: session.userId } : {}),
      },
      include: INCLUDE_CARD,
      // O card nao tem valor: a ordem do quadro e cronologica, do mais recente
      // para o mais antigo.
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({ funis, funil, etapas, cards, acesso })
}
