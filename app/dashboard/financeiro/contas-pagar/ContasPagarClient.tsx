'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { figuraMoeda } from '@/lib/format-financeiro'
import { formatDate, formatMesRef } from '@/lib/utils'
import type { SituacaoPagar } from '@/lib/financeiro'

interface Categoria { id: string; nome: string; tipo: 'RECEITA' | 'DESPESA' }
interface Fornecedor { id: string; razaoSocial: string }

interface Titulo {
  id: string
  descricao: string
  valor: number
  data: string
  dataVencimento: string
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO'
  situacao: SituacaoPagar
  diasParaVencer: number | null
  categoria: { id: string; nome: string }
  fornecedor: { id: string; razaoSocial: string } | null
  parcela: number | null
  totalParcelas: number | null
}

interface Resumo {
  total: number; pagas: number; pendentes: number
  vencidas: number; aVencer: number; titulos: number
}

interface Resposta { titulos: Titulo[]; resumo: Resumo }

const SITUACAO: Record<SituacaoPagar, { label: string; tone: BadgeTone }> = {
  PAGA: { label: 'Paga', tone: 'pos' },
  VENCIDA: { label: 'Vencida', tone: 'neg' },
  A_VENCER: { label: 'A vencer', tone: 'warn' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' },
}

const FILTROS: Array<{ valor: '' | SituacaoPagar; label: string }> = [
  { valor: '', label: 'Todas' },
  { valor: 'VENCIDA', label: 'Vencidas' },
  { valor: 'A_VENCER', label: 'A vencer' },
  { valor: 'PAGA', label: 'Pagas' },
  { valor: 'CANCELADA', label: 'Canceladas' },
]

function hojeMes(): string {
  return new Date().toISOString().slice(0, 7)
}

/** "vence em 3 dias" / "venceu há 12 dias" / "hoje". */
function prazo(dias: number | null): string {
  if (dias === null) return '—'
  if (dias === 0) return 'vence hoje'
  if (dias > 0) return `vence em ${dias} dia${dias === 1 ? '' : 's'}`
  const d = Math.abs(dias)
  return `venceu há ${d} dia${d === 1 ? '' : 's'}`
}

/**
 * CONTAS A PAGAR.
 *
 * Os mesmos lançamentos de DESPESA da tela de Lançamentos, vistos pela data de
 * VENCIMENTO. Não existe uma segunda base de despesas: alterar um lançamento
 * ali muda o título aqui, porque é a mesma linha.
 *
 * Por isso esta tela não cria nem edita — ela CLASSIFICA e cobra. O botão de
 * baixa muda o status do próprio lançamento.
 */
export default function ContasPagarClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [periodo, setPeriodo] = useState(hojeMes())
  const [todos, setTodos] = useState(false)
  const [situacao, setSituacao] = useState<'' | SituacaoPagar>('')
  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  const [titulos, setTitulos] = useState<Titulo[]>([])
  const [resumo, setResumo] = useState<Resumo>({
    total: 0, pagas: 0, pendentes: 0, vencidas: 0, aVencer: 0, titulos: 0,
  })
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (): Promise<Resposta | null> => {
    const p = new URLSearchParams({ periodo: todos ? 'todos' : periodo })
    if (situacao) p.set('situacao', situacao)
    if (descricao) p.set('descricao', descricao)
    if (categoriaId) p.set('categoriaId', categoriaId)
    if (fornecedorId) p.set('fornecedorId', fornecedorId)

    const res = await fetch(`/api/financeiro/contas-pagar?${p}`)
    if (!res.ok) return null
    return (await res.json()) as Resposta
  }, [periodo, todos, situacao, descricao, categoriaId, fornecedorId])

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

  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch('/api/financeiro/categorias?tipo=DESPESA').then((r) => (r.ok ? r.json() : { categorias: [] })),
      fetch('/api/financeiro/fornecedores').then((r) => (r.ok ? r.json() : { fornecedores: [] })),
    ])
      .then(([cat, forn]) => {
        if (!vivo) return
        setCategorias((cat.categorias ?? []).filter((c: Categoria) => c.tipo === 'DESPESA'))
        setFornecedores(forn.fornecedores ?? [])
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  /** Baixa: muda o status do LANÇAMENTO. Não existe título separado para pagar. */
  async function baixar(t: Titulo, pago: boolean) {
    setErro('')
    const res = await fetch(`/api/financeiro/lancamentos/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: pago ? 'PAGO' : 'PENDENTE' }),
    })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    setErro(d.error ?? 'Não foi possível atualizar o título.')
  }

  const inp = 'bp-field'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contas a Pagar"
        sub={`Lançamentos de despesa pela data de vencimento · ${todos ? 'todos os períodos' : formatMesRef(periodo)}`}
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
          note="Pendentes com vencimento passado" />
        <StatTile label="A vencer" figura={figuraMoeda(resumo.aVencer)}
          note="Pendentes ainda no prazo" />
        <StatTile label="Pagas" figura={figuraMoeda(resumo.pagas)}
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
          <select value={categoriaId} className={inp} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={fornecedorId} className={inp} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}
          </select>
        </div>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Descrição</Th>
              <Th>Fornecedor</Th>
              <Th>Categoria</Th>
              <Th>Lançamento</Th>
              <Th>Vencimento</Th>
              <Th align="center">Situação</Th>
              <Th align="right">Valor</Th>
              <Th align="right">Ações</Th>
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={8}>Carregando…</EmptyRow>
            ) : titulos.length === 0 ? (
              <EmptyRow colSpan={8}>
                Nenhuma despesa com esses filtros. Despesas são lançadas em{' '}
                <Link href="/dashboard/financeiro/lancamentos" className="text-accent-soft hover:underline">
                  Lançamentos
                </Link>.
              </EmptyRow>
            ) : titulos.map((t) => {
              const s = SITUACAO[t.situacao]
              return (
                <Row key={t.id}>
                  <Td className="pl-5">
                    <span className="block t-body font-medium text-fg">{t.descricao}</span>
                    {t.parcela && t.totalParcelas && (
                      <span className="block t-label text-subtle mt-0.5">
                        parcela {t.parcela}/{t.totalParcelas}
                      </span>
                    )}
                  </Td>
                  <Td className="t-sm text-muted">{t.fornecedor?.razaoSocial ?? '—'}</Td>
                  <Td><Badge>{t.categoria.nome}</Badge></Td>
                  <Td className="text-subtle t-num">{formatDate(t.data)}</Td>
                  <Td className="t-num">
                    <span className="block text-fg">{formatDate(t.dataVencimento)}</span>
                    <span className={`block t-label ${t.situacao === 'VENCIDA' ? 'text-neg' : 'text-subtle'}`}>
                      {prazo(t.diasParaVencer)}
                    </span>
                  </Td>
                  <Td align="center"><Badge tone={s.tone}>{s.label}</Badge></Td>
                  <Td align="right" numeric className="text-fg font-medium">
                    {figuraMoeda(t.valor).completo}
                  </Td>
                  <Td align="right">
                    <span className="inline-flex gap-2">
                      {podeGerenciar && t.status !== 'CANCELADO' && (
                        <Button size="sm" variant={t.status === 'PAGO' ? 'subtle' : 'primary'}
                          onClick={() => baixar(t, t.status !== 'PAGO')}>
                          {t.status === 'PAGO' ? 'Reabrir' : 'Dar baixa'}
                        </Button>
                      )}
                      <Link href="/dashboard/financeiro/lancamentos">
                        <Button size="sm">Ver lançamento</Button>
                      </Link>
                    </span>
                  </Td>
                </Row>
              )
            })}
          </tbody>
        </Table>
      </TableShell>

      <p className="t-label text-subtle">
        Esta tela lê os mesmos lançamentos de despesa da tela de Lançamentos — não existe uma
        segunda base de despesas. O que muda aqui é a data de referência: vencimento, não lançamento.
      </p>
    </div>
  )
}
