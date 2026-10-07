export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeGerenciarPrevisaoDoBanco } from '@/lib/previsao-acesso'
import { formatMesRef } from '@/lib/utils'
import {
  despesaPrevistaVsRealizada, fluxoDeCaixa, opcoesDeFiltro, filtroDaPagina,
  periodosDaJanela,
} from '@/lib/previsao'
import { figuraMoeda, moedaCheia, percentual } from '@/lib/format-financeiro'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import PrevisaoFiltros from '@/components/previsao/PrevisaoFiltros'
import DespesasClient from './DespesasClient'

/**
 * PREVISÃO › DESPESAS FUTURAS.
 *
 * ── O IMPACTO NO CAIXA FICA VISÍVEL AQUI ────────────────────────────────
 *
 * A tabela de "impacto na projeção" mostra, mês a mês, quanto das saídas
 * previstas entra no caixa projetado. É o que responde a pergunta que o
 * cadastro levanta: "registrei a folha de 500 mil para 05/11 — e daí?".
 *
 * Sem esse bloco, a tela seria um cadastro cego: a pessoa lançaria a despesa e
 * precisaria navegar até Fluxo de Caixa para ver se ela chegou lá.
 */
export default async function DespesasFuturasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getSession()
  const filtro = filtroDaPagina(await searchParams)
  const periodo = filtro.periodo ?? mesCorrente()
  const periodos = periodosDaJanela(periodo, filtro.meses ?? 1)

  /**
   * A JANELA DO IMPACTO olha para FRENTE: seis meses a partir da referência.
   *
   * A janela do filtro olha para trás (o que já aconteceu no mês/trimestre);
   * uma despesa FUTURA, por definição, está adiante dela. Usar a mesma janela
   * nas duas faria o bloco de impacto quase sempre aparecer vazio.
   */
  const periodosFrente = (() => {
    const [ano, mes] = periodo.split('-').map(Number)
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(ano, mes - 1 + i, 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
  })()

  const [comparacao, impacto, caixa, opcoes, usuarios] = await Promise.all([
    despesaPrevistaVsRealizada(periodos, filtro),
    despesaPrevistaVsRealizada(periodosFrente, filtro),
    fluxoDeCaixa(periodosFrente, filtro),
    opcoesDeFiltro(),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const previsto = comparacao.reduce((a, c) => a + c.previsto, 0)
  const realizado = comparacao.reduce((a, c) => a + c.realizado, 0)
  const desvio = realizado - previsto
  const cumprimento = previsto > 0 ? (realizado / previsto) * 100 : null

  const intervalo = periodos.length === 1
    ? formatMesRef(periodos[0])
    : `${formatMesRef(periodos[0])} – ${formatMesRef(periodos[periodos.length - 1])}`

  const saidasPrevistasTotal = caixa.pontos.reduce((a, p) => a + p.saidasPrevistas, 0)

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="t-sm text-subtle">Carregando filtros…</p>}>
        <PrevisaoFiltros
          opcoes={opcoes}
          usa={['periodo', 'janela', 'categoria', 'centroCusto', 'fornecedor']}
        />
      </Suspense>

      <section className="space-y-4">
        <PanelHeader
          title="Despesa prevista × realizada"
          sub={`${intervalo} · o realizado vem dos lançamentos de despesa.`}
        />
        <HairlineGrid cols={4}>
          <StatTile label="Despesa prevista" figura={figuraMoeda(previsto)}
            note="Despesas futuras com data no período" />
          <StatTile label="Despesa realizada" figura={figuraMoeda(realizado)} primary
            note="Lançamentos de despesa, por competência" />
          <StatTile label="Desvio" figura={figuraMoeda(desvio)}
            note={desvio > 0 ? 'Gastou mais que o previsto' : 'Gastou menos que o previsto'} />
          <StatTile label="Cumprimento"
            figura={cumprimento === null ? null : {
              valor: cumprimento.toLocaleString('pt-BR', {
                minimumFractionDigits: 1, maximumFractionDigits: 1,
              }),
              unidade: '%', prefixo: '', completo: percentual(cumprimento, 1),
            }}
            note={previsto > 0 ? 'Realizado ÷ previsto' : 'Nenhuma despesa prevista no período'} />
        </HairlineGrid>
      </section>

      {/* ── O IMPACTO NA PROJEÇÃO DE CAIXA ─────────────────────────────── */}
      <Panel padded={false}>
        <div className="p-5 sm:p-6 pb-3">
          <PanelHeader
            title="Impacto na projeção de caixa"
            sub={`Próximos 6 meses a partir de ${formatMesRef(periodo)} · ${moedaCheia(saidasPrevistasTotal)} de saídas previstas entram na projeção.`}
          />
        </div>
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th className="pl-5">Período</Th>
                <Th align="right">Previsto</Th>
                <Th align="right">Já lançado</Th>
                <Th align="right">Ainda esperado</Th>
                <Th align="right">Entra no caixa projetado</Th>
                <Th align="right">Caixa projetado no fim</Th>
              </HeadRow>
            </THead>
            <tbody>
              {impacto.length === 0 ? (
                <EmptyRow colSpan={6}>Nenhum período na janela.</EmptyRow>
              ) : impacto.map((d) => {
                const ponto = caixa.pontos.find((p) => p.periodo === d.periodo)
                return (
                  <Row key={d.periodo}>
                    <Td className="pl-5 t-num whitespace-nowrap">{formatMesRef(d.periodo)}</Td>
                    <Td align="right" numeric>{moedaCheia(d.previsto)}</Td>
                    <Td align="right" numeric className="text-muted">
                      {moedaCheia(d.realizado)}
                    </Td>
                    <Td align="right" numeric>{moedaCheia(d.remanescente)}</Td>
                    {/* É o REMANESCENTE que entra na projeção, não o previsto
                        cheio: somar os dois contaria a mesma saída duas vezes. */}
                    <Td align="right" numeric className="font-medium">
                      {ponto ? moedaCheia(ponto.saidasPrevistas) : moedaCheia(0)}
                    </Td>
                    <Td align="right" numeric
                      className={
                        ponto && ponto.saldoProjetado < 0 ? 'text-neg font-medium' : undefined
                      }>
                      {ponto ? moedaCheia(ponto.saldoProjetado) : <span className="text-subtle">—</span>}
                    </Td>
                  </Row>
                )
              })}
            </tbody>
          </Table>
        </TableShell>
        <p className="t-label text-subtle/70 px-5 sm:px-6 py-4">
          &quot;Ainda esperado&quot; é previsto menos já lançado, nunca negativo — e é esse
          valor que entra no caixa projetado. Uma despesa que já virou lançamento sai da
          previsão: o lançamento é que conta, e manter as duas somaria a mesma saída duas
          vezes.
        </p>
      </Panel>

      <DespesasClient
        fornecedores={opcoes.fornecedores}
        categorias={opcoes.categorias}
        centrosCusto={opcoes.centrosCusto}
        usuarios={usuarios.map((u) => ({ id: u.id, nome: u.name }))}
        podeGerenciar={await podeGerenciarPrevisaoDoBanco(session)}
      />
    </div>
  )
}

function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}
