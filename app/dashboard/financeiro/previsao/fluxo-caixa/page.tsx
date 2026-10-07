export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { formatMesRef } from '@/lib/utils'
import {
  fluxoDeCaixa, opcoesDeFiltro, filtroDaPagina,
} from '@/lib/previsao'
import { figuraMoeda, moedaCheia } from '@/lib/format-financeiro'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Figure from '@/components/ui/Figure'
import Badge from '@/components/ui/Badge'
import { Alert } from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import PrevisaoFiltros from '@/components/previsao/PrevisaoFiltros'
import FluxoCaixaGrafico from './FluxoCaixaGrafico'

/**
 * PREVISÃO › FLUXO DE CAIXA.
 *
 * ── A CONTA, EXPLÍCITA NA TELA ──────────────────────────────────────────
 *
 *   caixa realizado
 *     + entradas previstas
 *     − saídas previstas
 *   = caixa projetado
 *
 * A tabela mostra as seis parcelas de cada mês separadas, e não só o total.
 * Um saldo projetado sozinho é um número que ninguém confere: quem olha quer
 * saber de onde ele vem, e principalmente quanto dele é EXPECTATIVA e quanto
 * já aconteceu.
 *
 * ── O QUE NÃO É CAIXA ───────────────────────────────────────────────────
 *
 * `LancamentoDiario.saldoEmConta` NÃO entra aqui. É o saldo da conta
 * TRANSACIONAL — dinheiro de cliente em trânsito, exatamente o que o Float
 * mede. Somá-lo ao caixa da Bass Pago inflaria o saldo em ordens de grandeza e
 * misturaria dinheiro de terceiro com dinheiro próprio.
 *
 * O caixa aqui é sempre derivado de LIQUIDAÇÃO de lançamento financeiro.
 */
export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtro = filtroDaPagina(await searchParams)
  const periodo = filtro.periodo ?? mesCorrente()

  /**
   * A JANELA DESTA TELA OLHA PARA FRENTE.
   *
   * Três meses para trás (para a curva ter de onde partir) e seis para frente.
   * Sem o passado, a projeção aparece subindo do nada e não dá para ver se o
   * caixa vinha crescendo ou caindo; sem o futuro, a tela não é uma projeção.
   */
  const periodos = (() => {
    const [ano, mes] = periodo.split('-').map(Number)
    return Array.from({ length: 9 }, (_, i) => {
      const d = new Date(Date.UTC(ano, mes - 1 - 2 + i, 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
  })()

  const [fluxo, opcoes] = await Promise.all([
    fluxoDeCaixa(periodos, filtro),
    opcoesDeFiltro(),
  ])

  const ultimo = fluxo.pontos[fluxo.pontos.length - 1] ?? null
  const doPeriodo = fluxo.pontos.find((p) => p.periodo === periodo) ?? null

  const entradasPrevistasTotal = fluxo.pontos.reduce(
    (a, p) => a + p.entradasAReceber + p.entradasPrevistas, 0,
  )
  const saidasPrevistasTotal = fluxo.pontos.reduce(
    (a, p) => a + p.saidasAPagar + p.saidasPrevistas, 0,
  )

  /** O primeiro mês em que o caixa projetado fica negativo, se houver. */
  const primeiroNegativo = fluxo.pontos.find((p) => p.saldoProjetado < 0) ?? null

  return (
    <div className="space-y-8">
      <Suspense fallback={<p className="t-sm text-subtle">Carregando filtros…</p>}>
        <PrevisaoFiltros
          opcoes={opcoes}
          // SEM filtro de TIPO: o fluxo de caixa mostra entradas E saídas por
          // definição — filtrar por um dos dois produziria uma "projeção" que
          // só soma ou só subtrai.
          usa={['periodo', 'categoria', 'centroCusto', 'parceiro']}
        />
      </Suspense>

      <section className="space-y-4">
        <PanelHeader
          title="Caixa realizado e projetado"
          sub={`${formatMesRef(periodos[0])} – ${formatMesRef(periodos[periodos.length - 1])} · três meses para trás, seis para frente.`}
        />
        <HairlineGrid cols={4}>
          <StatTile label="Caixa realizado"
            figura={figuraMoeda(fluxo.caixaRealizadoHoje)}
            note="Liquidado até hoje, desde o começo dos registros" />
          <StatTile label="Entradas previstas"
            figura={figuraMoeda(entradasPrevistasTotal)}
            note="A receber no vencimento + receita ainda esperada" />
          <StatTile label="Saídas previstas"
            figura={figuraMoeda(saidasPrevistasTotal)}
            note="A pagar no vencimento + despesa futura" />
          <StatTile label="Caixa projetado" primary
            figura={ultimo ? figuraMoeda(ultimo.saldoProjetado) : null}
            note={ultimo
              ? `Esperado ao fim de ${formatMesRef(ultimo.periodo)}`
              : 'Sem movimento de caixa na janela'} />
        </HairlineGrid>
      </section>

      {/* ── O ALERTA QUE ESTA TELA EXISTE PARA DAR ──────────────────────── */}
      {primeiroNegativo && (
        <Alert tone="error">
          O caixa projetado fica <span className="font-medium">negativo</span> em{' '}
          {formatMesRef(primeiroNegativo.periodo)}:{' '}
          {moedaCheia(primeiroNegativo.saldoProjetado)}. A projeção considera os títulos
          com vencimento no mês e as previsões lançadas — títulos já vencidos ficam de
          fora, porque o sistema não sabe quando serão liquidados.
        </Alert>
      )}

      {(fluxo.vencidoAReceber > 0 || fluxo.vencidoAPagar > 0) && (
        <Alert tone="warn">
          Fora da projeção:{' '}
          {fluxo.vencidoAReceber > 0 && <>{moedaCheia(fluxo.vencidoAReceber)} a receber vencido</>}
          {fluxo.vencidoAReceber > 0 && fluxo.vencidoAPagar > 0 && ' e '}
          {fluxo.vencidoAPagar > 0 && <>{moedaCheia(fluxo.vencidoAPagar)} a pagar vencido</>}
          . Títulos vencidos não são atribuídos a nenhum mês futuro — atribuí-los a um mês
          arbitrário produziria uma entrada ou saída que ninguém prometeu.
        </Alert>
      )}

      {/* ── RESULTADO CONTÁBIL × GERAÇÃO DE CAIXA ──────────────────────── */}
      <section className="space-y-4">
        <PanelHeader
          title="Resultado contábil × geração de caixa"
          sub="Não são a mesma coisa — e a diferença entre eles é o capital de giro da janela."
        />
        <HairlineGrid cols={3}>
          <HairlineCell className="gap-2">
            <p className="t-label text-subtle">Resultado contábil</p>
            <Figure figura={figuraMoeda(fluxo.contabilVsCaixa.resultadoContabil)} size="sm" />
            <p className="t-label text-subtle/70">
              Competência: receita e despesa do período em que ocorreram. É o lucro.
            </p>
          </HairlineCell>
          <HairlineCell className="gap-2">
            <p className="t-label text-subtle">Geração de caixa</p>
            <Figure figura={figuraMoeda(fluxo.contabilVsCaixa.geracaoCaixa)} size="sm" />
            <p className="t-label text-subtle/70">
              Liquidação: o que entrou e o que saiu de fato. É o dinheiro.
            </p>
          </HairlineCell>
          <HairlineCell className="gap-2">
            <p className="t-label text-subtle">Diferença</p>
            <Figure figura={figuraMoeda(fluxo.contabilVsCaixa.diferenca)} size="sm" />
            <p className="t-label text-subtle/70">
              É o que explica &quot;demos lucro&quot; e &quot;não tem dinheiro na
              conta&quot; serem verdade ao mesmo tempo.
            </p>
          </HairlineCell>
        </HairlineGrid>
      </section>

      <Panel>
        <PanelHeader
          title="Evolução e projeção do caixa"
          sub="Série cheia é o realizado; traço é a projeção. Elas se encontram no mês em curso."
        />
        <div className="mt-5">
          <FluxoCaixaGrafico
            pontos={fluxo.pontos.map((p) => ({
              periodo: p.periodo,
              fechado: p.fechado,
              saldoRealizado: p.saldoRealizado,
              saldoProjetado: p.saldoProjetado,
              geracaoRealizada: p.geracaoRealizada,
              geracaoProjetada: p.geracaoProjetada,
            }))}
          />
        </div>
      </Panel>

      {/* ── A CONTA ABERTA, MÊS A MÊS ──────────────────────────────────── */}
      <Panel padded={false}>
        <div className="p-5 sm:p-6 pb-3">
          <PanelHeader
            title="A conta, mês a mês"
            sub="Saldo inicial + entradas − saídas = saldo projetado. As seis parcelas separadas."
          />
        </div>
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th className="pl-5">Período</Th>
                <Th align="right">Saldo inicial</Th>
                <Th align="right">Entradas realizadas</Th>
                <Th align="right">A receber</Th>
                <Th align="right">Receita prevista</Th>
                <Th align="right">Saídas realizadas</Th>
                <Th align="right">A pagar</Th>
                <Th align="right">Despesa prevista</Th>
                <Th align="right">Saldo projetado</Th>
              </HeadRow>
            </THead>
            <tbody>
              {fluxo.pontos.length === 0 ? (
                <EmptyRow colSpan={9}>
                  Nenhum movimento de caixa na janela. O caixa vem da liquidação de
                  lançamentos financeiros — sem lançamento pago, não há caixa a mostrar.
                </EmptyRow>
              ) : fluxo.pontos.map((p) => (
                <Row key={p.periodo}>
                  <Td className="pl-5 t-num whitespace-nowrap">
                    {formatMesRef(p.periodo)}
                    {p.fechado && <Badge tone="neutral" className="ml-2">fechado</Badge>}
                  </Td>
                  <Td align="right" numeric className="text-muted">
                    {moedaCheia(p.saldoInicial)}
                  </Td>
                  <Td align="right" numeric>{moedaCheia(p.entradasRealizadas)}</Td>
                  <Td align="right" numeric className="text-muted">
                    {moedaCheia(p.entradasAReceber)}
                  </Td>
                  <Td align="right" numeric className="text-muted">
                    {moedaCheia(p.entradasPrevistas)}
                  </Td>
                  <Td align="right" numeric>{moedaCheia(p.saidasRealizadas)}</Td>
                  <Td align="right" numeric className="text-muted">
                    {moedaCheia(p.saidasAPagar)}
                  </Td>
                  <Td align="right" numeric className="text-muted">
                    {moedaCheia(p.saidasPrevistas)}
                  </Td>
                  <Td align="right" numeric
                    className={p.saldoProjetado < 0 ? 'text-neg font-medium' : 'font-medium'}>
                    {moedaCheia(p.saldoProjetado)}
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableShell>
        <p className="t-label text-subtle/70 px-5 sm:px-6 py-4">
          Período <span className="text-fg">fechado</span> não tem projeção: nele o saldo
          projetado É o realizado, porque não há mais nada a esperar. Receita e despesa
          previstas entram pelo que AINDA se espera (previsto menos realizado), nunca pelo
          valor cheio — somar os dois contaria o mesmo dinheiro duas vezes.
        </p>
      </Panel>

      {doPeriodo && (
        <Panel>
          <p className="t-sm text-subtle">
            Em {formatMesRef(periodo)}, a geração de caixa realizada foi de{' '}
            <span className="text-fg tabular-nums">{moedaCheia(doPeriodo.geracaoRealizada)}</span>
            {!doPeriodo.fechado && (
              <> e ainda se espera{' '}
              <span className="text-fg tabular-nums">{moedaCheia(doPeriodo.geracaoProjetada)}</span></>
            )}
            . O caixa é apurado por <span className="text-fg">liquidação</span> — lançamento
            pago —, e não pelo saldo da conta transacional, que é dinheiro de cliente em
            trânsito.
          </p>
        </Panel>
      )}
    </div>
  )
}

function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}
