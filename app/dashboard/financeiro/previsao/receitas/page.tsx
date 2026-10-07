export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeGerenciarPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { formatMesRef } from '@/lib/utils'
import {
  receitaPrevistaVsRealizada, opcoesDeFiltro, filtroDaPagina, periodosDaJanela,
} from '@/lib/previsao'
import { figuraMoeda, percentual } from '@/lib/format-financeiro'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { moedaCheia } from '@/lib/format-financeiro'
import PrevisaoFiltros from '@/components/previsao/PrevisaoFiltros'
import ReceitasClient from './ReceitasClient'

/**
 * PREVISÃO › RECEITAS PREVISTAS — faturamento previsto × realizado.
 *
 * ── A COMPARAÇÃO VEM PRIMEIRO, O CADASTRO DEPOIS ────────────────────────
 *
 * A ordem da página é a ordem da pergunta: "estamos batendo a previsão?" antes
 * de "o que está previsto?". Quem abre esta tela no meio do mês quer o
 * primeiro; quem abre no começo, o segundo. Pôr o cadastro no topo faria a
 * resposta mais pedida ficar abaixo da dobra.
 */
export default async function ReceitasPrevistasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  const filtro = filtroDaPagina(await searchParams)
  const periodos = periodosDaJanela(filtro.periodo ?? mesCorrente(), filtro.meses ?? 1)

  const [comparacao, opcoes, clientes] = await Promise.all([
    receitaPrevistaVsRealizada(periodos, filtro),
    opcoesDeFiltro(),
    // SÓ CLIENTES ATIVOS: prever faturamento de um cliente encerrado é prever
    // receita de quem já saiu da carteira.
    prisma.cliente.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  const previsto = comparacao.reduce((a, c) => a + c.previsto, 0)
  const realizado = comparacao.reduce((a, c) => a + c.realizado, 0)
  const desvio = realizado - previsto
  const cumprimento = previsto > 0 ? (realizado / previsto) * 100 : null

  const intervalo = periodos.length === 1
    ? formatMesRef(periodos[0])
    : `${formatMesRef(periodos[0])} – ${formatMesRef(periodos[periodos.length - 1])}`

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="t-sm text-subtle">Carregando filtros…</p>}>
        <PrevisaoFiltros
          opcoes={opcoes}
          usa={['periodo', 'janela', 'categoria', 'parceiro', 'centroCusto']}
        />
      </Suspense>

      <section className="space-y-4">
        <PanelHeader
          title="Faturamento previsto × realizado"
          sub={`${intervalo} · o realizado vem dos lançamentos de receita, nunca de um campo digitado.`}
        />
        <HairlineGrid cols={4}>
          <StatTile label="Faturamento previsto" figura={figuraMoeda(previsto)}
            note="Soma das previsões do período" />
          <StatTile label="Faturamento realizado" figura={figuraMoeda(realizado)} primary
            note="Lançamentos de receita, por competência" />
          <StatTile label="Desvio" figura={figuraMoeda(desvio)}
            note={desvio >= 0 ? 'Acima do previsto' : 'Abaixo do previsto'} />
          <StatTile label="Cumprimento"
            figura={cumprimento === null ? null : {
              valor: cumprimento.toLocaleString('pt-BR', {
                minimumFractionDigits: 1, maximumFractionDigits: 1,
              }),
              unidade: '%', prefixo: '', completo: percentual(cumprimento, 1),
            }}
            note={previsto > 0 ? 'Realizado ÷ previsto' : 'Nenhuma previsão no período'} />
        </HairlineGrid>
      </section>

      {/* MÊS A MÊS, quando a janela é maior que um mês. Num mês só, a tabela
          repetiria os quatro tiles acima. */}
      {periodos.length > 1 && (
        <Panel padded={false}>
          <div className="p-5 sm:p-6 pb-3">
            <PanelHeader title="Mês a mês" sub="Previsto, realizado e o que ainda se espera." />
          </div>
          <TableShell>
            <Table>
              <THead>
                <HeadRow>
                  <Th className="pl-5">Período</Th>
                  <Th align="right">Previsto</Th>
                  <Th align="right">Realizado</Th>
                  <Th align="right">Desvio</Th>
                  <Th align="right">Cumprimento</Th>
                  <Th align="right">Ainda esperado</Th>
                </HeadRow>
              </THead>
              <tbody>
                {comparacao.length === 0 ? (
                  <EmptyRow colSpan={6}>Nenhum período na janela.</EmptyRow>
                ) : comparacao.map((c) => (
                  <Row key={c.periodo}>
                    <Td className="pl-5 t-num whitespace-nowrap">{formatMesRef(c.periodo)}</Td>
                    <Td align="right" numeric>{moedaCheia(c.previsto)}</Td>
                    <Td align="right" numeric>{moedaCheia(c.realizado)}</Td>
                    <Td align="right" numeric
                      className={c.desvio < 0 ? 'text-neg' : c.desvio > 0 ? 'text-pos' : undefined}>
                      {moedaCheia(c.desvio)}
                    </Td>
                    <Td align="right" numeric>
                      {c.cumprimento === null
                        ? <span className="text-subtle">—</span>
                        : percentual(c.cumprimento, 1)}
                    </Td>
                    {/* O REMANESCENTE é o que entra na projeção de caixa — e é
                        por ele, nunca pelo previsto cheio, que a dupla
                        contagem é evitada. */}
                    <Td align="right" numeric className="text-muted">
                      {moedaCheia(c.remanescente)}
                    </Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableShell>
          <p className="t-label text-subtle/70 px-5 sm:px-6 py-4">
            &quot;Ainda esperado&quot; é previsto menos realizado, nunca negativo. É esse
            valor — e não o previsto cheio — que entra na projeção de caixa: somar os dois
            contaria o mesmo dinheiro duas vezes.
          </p>
        </Panel>
      )}

      <ReceitasClient
        categorias={opcoes.categorias}
        parceiros={opcoes.parceiros}
        clientes={clientes}
        centrosCusto={opcoes.centrosCusto}
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
