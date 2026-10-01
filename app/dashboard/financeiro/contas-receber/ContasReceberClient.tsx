'use client'

import { useState, useEffect, useCallback } from 'react'
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
  cliente: { id: string; nome: string; modeloOperacional: string }
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

const TIPOS = ['Mensalidade API', 'Sustentação White Label', 'Setup', 'Setup Parcelado', 'Pedido Extra', 'Outro']

const FORM_VAZIO = {
  clienteId: '', descricao: '', tipo: TIPOS[0], valor: '',
  dataVenc: '', parcela: '', totalParcel: '', notas: '',
}

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
 * Diferente de Contas a Pagar, esta tela CADASTRA: o título de faturamento
 * nasce aqui, não em Lançamentos.
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

  const [modal, setModal] = useState<'novo' | Titulo | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)

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

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, dataVenc: new Date().toISOString().slice(0, 10) })
    setErro(''); setModal('novo')
  }

  function abrirEdicao(t: Titulo) {
    setForm({
      clienteId: t.cliente.id,
      descricao: t.descricao,
      tipo: t.tipo,
      valor: String(t.valor),
      dataVenc: t.dataVenc.slice(0, 10),
      parcela: t.parcela ? String(t.parcela) : '',
      totalParcel: t.totalParcel ? String(t.totalParcel) : '',
      notas: t.notas ?? '',
    })
    setErro(''); setModal(t)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')

    const editando = modal !== 'novo' && modal !== null
    const res = await fetch(
      editando ? `/api/financeiro/contas-receber/${modal.id}` : '/api/financeiro/contas-receber',
      {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: form.clienteId,
          descricao: form.descricao,
          tipo: form.tipo,
          valor: form.valor,
          dataVenc: form.dataVenc,
          parcela: form.parcela || null,
          totalParcel: form.totalParcel || null,
          notas: form.notas || null,
        }),
      },
    )

    if (res.ok) {
      setModal(null); carregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar o título.')
    }
    setSalvando(false)
  }

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
    if (!confirm(`Excluir o título "${t.descricao}" de ${t.cliente.nome}?`)) return
    const res = await fetch(`/api/financeiro/contas-receber/${t.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    setErro(d.error ?? 'Não foi possível excluir.')
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

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
            {podeGerenciar && <Button variant="primary" onClick={abrirNovo}>+ Novo título</Button>}
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
            description="Cadastre o faturamento do cliente — mensalidade de API, sustentação, setup ou pedido extra."
            action={podeGerenciar ? <Button variant="primary" onClick={abrirNovo}>+ Novo título</Button> : undefined}
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
                    <Td className="t-sm text-muted">{t.cliente.nome}</Td>
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
                            <Button size="sm" onClick={() => abrirEdicao(t)}>Editar</Button>
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
        Contas a Receber lê os títulos de faturamento do cliente. Despesas vivem em Lançamentos e
        aparecem em Contas a Pagar — são bases distintas, e nenhum valor é contado nas duas.
      </p>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal === 'novo' ? 'Novo título' : `Editar — ${modal.descricao}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={salvar} className="p-5 space-y-4">
              {erro && (
                <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
              )}

              <div>
                <label className={lbl} htmlFor="cr-desc">Descrição *</label>
                <input id="cr-desc" required value={form.descricao} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="cr-cliente">Cliente *</label>
                  <select id="cr-cliente" required value={form.clienteId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, clienteId: e.target.value }))}>
                    <option value="">Selecione…</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="cr-tipo">Tipo *</label>
                  <select id="cr-tipo" value={form.tipo} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))}>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="cr-valor">Valor (R$) *</label>
                  <input id="cr-valor" required type="number" step="0.01" min="0.01" value={form.valor}
                    className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="cr-venc">Vencimento *</label>
                  <input id="cr-venc" required type="date" value={form.dataVenc} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, dataVenc: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="cr-parcela">Parcela</label>
                  <input id="cr-parcela" type="number" min="1" value={form.parcela} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, parcela: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="cr-total">Total de parcelas</label>
                  <input id="cr-total" type="number" min="1" value={form.totalParcel} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, totalParcel: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="cr-notas">Observação</label>
                <textarea id="cr-notas" rows={2} maxLength={1000} value={form.notas}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))} />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
