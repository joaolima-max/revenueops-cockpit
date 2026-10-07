export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeGerenciarPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { formatMesRef } from '@/lib/utils'
import {
  orcamentoVsRealizado, opcoesDeFiltro, filtroDaPagina, periodosDaJanela,
} from '@/lib/previsao'
import { figuraMoeda, percentual } from '@/lib/format-financeiro'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import { PanelHeader } from '@/components/ui/Panel'
import OrcamentoClient, { type RealizadoPorRecorte } from './OrcamentoClient'

/**
 * PREVISÃO › ORÇAMENTO.
 *
 * ── O REALIZADO É APURADO NO SERVIDOR, POR RECORTE ──────────────────────
 *
 * A tabela mostra orçado × realizado linha a linha, e o realizado de cada
 * linha é a soma dos lançamentos do MESMO recorte (tipo + centro de custo +
 * categoria) no período.
 *
 * Essa apuração acontece aqui, e não no cliente, por duas razões:
 *
 *   1. o cliente não tem os lançamentos — buscá-los daria uma lista de
 *      centenas de linhas ao navegador para somar sete números;
 *   2. a chave do recorte precisa ser a MESMA dos dois lados. Montá-la no
 *      servidor e no cliente criaria duas implementações da mesma chave, e a
 *      primeira divergência (um `null` tratado como `''` num lado e como `'—'`
 *      no outro) faria o realizado aparecer como zero sem nenhum erro.
 *
 * A chave é `${tipo}:${centroCustoId ?? '—'}:${categoriaId ?? '—'}`, e o
 * cliente a remonta com a mesma expressão.
 */
export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  const filtro = filtroDaPagina(await searchParams)
  const periodos = periodosDaJanela(
    filtro.periodo ?? mesCorrente(), filtro.meses ?? 1,
  )

  const [consolidado, opcoes, usuarios, lancamentos] = await Promise.all([
    orcamentoVsRealizado(filtro),
    opcoesDeFiltro(),
    // SÓ USUÁRIOS ATIVOS podem ser responsáveis: atribuir um orçamento a quem
    // saiu da empresa produz um responsável que nunca vai responder.
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.lancamentoFinanceiro.groupBy({
      by: ['tipo', 'centroCustoId', 'categoriaId'],
      where: {
        data: {
          gte: new Date(`${periodos[0]}-01T00:00:00Z`),
          lt: proximoMes(periodos[periodos.length - 1]),
        },
        status: { not: 'CANCELADO' },
      },
      _sum: { valor: true },
    }),
  ])

  const realizado: RealizadoPorRecorte = {}
  for (const l of lancamentos) {
    const k = `${l.tipo}:${l.centroCustoId ?? '—'}:${l.categoriaId ?? '—'}`
    realizado[k] = (realizado[k] ?? 0) + (l._sum.valor ?? 0)
  }

  const intervalo = periodos.length === 1
    ? formatMesRef(periodos[0])
    : `${formatMesRef(periodos[0])} – ${formatMesRef(periodos[periodos.length - 1])}`

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <PanelHeader
          title="Execução do orçamento"
          sub={`${intervalo} · só orçamento aprovado ou encerrado entra nestes números.`}
        />
        <HairlineGrid cols={4}>
          <StatTile label="Orçado · despesa"
            figura={figuraMoeda(consolidado.despesa.orcado)}
            note="Teto aprovado para o período" />
          <StatTile label="Realizado · despesa"
            figura={figuraMoeda(consolidado.despesa.realizado)}
            note="Lançamentos de despesa do período" />
          <StatTile label="Saldo"
            figura={figuraMoeda(consolidado.despesa.saldo)}
            note={consolidado.despesa.saldo < 0 ? 'Orçamento estourado' : 'Disponível'} />
          <StatTile label="Utilização" primary
            figura={consolidado.despesa.utilizacao === null
              ? null
              : { valor: consolidado.despesa.utilizacao.toLocaleString('pt-BR', {
                  minimumFractionDigits: 1, maximumFractionDigits: 1,
                }), unidade: '%', prefixo: '',
                completo: percentual(consolidado.despesa.utilizacao, 1) }}
            note={consolidado.despesa.orcado > 0
              ? 'Realizado ÷ orçado'
              : 'Nenhum orçamento de despesa aprovado'} />
        </HairlineGrid>
      </section>

      {consolidado.receita.orcado > 0 && (
        <section className="space-y-4">
          <PanelHeader
            title="Orçamento de receita"
            sub="Em receita, passar do orçado é bom — e por isso não há alerta de estouro."
          />
          <HairlineGrid cols={3}>
            <StatTile label="Orçado · receita" size="sm"
              figura={figuraMoeda(consolidado.receita.orcado)} />
            <StatTile label="Realizado · receita" size="sm"
              figura={figuraMoeda(consolidado.receita.realizado)} />
            <StatTile label="Desvio" size="sm"
              figura={figuraMoeda(consolidado.receita.desvio)}
              note={consolidado.receita.desvio >= 0 ? 'Acima do orçado' : 'Abaixo do orçado'} />
          </HairlineGrid>
        </section>
      )}

      <OrcamentoClient
        centrosCusto={opcoes.centrosCusto}
        categorias={opcoes.categorias}
        usuarios={usuarios.map((u) => ({ id: u.id, nome: u.name }))}
        realizado={realizado}
        periodoInicial={filtro.periodo ?? mesCorrente()}
        podeGerenciar={await podeGerenciarPrevisaoDoBanco(session)}
      />
    </div>
  )
}

function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Primeiro instante do mês SEGUINTE a "YYYY-MM" — o limite exclusivo. */
function proximoMes(periodo: string): Date {
  const [ano, mes] = periodo.split('-').map(Number)
  return new Date(Date.UTC(ano, mes, 1))
}
