import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { podeVerPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { fluxoDeCaixa, periodosDaJanela, filtroDaQuery } from '@/lib/previsao'

/**
 * FLUXO DE CAIXA — realizado × projetado.
 *
 * A janela da projeção é SEMPRE para a FRENTE a partir do período de
 * referência, e é por isso que esta rota existe separada da Visão Geral: lá a
 * janela olha para trás (o que já aconteceu no mês/trimestre/ano), e aqui ela
 * olha para frente (quanto vou ter em dezembro). São duas perguntas, e usar a
 * mesma janela nas duas faria a curva de caixa parar no mês corrente.
 *
 * `horizonte` é quantos meses à frente projetar, somados aos meses já
 * decorridos da janela — a curva precisa do passado para ter de onde partir.
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

/** Meses à frente, por padrão e no máximo. */
const HORIZONTE_PADRAO = 6
const HORIZONTE_MAX = 24

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeVerPrevisaoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const r = filtroDaQuery(params)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: 400 })

  const horizonteBruto = params.get('horizonte')
  const horizonte = horizonteBruto === null
    ? HORIZONTE_PADRAO
    : Number(horizonteBruto)
  if (!Number.isInteger(horizonte) || horizonte < 1 || horizonte > HORIZONTE_MAX) {
    return NextResponse.json(
      { error: `Horizonte inválido. Use um número de 1 a ${HORIZONTE_MAX} meses.` },
      { status: 400 },
    )
  }

  const hoje = new Date()
  const referencia = r.filtro.periodo
    ?? `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, '0')}`

  /**
   * A JANELA DA CURVA: alguns meses PARA TRÁS e o horizonte PARA FRENTE.
   *
   * O passado entra porque a curva precisa de um saldo de partida visível —
   * uma projeção que começa no mês corrente mostra a reta subindo do nada, e
   * não dá para ver se o caixa vinha crescendo ou caindo.
   */
  const [ano, mes] = referencia.split('-').map(Number)
  const fim = new Date(Date.UTC(ano, mes - 1 + horizonte, 1))
  const fimPeriodo = `${fim.getUTCFullYear()}-${String(fim.getUTCMonth() + 1).padStart(2, '0')}`
  const periodos = periodosDaJanela(fimPeriodo, (r.filtro.meses ?? 3) + horizonte)

  const fluxo = await fluxoDeCaixa(periodos, r.filtro, hoje)
  return NextResponse.json({ ...fluxo, periodos, horizonte })
}
