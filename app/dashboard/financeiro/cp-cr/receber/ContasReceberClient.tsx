'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { figuraMoeda } from '@/lib/format-financeiro'
import { formatDate, formatMesRef } from '@/lib/utils'
import type { SituacaoReceber, StatusContaReceber } from '@/lib/financeiro'

interface Cliente { id: string; nome: string; modeloOperacional: string; status: string }

interface Titulo {
  id: string
  descricao: string
  tipo: string
  valor: number
  dataVenc: string
  dataFatura: string | null
  dataPago: string | null
  status: StatusContaReceber
  situacao: SituacaoReceber
  diasParaVencer: number | null
  notas: string | null
  parcela: number | null
  totalParcel: number | null
  /** Devedor quando é cliente da carteira. Null quando é parceiro. */
  cliente: { id: string; nome: string; modeloOperacional: string } | null
  /** Devedor quando é parceiro BaaS/White Label. */
  condicao: { id: string; nomeFantasia: string; identificacao: string; tipo: string } | null
  /** Nome de quem deve, resolvido pelo servidor. */
  devedor: string
}

interface Resumo {
  total: number; pagas: number; aReceber: number
  vencidas: number; aVencer: number; titulos: number
}

interface Resposta { titulos: Titulo[]; resumo: Resumo }

const SITUACAO: Record<SituacaoReceber, { label: string; tone: BadgeTone }> = {
  PAGA: { label: 'Recebida', tone: 'pos' },
  VENCIDA: { label: 'Vencida', tone: 'neg' },
  A_VENCER: { label: 'A vencer', tone: 'warn' },
}

const STATUS_LABEL: Record<StatusContaReceber, string> = {
  PENDENTE: 'Pendente', FATURADO: 'Faturado', PAGO: 'Pago', INADIMPLENTE: 'Inadimplente',
}

const STATUS_TONE: Record<StatusContaReceber, BadgeTone> = {
  PENDENTE: 'warn', FATURADO: 'accent', PAGO: 'pos', INADIMPLENTE: 'neg',
}

const FILTROS: Array<{ valor: '' | SituacaoReceber; label: string }> = [
  { valor: '', label: 'Todas' },
  { valor: 'VENCIDA', label: 'Vencidas' },
  { valor: 'A_VENCER', label: 'A vencer' },
  { valor: 'PAGA', label: 'Recebidas' },
]

function hojeMes(): string {
  return new Date().toISOString().slice(0, 7)
}

/** "vence em 3 dias" / "venceu há 12 dias" / "vence hoje". */
function prazo(dias: number | null): string {
  if (dias === null) return '—'
  if (dias === 0) return 'vence hoje'
  if (dias > 0) return `vence em ${dias} dia${dias === 1 ? '' : 's'}`
  const d = Math.abs(dias)
  return `venceu há ${d} dia${d === 1 ? '' : 's'}`
}

/**
 * CONTAS A RECEBER — o faturamento do cliente, visto pela data de vencimento.
 *
 * Mesma estrutura de Contas a Pagar: período no cabeçalho, quatro KPIs, filtro
 * por situação em chips, painel de filtros e tabela. A base é outra
 * (`ContaReceber`, e não lançamento de despesa), mas a leitura é a mesma — e é
 * isso que faz as duas telas parecerem o mesmo produto.
 *
 * NÃO CADASTRA, exatamente como Contas a Pagar. O título nasce em Lançamentos,
 * ao registrar uma receita com cliente. Duas portas de criação para o mesmo
 * recebível produziriam dois cadastros do mesmo dinheiro, cada um com a sua
 * versão da verdade — que é o problema que o ambiente financeiro resolveu
 * mantendo uma origem por informação.
 *
 * O que a tela faz é GERIR: filtrar, acompanhar vencimento, dar baixa,
 * corrigir e excluir.
 */
export default function ContasReceberClient({ clientes, podeGerenciar }: {
  clientes: Cliente[]
  podeGerenciar: boolean
}) {
  const [periodo, setPeriodo] = useState(hojeMes())
  const [todos, setTodos] = useState(false)
  const [situacao, setSituacao] = useState<'' | SituacaoReceber>('')
  const [descricao, setDescricao] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [status, setStatus] = useState<'' | StatusContaReceber>('')

  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [resumo, setResumo] = useState<Resumo>({
    total: 0, pagas: 0, aReceber: 0, vencidas: 0, aVencer: 0, titulos: 0,
  })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (): Promise<Resposta | null> => {
    const p = new URLSearchParams({ periodo: todos ? 'todos' : periodo })
    if (situacao) p.set('situacao', situacao)
    if (status) p.set('status', status)
    if (descricao) p.set('descricao', descricao)
    if (clienteId) p.set('clienteId', clienteId)

    const res = await fetch(`/api/financeiro/contas-receber?${p}`)
    if (!res.ok) return null
    return (await res.json()) as Resposta
  }, [periodo, todos, situacao, status, descricao, clienteId])

  const aplicar = useCallback((d: Resposta | null) => {
    if (d) {
      setTitulos(d.titulos ?? [])
      setResumo(d.resumo)
    }
    setCarregando(false)
  }, [])

  const carregar = useCallback(async () => { aplicar(await buscar()) }, [buscar, aplicar])

  useEffect(() => {
    let vivo = true
    buscar().then((d) => { if (vivo) aplicar(d) })
    return () => { vivo = false }
  }, [buscar, aplicar])

  /** Baixa: muda o status do título. Mesma mecânica de Contas a Pagar. */
  async function mudarStatus(t: Titulo, novo: StatusContaReceber) {
    setErro('')
    const res = await fetch(`/api/financeiro/contas-receber/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novo }),
    })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    setErro(d.error ?? 'Não foi possível atualizar o título.')
  }

  async function excluir(t: Titulo) {
    if (!confirm(`Excluir o título "${t.descricao}" de ${t.devedor}?`)) return
    const res = await fetch(`/api/financeiro/contas-receber/${t.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    setErro(d.error ?? 'Não foi possível excluir.')
  }

  const inp = 'bp-field'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contas a Receber"
        sub={`Faturamento do cliente pela data de vencimento · ${todos ? 'todos os períodos' : formatMesRef(periodo)}`}
        actions={
          <div className="flex items-center gap-2">
            <input type="month" value={periodo} disabled={todos}
              onChange={(e) => setPeriodo(e.target.value)}
              aria-label="Período" className="bp-field w-auto disabled:opacity-40" />
            <Button variant={todos ? 'primary' : 'ghost'} onClick={() => setTodos((v) => !v)}>
              {todos ? 'Todos os períodos' : 'Ver todos'}
            </Button>

          </div>
        }
      />

      <HairlineGrid cols={4}>
        <StatTile label="Total do período" figura={figuraMoeda(resumo.total)} primary
          note={`${resumo.titulos} título${resumo.titulos === 1 ? '' : 's'}`} />
        <StatTile label="Vencidas" figura={figuraMoeda(resumo.vencidas)}
          note="Em aberto com vencimento passado" />
        <StatTile label="A vencer" figura={figuraMoeda(resumo.aVencer)}
          note="Em aberto ainda no prazo" />
        <StatTile label="Recebidas" figura={figuraMoeda(resumo.pagas)}
          note="Baixadas no período" />
      </HairlineGrid>

      {erro && (
        <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.valor || 'todas'}
            onClick={() => setSituacao(f.valor)}
            aria-pressed={situacao === f.valor}
            className={`px-3 py-1.5 rounded-lg t-label border transition-colors duration-[180ms] ease-bp ${
              situacao === f.valor
                ? 'border-accent/40 bg-accent/10 text-accent-soft'
                : 'border-line text-muted hover:border-line-2 hover:text-fg'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Panel padded={false}>
        <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input placeholder="Descrição…" value={descricao} className={inp}
            onChange={(e) => setDescricao(e.target.value)} />
          <select value={clienteId} className={inp} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos os clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={status} className={inp}
            onChange={(e) => setStatus(e.target.value as '' | StatusContaReceber)}>
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_LABEL) as StatusContaReceber[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </Panel>

      {carregando ? (
        <TableShell>
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="bp-skeleton h-10" />)}
          </div>
        </TableShell>
      ) : titulos.length === 0 && !descricao && !clienteId && !status && !situacao ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum título neste período"
            description="Os recebíveis nascem em Lançamentos, ao registrar uma receita com cliente."
            action={
              <Link href="/dashboard/financeiro/cp-cr/lancamentos">
                <Button variant="primary">Ir para Lançamentos</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th className="pl-5">Descrição</Th>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th>Vencimento</Th>
                <Th align="center">Situação</Th>
                <Th align="center">Status</Th>
                <Th align="right">Valor</Th>
                <Th align="right">Ações</Th>
              </HeadRow>
            </THead>
            <tbody>
              {titulos.length === 0 ? (
                <EmptyRow colSpan={8}>Nenhum título com esses filtros.</EmptyRow>
              ) : titulos.map((t) => {
                const s = SITUACAO[t.situacao]
                return (
                  <Row key={t.id}>
                    <Td className="pl-5">
                      <span className="block t-body font-medium text-fg">{t.descricao}</span>
                      {t.parcela && t.totalParcel && (
                        <span className="block t-label text-subtle mt-0.5">
                          parcela {t.parcela}/{t.totalParcel}
                        </span>
                      )}
                    </Td>
                    {/* DEVEDOR já resolvido pelo servidor: pode ser cliente
                        da carteira ou parceiro BaaS/White Label. */}
                    <Td className="t-sm text-muted">{t.devedor}</Td>
                    <Td><Badge>{t.tipo}</Badge></Td>
                    <Td className="t-num">
                      <span className="block text-fg">{formatDate(t.dataVenc)}</span>
                      <span className={`block t-label ${t.situacao === 'VENCIDA' ? 'text-neg' : 'text-subtle'}`}>
                        {prazo(t.diasParaVencer)}
                      </span>
                    </Td>
                    <Td align="center"><Badge tone={s.tone}>{s.label}</Badge></Td>
                    <Td align="center">
                      <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    </Td>
                    <Td align="right" numeric className="text-fg font-medium">
                      {figuraMoeda(t.valor).completo}
                    </Td>
                    <Td align="right">
                      <span className="inline-flex gap-2">
                        {podeGerenciar && (
                          <>
                            <Button size="sm" variant={t.status === 'PAGO' ? 'subtle' : 'primary'}
                              onClick={() => mudarStatus(t, t.status === 'PAGO' ? 'PENDENTE' : 'PAGO')}>
                              {t.status === 'PAGO' ? 'Reabrir' : 'Dar baixa'}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => excluir(t)}>Excluir</Button>
                          </>
                        )}
                      </span>
                    </Td>
                  </Row>
                )
              })}
            </tbody>
          </Table>
        </TableShell>
      )}

      <p className="t-label text-subtle">
        Esta tela acompanha os recebíveis; ela não os cria. Um título nasce em{' '}
        <Link href="/dashboard/financeiro/cp-cr/lancamentos" className="text-accent-soft hover:underline">
          Lançamentos
        </Link>
        , ao registrar uma receita com cliente — a mesma relação que Contas a Pagar tem com as
        despesas. Nenhum valor é contado nas duas telas.
      </p>

    </div>
  )
}
