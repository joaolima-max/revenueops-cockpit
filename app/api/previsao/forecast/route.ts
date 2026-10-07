import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { podeVerPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { forecastPrevisao, filtroDaQuery } from '@/lib/previsao'

/**
 * FORECAST de receita, despesa, resultado e caixa.
 *
 * O modelo é simples de propósito — média dos meses fechados mais tendência
 * linear. Ver `lib/previsao-calculo.ts` para por que: um modelo que ninguém do
 * financeiro consegue reproduzir numa planilha é um modelo cujo número ninguém
 * defende numa reunião.
 *
 * Sem histórico suficiente a resposta é `null` com um motivo legível, nunca um
 * número suavizado que pareça previsão.
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

const HORIZONTE_MAX = 12
const HISTORICO_MAX = 36

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeVerPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const r = filtroDaQuery(params)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: 400 })

  const horizonte = Number(params.get('horizonte') ?? 3)
  const historico = Number(params.get('historico') ?? 12)

  if (!Number.isInteger(horizonte) || horizonte < 1 || horizonte > HORIZONTE_MAX) {
    return NextResponse.json(
      { error: `Horizonte inválido. Use um número de 1 a ${HORIZONTE_MAX} meses.` },
      { status: 400 },
    )
  }
  if (!Number.isInteger(historico) || historico < 3 || historico > HISTORICO_MAX) {
    return NextResponse.json(
      { error: `Histórico inválido. Use um número de 3 a ${HISTORICO_MAX} meses.` },
      { status: 400 },
    )
  }

  const forecast = await forecastPrevisao(r.filtro, horizonte, historico)
  return NextResponse.json(forecast)
}
