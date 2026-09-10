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
    prisma.pipelineEtapa.findMany({ where: { funilId: funil.id, ativo: true }, orderBy: { ordem: 'asc' } }),
    prisma.deal.findMany({
      where: {
        funilId: funil.id,
        // Preserva a regra que hoje está embutida na página: o COMERCIAL só
        // enxerga os próprios negócios. Agora ela é configuração, não código.
        ...(acesso.apenasProprios ? { ownerId: session.userId } : {}),
      },
      include: INCLUDE_CARD,
      orderBy: { value: 'desc' },
    }),
  ])

  return NextResponse.json({ funis, funil, etapas, cards, acesso })
}
