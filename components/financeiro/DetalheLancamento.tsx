'use client'

import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import Figure from '@/components/ui/Figure'
import { figuraMoeda } from '@/lib/format-financeiro'
import { formatDate } from '@/lib/utils'
import { CorpoBaas, type LancamentoBaasDetalhe } from './DetalheBaas'

/**
 * DETALHES DE UM LANÇAMENTO — o mesmo painel para os dois casos.
 *
 * Antes só a linha de origem BaaS tinha para onde clicar. Um lançamento comum
 * mostrava descrição, categoria e valor na tabela e nada mais: a observação, o
 * fornecedor, a recorrência e quem lançou só apareciam abrindo a edição — ou
 * seja, para LER era preciso entrar no formulário de ESCRITA.
 *
 * Agora é um painel só, com duas camadas:
 *
 *   1. os dados gerais, que todo lançamento tem;
 *   2. a composição BaaS, quando o lançamento nasceu de um Lançamento BaaS.
 *
 * Um painel com uma seção extra, e não dois modais: o pedido é "além dos dados
 * gerais, mostrar Produto | Taxa | Volume | Total", e empilhar modais faria o
 * leitor fechar dois para voltar à tabela.
 */

export interface LancamentoDetalhe {
  id: string
  tipo: 'RECEITA' | 'DESPESA'
  descricao: string
  valor: number
  data: string
  dataVencimento: string | null
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO'
  observacao: string | null
  periodicidade: 'UNICA' | 'RECORRENTE' | 'PARCELADA'
  recorrenteIndefinido: boolean
  recorrenciaFim: string | null
  parcela: number | null
  totalParcelas: number | null
  categoria: { nome: string }
  fornecedor: { razaoSocial: string } | null
  condicao: { nomeFantasia: string; tipo: 'BAAS' | 'WHITE_LABEL' } | null
  criadoPor: { name: string }
  anexos: unknown[]
  /** Origem BaaS: o lado da receita OU o do repasse. Nunca os dois. */
  baasReceita?: LancamentoBaasDetalhe | null
  baasContaPagar?: LancamentoBaasDetalhe | null
}

const STATUS_LABEL = { PENDENTE: 'Pendente', PAGO: 'Pago', CANCELADO: 'Cancelado' } as const
const STATUS_TONE: Record<string, BadgeTone> = {
  PENDENTE: 'warn', PAGO: 'pos', CANCELADO: 'neutral',
}
const PERIODICIDADE_LABEL = {
  UNICA: 'Única', RECORRENTE: 'Recorrente', PARCELADA: 'Parcelada',
} as const
const TIPO_PARCEIRO = { BAAS: 'BaaS', WHITE_LABEL: 'White Label' } as const

/** Um campo do painel. Ausência vira "—", nunca linha escondida: a ausência
 *  de observação é informação, e some se a linha não aparecer. */
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="t-label text-subtle">{rotulo}</p>
      <p className="t-sm text-fg mt-0.5 break-words">{children}</p>
    </div>
  )
}

export default function DetalheLancamento({
  l, onFechar,
}: { l: LancamentoDetalhe; onFechar: () => void }) {
  const baas = l.baasReceita ?? l.baasContaPagar ?? null

  const recorrencia = (() => {
    const base = PERIODICIDADE_LABEL[l.periodicidade]
    if (l.periodicidade === 'PARCELADA' && l.parcela && l.totalParcelas) {
      return `${base} · ${l.parcela}/${l.totalParcelas}`
    }
    if (l.periodicidade === 'RECORRENTE') {
      return l.recorrenteIndefinido
        ? `${base} · sem data final`
        : l.recorrenciaFim ? `${base} · até ${formatDate(l.recorrenciaFim)}` : base
    }
    return base
  })()

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl my-8">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-line">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg break-words">{l.descricao}</h2>
            <p className="t-sm text-muted mt-0.5">
              {l.tipo === 'RECEITA' ? 'Receita' : 'Despesa'} · {l.categoria.nome}
            </p>
          </div>
          <button onClick={onFechar} className="text-subtle hover:text-fg flex-none" aria-label="Fechar">✕</button>
        </div>

        <div className="p-5 space-y-6">
          {/* O VALOR em destaque: é a primeira pergunta de quem abre. O sinal
              da despesa fica no rótulo, não no número — um "−" grudado no
              valor confunde com saldo negativo. */}
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="t-label text-subtle">
                {l.tipo === 'RECEITA' ? 'Valor da receita' : 'Valor da despesa'}
              </p>
              <Figure figura={figuraMoeda(l.valor)} size="md" />
            </div>
            <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
          </div>

          <section className="space-y-3">
            <PanelHeader title="Dados do lançamento" />
            <Panel>
              <div className="grid gap-5 sm:grid-cols-2">
                <Campo rotulo="Descrição">{l.descricao}</Campo>
                <Campo rotulo="Categoria">{l.categoria.nome}</Campo>
                <Campo rotulo="Tipo">{l.tipo === 'RECEITA' ? 'Receita' : 'Despesa'}</Campo>
                <Campo rotulo="Data do lançamento">{formatDate(l.data)}</Campo>
                <Campo rotulo="Vencimento">
                  {l.dataVencimento ? formatDate(l.dataVencimento) : '—'}
                </Campo>
                <Campo rotulo="Status">{STATUS_LABEL[l.status]}</Campo>
                <Campo rotulo="Periodicidade">{recorrencia}</Campo>
                <Campo rotulo="Lançado por">{l.criadoPor.name}</Campo>
                {/* ORIGEM, quando aplicável. Fornecedor e parceiro são os dois
                    vínculos que distinguem lançamentos de mesma descrição. */}
                <Campo rotulo="Fornecedor">{l.fornecedor?.razaoSocial ?? '—'}</Campo>
                <Campo rotulo="BaaS / White Label">
                  {l.condicao
                    ? `${l.condicao.nomeFantasia} (${TIPO_PARCEIRO[l.condicao.tipo]})`
                    : '—'}
                </Campo>
                <Campo rotulo="Anexos">
                  {l.anexos.length === 0
                    ? 'Nenhum'
                    : `${l.anexos.length} arquivo${l.anexos.length === 1 ? '' : 's'}`}
                </Campo>
                <Campo rotulo="Origem">
                  {baas ? 'Gerado por Lançamento BaaS' : 'Lançado manualmente'}
                </Campo>
              </div>
            </Panel>
          </section>

          <section>
            <p className="t-label text-subtle">Observação</p>
            <p className="t-sm text-muted mt-1 whitespace-pre-wrap">
              {l.observacao?.trim() || '—'}
            </p>
          </section>

          {/* ── A CAMADA BAAS ────────────────────────────────────────────────
              Só quando o lançamento nasceu de um Lançamento BaaS. Mesmas
              seções do painel do módulo — produtos, cascata e destinos —
              porque é o mesmo registro, lido do mesmo lugar. */}
          {baas && (
            <div className="border-t border-line pt-6 space-y-6">
              <CorpoBaas l={baas} />
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button onClick={onFechar}>Fechar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
