import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  podeVerPrevisaoDoBanco, podeGerenciarPrevisaoDoBanco,
} from '@/lib/previsao-acesso'
import { visaoGeralPrevisao, filtroDaQuery } from '@/lib/previsao'

/**
 * VISÃO GERAL DA PREVISÃO — tudo o que o painel mostra, numa chamada.
 *
 * Uma rota e não seis, pela mesma razão de `/api/dashboard/series`: os blocos
 * da tela compartilham a janela e os filtros, e seis requisições em cascata
 * deixariam a tela montando aos pedaços — além de abrir a porta para dois
 * blocos lerem recortes diferentes do mesmo filtro.
 *
 * `podeGerenciar` volta no payload para a tela saber se desenha os botões de
 * ação. É CONVENIÊNCIA DE UI, não autorização: cada rota de escrita confere a
 * alçada por conta própria, e esconder o botão nunca é o que protege o dado.
 */
/**
 * A ALÇADA É CONFERIDA CONTRA O BANCO, não contra o token.
 *
 * `view_previsao` e `manage_previsao` nasceram nesta rodada, então o JWT de
 * quem já estava logado não as tem — e o proxy, por isso, não decide essas
 * chaves (ver `PERMISSOES_RECENTES`, em lib/permissions). A autoridade é aqui,
 * com a lista de agora.
 *
 * Isto faz a concessão valer na hora em vez de em sete dias, e a REVOGAÇÃO
 * também.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeVerPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const r = filtroDaQuery(request.nextUrl.searchParams)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: 400 })

  const visao = await visaoGeralPrevisao(r.filtro)
  return NextResponse.json({ ...visao, podeGerenciar: await podeGerenciarPrevisaoDoBanco(session) })
}
