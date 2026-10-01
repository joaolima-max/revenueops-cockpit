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

export default function DetalheBaas({
  l, onFechar,
}: { l: LancamentoBaasDetalhe; onFechar: () => void }) {
  const volumeTotal = l.itens.reduce((a, i) => a + i.volume, 0)
  /** A receita da Bass Pago: tarifas + overprice. */
  const receita = l.totalTarifas + l.overpriceValor

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
                      <Th>Produto</Th>
                      <Th align="right">Taxa</Th>
                      <Th align="right">Volume</Th>
                      <Th align="right">Total</Th>
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
                      <Td className="text-fg font-medium">Total de Tarifas</Td>
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
                <Etapa rotulo="Valor residual devido ao parceiro" valor={l.valorCliente}
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
              Três números que vão para três lugares, e é a pergunta que a
              tela de Lançamentos levanta: por que o título a receber não é
              igual ao lançamento? Porque o overprice é retido, não faturado. */}
          <section className="space-y-3">
            <PanelHeader
              title="O que foi gerado"
              sub="Cada valor tem um destino, e nenhum é somado duas vezes."
            />
            <HairlineGrid cols={3}>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Lançamentos · receita</p>
                <Figure figura={figuraMoeda(receita)} size="sm" />
                <p className="t-label text-subtle/70">Tarifas + overprice</p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Contas a Receber</p>
                <Figure figura={figuraMoeda(l.totalTarifas)} size="sm" />
                <p className="t-label text-subtle/70">Só as tarifas — o que se cobra</p>
              </HairlineCell>
              <HairlineCell className="gap-2">
                <p className="t-label text-subtle">Contas a Pagar</p>
                <Figure figura={figuraMoeda(l.valorCliente)} size="sm" />
                <p className="t-label text-subtle/70">Residual devido ao parceiro</p>
              </HairlineCell>
            </HairlineGrid>

            {l.overpriceValor > 0 && (
              <p className="t-sm text-subtle">
                O overprice de{' '}
                <span className="tabular-nums text-fg">{moedaCheia(l.overpriceValor)}</span>{' '}
                não é faturado ao parceiro: ele é realizado pagando a ele menos. Por isso
                entra na receita do período e fica fora do título a receber.
              </p>
            )}
          </section>

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
