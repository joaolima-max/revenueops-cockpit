import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  seriesCockpit, rangeDias, RANGE_PADRAO, RANGES_DIAS,
} from '@/lib/kpi'

/**
 * SÉRIES DOS GRÁFICOS DO COCKPIT — 7, 30 ou 90 dias.
 *
 * ── POR QUE UMA ROTA, E NÃO UM FILTRO NO NAVEGADOR ──────────────────────
 *
 * O período escolhido tem de refletir dado REAL do backend. Mandar 90 dias
 * para o navegador e recortar lá teria duas consequências ruins: o payload
 * seria sempre o maior possível (mesmo para quem só olha 7 dias), e o "filtro"
 * passaria a ser uma afirmação do cliente sobre o que o servidor mandou —
 * impossível de conferir e fácil de divergir da apuração.
 *
 * ── POR QUE UM PAYLOAD PARA TODOS OS GRÁFICOS ───────────────────────────
 *
 * Nove dos doze gráficos do Cockpit saem do MESMO conjunto de linhas de
 * `LancamentoDiario`. Uma rota por gráfico pagaria nove consultas pelas mesmas
 * linhas, e cada gráfico poderia acabar lendo um recorte ligeiramente
 * diferente. Aqui a janela é resolvida uma vez e todos leem dela.
 *
 * O cliente guarda o resultado por janela: trocar um gráfico de 30 para 90
 * dias busca uma vez, e os demais gráficos que forem para 90 reaproveitam. São
 * no máximo três requisições por sessão, independentemente de quantos gráficos
 * existam.
 *
 * ── NÃO QUEBRA A API EXISTENTE ──────────────────────────────────────────
 *
 * `/api/dashboard` continua respondendo o que respondia. Esta é uma rota NOVA,
 * sob o mesmo prefixo — então a autorização do Cockpit em `lib/modules.ts`
 * (`api: ['/api/dashboard']`) já a cobre por prefixo, sem precisar registrar
 * nada e sem abrir caminho não autorizado.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const pedido = request.nextUrl.searchParams.get('range')
  const dias = rangeDias(pedido)

  /**
   * JANELA FORA DO CONJUNTO É RECUSADA, não silenciosamente corrigida.
   *
   * O conjunto é fechado (7, 30, 90) e a recusa é deliberada: cair no padrão
   * em silêncio faria o gráfico mostrar 30 dias enquanto o controle diz 90, e
   * ninguém teria como perceber. Já `range` AUSENTE é legítimo — é a primeira
   * carga, e aí o padrão é a resposta certa.
   */
  if (pedido !== null && dias === null) {
    return NextResponse.json(
      {
        error: `Janela inválida. Use ${RANGES_DIAS.map((d) => `${d}d`).join(', ')}.`,
      },
      { status: 400 },
    )
  }

  const series = await seriesCockpit(dias ?? RANGE_PADRAO)
  return NextResponse.json(series)
}
