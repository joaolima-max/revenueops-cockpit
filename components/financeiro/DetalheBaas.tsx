'use client'

import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import Figure from '@/components/ui/Figure'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { figuraMoeda, moedaCheia, quantidadeCompacta } from '@/lib/format-financeiro'
import { rotuloPeriodo } from '@/lib/lancamento-baas'

/**
 * DE ONDE VEIO O VALOR — o detalhe de um Lançamento BaaS.
 *
 * Existe porque, na tela de Lançamentos, uma linha de receita BaaS era só
 * "Tarifas · parceiro · competência · R$ X". O número estava certo e não
 * havia como conferi-lo: faltava a composição.
 *
 * Mostra a tabela de produtos — taxa, volume e total de cada um — e depois a
 * cascata inteira, etapa por etapa. É o mesmo conteúdo que o parceiro
 * confere, e cada etapa precisa estar visível para a conferência ser possível
 * sem recalcular à mão.
 *
 * Painel simples de propósito: não é dashboard. Nenhum gráfico, nenhum
 * indicador derivado — só os números do lançamento.
 */

export interface ItemBaas {
  id: string
  nome: string
  preco: number
  volume: number
  total: number
}

export interface LancamentoBaasDetalhe {
  id: string
  numeroConta: string
  periodoInicio: string
  periodoFim: string
  saldoInicial: number
  totalTarifas: number
  saldoRemanescente: number
  overpricePercent: number | null
  overpriceValor: number
  valorCliente: number
  status: string
  observacao: string | null
  condicao: { nomeFantasia: string; identificacao: string; tipo: string }
  itens: ItemBaas[]
}

const TIPO_LABEL: Record<string, string> = { BAAS: 'BaaS', WHITE_LABEL: 'White Label' }

/** Uma etapa da cascata. `forte` marca as duas conclusões. */
function Etapa({
  rotulo, valor, nota, forte = false, sinal,
}: {
  rotulo: string
  valor: number
  nota?: string
  forte?: boolean
  sinal?: '−' | '='
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className={forte ? 't-body text-fg' : 't-sm text-muted'}>
          {sinal && <span className="text-subtle mr-1.5 tabular-nums">{sinal}</span>}
          {rotulo}
        </span>
        {nota && <span className="block t-label text-subtle">{nota}</span>}
      </span>
      <span className={`tabular-nums whitespace-nowrap ${forte ? 't-body font-medium text-fg' : 't-sm text-muted'}`}>
        {moedaCheia(valor)}
      </span>
    </div>
  )
}

/**
 * O CORPO DO DETALHE BAAS — as três seções, sem moldura.
 *
 * Extraído para que a tela de Lançamentos possa mostrar os dados gerais do
 * lançamento E, abaixo deles, a composição BaaS, sem duplicar nada. O pedido é
 * "além dos dados gerais, mostrar Produto | Taxa | Volume | Total": uma seção
 * adicional no mesmo painel, não um segundo modal por cima do primeiro.
 */
export function CorpoBaas({ l }: { l: LancamentoBaasDetalhe }) {
  const volumeTotal = l.itens.reduce((a, i) => a + i.volume, 0)
  /**
   * A CONTABILIZAÇÃO do lançamento, pelos três números que ela produz.
   *
   * RECEITA é o saldo INTEGRAL apurado: ele estava na conta da Bass Pago, e é
   * dela que sai o pagamento ao parceiro. DESPESA é a comissão devida ao BaaS.
   * RESULTADO é a diferença — e é igual a tarifas + overprice, que era o
   * número que até a v27 aparecia sozinho, com o nome de receita.
   */
  const receita = l.saldoInicial
  const despesa = l.valorCliente
  const resultado = receita - despesa

  return (
    <>
          {/* ── PRODUTO | TAXA | VOLUME | TOTAL ───────────────────────────
              A taxa é o SNAPSHOT do lançamento, não o preço de hoje: se a
              tarifa foi reajustada depois, este painel continua mostrando a
              que foi aplicada. */}
          <section className="space-y-3">
            <PanelHeader
              title="Como a cobrança foi formada"
              sub="Taxa × volume de cada produto, com os preços aplicados no lançamento."
            />
            {l.itens.length === 0 ? (
              <Panel padded={false}>
                <EmptyState compact title="Nenhum produto neste lançamento"
                  description="O lançamento foi salvo sem produtos tarifados." />
              </Panel>
            ) : (
              <TableShell>
                <Table>
                  <THead>
                    <HeadRow>
                      {/* LARGURAS DECLARADAS, somando 100%.
                          Sem elas, "Produto" era a única coluna sem
                          `whitespace-nowrap` e com `max-w-0`: o navegador lhe
                          dava TODO o espaço sobrante e empurrava Taxa, Volume
                          e Total para a borda direita, com um vão vazio no
                          meio. Os quatro cabeçalhos ficavam na tela, mas
                          desgrudados — e a leitura "taxa × volume = total"
                          dependia de atravessar o vão com o olho.
                          Com a largura fixada, o nome do produto trunca (e o
                          `title` recupera o texto inteiro) e os três números
                          ficam juntos, que é como se conferem. */}
                      <Th className="w-[40%]">Produto</Th>
                      <Th align="right" className="w-[18%]">Taxa</Th>
                      <Th align="right" className="w-[18%]">Volume</Th>
                      <Th align="right" className="w-[24%]">Total</Th>
                    </HeadRow>
                  </THead>
                  <tbody>
                    {l.itens.length === 0 ? (
                      <EmptyRow colSpan={4}>Nenhum produto.</EmptyRow>
                    ) : l.itens.map((i) => (
                      <Row key={i.id}>
                        <Td className="max-w-0">
                          <span className="block text-fg bp-truncate" title={i.nome}>{i.nome}</span>
                        </Td>
                        <Td align="right" numeric className="text-subtle">{moedaCheia(i.preco)}</Td>
                        <Td align="right" numeric>{quantidadeCompacta(i.volume)}</Td>
                        <Td align="right" numeric className="text-fg font-medium">
                          {moedaCheia(i.total)}
                        </Td>
                      </Row>
                    ))}
                    <Row className="border-t-2 border-line-2">
                      <Td className="text-fg font-medium whitespace-nowrap">Total de Tarifas</Td>
                      <Td />
                      <Td align="right" numeric className="text-subtle">
                        {quantidadeCompacta(volumeTotal)}
                      </Td>
                      <Td align="right" numeric className="text-fg font-medium">
                        {moedaCheia(l.totalTarifas)}
                      </Td>
                    </Row>
                  </tbody>
                </Table>
              </TableShell>
            )}
          </section>

          {/* ── A CASCATA ─────────────────────────────────────────────────
              Etapa por etapa, na ordem em que o cálculo acontece. O overprice
              incide sobre o SALDO APÓS TARIFAS — e é essa ordem que a lista
              torna visível. */}
          <section className="space-y-3">
            <PanelHeader title="Do saldo ao valor devido" />
            <Panel>
              <div className="divide-y divide-line">
                <Etapa rotulo="Saldo inicial da conta" valor={l.saldoInicial} forte />
                <Etapa rotulo="Total de Tarifas" valor={l.totalTarifas} sinal="−"
                  nota={`${l.itens.length} produto${l.itens.length === 1 ? '' : 's'} tarifado${l.itens.length === 1 ? '' : 's'}`} />
                <Etapa rotulo="Saldo após tarifas" valor={l.saldoRemanescente} sinal="=" forte
                  nota="Base do overprice" />
                <Etapa rotulo="Overprice" valor={l.overpriceValor} sinal="−"
                  nota={l.overpricePercent === null
                    ? 'Parceiro sem overprice'
                    : `${l.overpricePercent}% do saldo após tarifas`} />
                <Etapa rotulo="Comissão devida ao parceiro" valor={l.valorCliente}
                  sinal="=" forte />
              </div>
            </Panel>

            {l.saldoRemanescente < 0 && (
              <p className="t-sm text-neg">
                As tarifas somam mais que o saldo informado. O overprice não é aplicado
                sobre saldo negativo.
              </p>
            )}
          </section>

          {/* ── O QUE CADA MÓDULO RECEBEU ────────────────────────────────
              Três registros, e os dois primeiros valem o MESMO: a receita é o
              saldo integral apurado, e o título a receber é essa receita vista
              como cobrança. O terceiro é a comissão do parceiro, que sai como
              despesa. Até a v27 o título cobrava só as tarifas, porque a
              receita era a margem. */}
          <section className="space-y-3">
            <PanelHeader
              title="O que foi gerado"
              sub="Cada valor tem um destino, e nenhum é somado duas vezes."
            />
            <HairlineGrid cols={3}>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Lançamentos · receita</p>
                <Figure figura={figuraMoeda(receita)} size="sm" />
                <p className="t-label text-subtle/70">Saldo integral apurado</p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Contas a Receber</p>
                <Figure figura={figuraMoeda(receita)} size="sm" />
                <p className="t-label text-subtle/70">O título da receita — mesmo valor</p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Contas a Pagar</p>
                <Figure figura={figuraMoeda(despesa)} size="sm" />
                <p className="t-label text-subtle/70">Comissão devida ao parceiro</p>
              </HairlineCell>
            </HairlineGrid>

            {/* ── O RESULTADO, declarado ───────────────────────────────────
                Com receita e despesa brutas, a margem deixa de estar à vista:
                ninguém lê "100.000" e "75.000" e conclui "25.000" sem fazer a
                conta. Então a conta é mostrada feita. */}
            <HairlineGrid cols={2}>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Resultado do lançamento</p>
                <Figure figura={figuraMoeda(resultado)} size="sm" />
                <p className="t-label text-subtle/70">Receita − comissão do parceiro</p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">O que a Bass Pago retém</p>
                <Figure figura={figuraMoeda(l.totalTarifas + l.overpriceValor)} size="sm" />
                <p className="t-label text-subtle/70">Tarifas + overprice</p>
              </HairlineCell>
            </HairlineGrid>

            <p className="t-sm text-subtle">
              O saldo apurado estava na conta da Bass Pago, então entra{' '}
              <span className="text-fg">integral</span> como receita, e o título a
              receber espelha esse valor; a comissão de{' '}
              <span className="tabular-nums text-fg">{moedaCheia(despesa)}</span>{' '}
              devida ao parceiro é contabilizada como despesa. O resultado é a
              diferença entre os dois.
              {l.overpriceValor > 0 && (
                <> Dentro do resultado, o overprice de{' '}
                <span className="tabular-nums text-fg">{moedaCheia(l.overpriceValor)}</span>{' '}
                não é cobrado à parte — ele é realizado pagando ao parceiro menos.</>
              )}
            </p>
          </section>

    </>
  )
}

export default function DetalheBaas({
  l, onFechar,
}: { l: LancamentoBaasDetalhe; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl my-8">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-line">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg bp-truncate">
              Lançamento BaaS — {l.condicao.nomeFantasia}
            </h2>
            <p className="t-sm text-muted mt-0.5">
              {TIPO_LABEL[l.condicao.tipo] ?? l.condicao.tipo} · conta {l.numeroConta} ·{' '}
              {rotuloPeriodo(new Date(l.periodoInicio), new Date(l.periodoFim))}
            </p>
          </div>
          <button onClick={onFechar} className="text-subtle hover:text-fg flex-none" aria-label="Fechar">✕</button>
        </div>

        <div className="p-5 space-y-6">
          <CorpoBaas l={l} />

          {l.observacao && (
            <section>
              <p className="t-label text-subtle">Observação</p>
              <p className="t-sm text-muted mt-1 whitespace-pre-wrap">{l.observacao}</p>
            </section>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Badge>{l.status === 'RASCUNHO' ? 'Rascunho' : 'Lançado'}</Badge>
            <Button onClick={onFechar}>Fechar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
