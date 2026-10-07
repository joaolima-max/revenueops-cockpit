'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { moedaCheia } from '@/lib/format-financeiro'
import { formatMesRef } from '@/lib/utils'
// DO MÓDULO PURO: `lib/previsao` importa Prisma, e isso não pode entrar no
// bundle do navegador. Ver o cabeçalho de `lib/previsao-calculo.ts`.
import {
  STATUS_PREVISAO, STATUS_PREVISAO_LABEL, type StatusPrevisao,
} from '@/lib/previsao-calculo'

/**
 * RECEITAS PREVISTAS — a previsão de faturamento.
 *
 * ── NÃO HÁ CAMPO DE REALIZADO NESTE FORMULÁRIO ──────────────────────────
 *
 * E a ausência é deliberada. O realizado de um período é apurado dos
 * LANÇAMENTOS de receita, e aparece no topo da página (previsto × realizado) e
 * nos gráficos. Um campo editável aqui criaria uma segunda versão do
 * faturamento, divergente da primeira no primeiro ajuste de lançamento.
 *
 * ── PARCEIRO OU CLIENTE, NUNCA OS DOIS ─────────────────────────────────
 *
 * O seletor é um só, e a escolha de um limpa o outro. A mesma regra que
 * `ContaReceber` tem no banco: os dois juntos seriam duas atribuições para a
 * mesma receita, e a previsão por parceiro somaria o mesmo valor que a
 * previsão por cliente.
 */

interface Entidade { id: string; nome: string }

export interface ReceitaLinha {
  id: string
  descricao: string
  periodo: string
  valorPrevisto: number
  observacao: string | null
  status: StatusPrevisao
  categoria: { id: string; nome: string } | null
  condicao: { id: string; nomeFantasia: string; tipo: string } | null
  cliente: { id: string; nome: string } | null
  centroCusto: { id: string; nome: string } | null
}

const TOM_STATUS: Record<StatusPrevisao, BadgeTone> = {
  PREVISTO: 'neutral',
  CONFIRMADO: 'accent',
  REALIZADO: 'pos',
  CANCELADO: 'neg',
}

const FORM_VAZIO = {
  descricao: '',
  periodo: '',
  valorPrevisto: '',
  categoriaId: '',
  /** `condicao:<id>` ou `cliente:<id>`. UM seletor para os dois vínculos. */
  vinculo: '',
  centroCustoId: '',
  observacao: '',
  status: 'PREVISTO' as StatusPrevisao,
}

function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function ReceitasClient({
  categorias, parceiros, clientes, centrosCusto, periodoInicial, podeGerenciar,
}: {
  categorias: Array<Entidade & { tipo: string }>
  parceiros: Entidade[]
  clientes: Entidade[]
  centrosCusto: Entidade[]
  periodoInicial: string
  podeGerenciar: boolean
}) {
  const [linhas, setLinhas] = useState<ReceitaLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<{ id?: string } | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroLista, setErroLista] = useState('')

  const buscar = useCallback(async (): Promise<ReceitaLinha[]> => {
    const res = await fetch('/api/previsao/receitas-previstas')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Não foi possível carregar as previsões.')
    }
    const d = await res.json()
    return d.receitas as ReceitaLinha[]
  }, [])

  const carregar = useCallback(async () => {
    try {
      setLinhas(await buscar()); setErroLista('')
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : 'Falha ao carregar.')
    }
    setCarregando(false)
  }, [buscar])

  useEffect(() => {
    let vivo = true
    buscar()
      .then((l) => { if (vivo) { setLinhas(l); setErroLista('') } })
      .catch((e: unknown) => {
        if (vivo) setErroLista(e instanceof Error ? e.message : 'Falha ao carregar.')
      })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [buscar])

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, periodo: periodoInicial || mesCorrente() })
    setErro(''); setModal({})
  }

  function abrirEdicao(l: ReceitaLinha) {
    setForm({
      descricao: l.descricao,
      periodo: l.periodo,
      valorPrevisto: String(l.valorPrevisto),
      categoriaId: l.categoria?.id ?? '',
      vinculo: l.condicao
        ? `condicao:${l.condicao.id}`
        : l.cliente ? `cliente:${l.cliente.id}` : '',
      centroCustoId: l.centroCusto?.id ?? '',
      observacao: l.observacao ?? '',
      status: l.status,
    })
    setErro(''); setModal({ id: l.id })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSalvando(true); setErro('')

    // O seletor único é desdobrado nos dois campos aqui — e o outro vai como
    // `null` EXPLÍCITO, não ausente: na edição, omitir o campo deixaria o
    // vínculo antigo gravado, e a linha acabaria com parceiro E cliente.
    const [tipoVinculo, idVinculo] = form.vinculo.split(':')
    const corpo = {
      descricao: form.descricao,
      periodo: form.periodo,
      valorPrevisto: Number(form.valorPrevisto),
      categoriaId: form.categoriaId || null,
      condicaoId: tipoVinculo === 'condicao' ? idVinculo : null,
      clienteId: tipoVinculo === 'cliente' ? idVinculo : null,
      centroCustoId: form.centroCustoId || null,
      observacao: form.observacao || null,
      status: form.status,
    }

    const res = await fetch(
      modal.id
        ? `/api/previsao/receitas-previstas/${modal.id}`
        : '/api/previsao/receitas-previstas',
      {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      },
    )

    if (res.ok) {
      setModal(null); carregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar a previsão.')
    }
    setSalvando(false)
  }

  async function excluir(l: ReceitaLinha) {
    if (!confirm(
      `Excluir a previsão "${l.descricao}" de ${formatMesRef(l.periodo)}?\n\n`
      + 'O previsto do período diminui e o desvio muda. Para preservar o registro '
      + 'de que a previsão existiu, use o status Cancelado.',
    )) return

    const res = await fetch(`/api/previsao/receitas-previstas/${l.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível excluir.')
  }

  const categoriasReceita = useMemo(
    () => categorias.filter((c) => c.tipo === 'RECEITA'),
    [categorias],
  )

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="t-sm text-muted max-w-2xl">
          A previsão de faturamento de cada mês. O <span className="text-fg">realizado</span>{' '}
          não é digitado aqui — ele é apurado dos lançamentos de receita, e aparece na
          comparação acima.
        </p>
        {podeGerenciar && (
          <Button variant="primary" onClick={abrirNovo}>Nova receita prevista</Button>
        )}
      </div>

      {erroLista && <Alert tone="error">{erroLista}</Alert>}

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Descrição</Th>
              <Th>Período</Th>
              <Th>Vínculo</Th>
              <Th>Categoria</Th>
              <Th>Centro de custo</Th>
              <Th align="right">Previsto</Th>
              <Th>Status</Th>
              {podeGerenciar && <Th align="right">Ações</Th>}
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={podeGerenciar ? 8 : 7}>Carregando…</EmptyRow>
            ) : linhas.length === 0 ? (
              <EmptyRow colSpan={podeGerenciar ? 8 : 7}>
                Nenhuma receita prevista. Sem previsão, não há o que comparar com o faturamento.
              </EmptyRow>
            ) : linhas.map((l) => (
              <Row key={l.id}>
                <Td className="pl-5">
                  <span className="block t-body font-medium text-fg bp-truncate"
                    title={l.descricao}>{l.descricao}</span>
                  {l.observacao && (
                    <span className="t-label text-subtle bp-truncate" title={l.observacao}>
                      {l.observacao}
                    </span>
                  )}
                </Td>
                <Td className="t-num whitespace-nowrap">{formatMesRef(l.periodo)}</Td>
                <Td className="text-muted">
                  {l.condicao
                    ? <Badge tone="neutral" truncar title={l.condicao.nomeFantasia}>
                        {l.condicao.nomeFantasia}
                      </Badge>
                    : l.cliente
                      ? <Badge tone="neutral" truncar title={l.cliente.nome}>
                          {l.cliente.nome}
                        </Badge>
                      : <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-muted">
                  {l.categoria?.nome ?? <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-muted">
                  {l.centroCusto?.nome ?? <span className="text-subtle">—</span>}
                </Td>
                <Td align="right" numeric className="font-medium">
                  {moedaCheia(l.valorPrevisto)}
                </Td>
                <Td><Badge tone={TOM_STATUS[l.status]}>{STATUS_PREVISAO_LABEL[l.status]}</Badge></Td>
                {podeGerenciar && (
                  <Td align="right">
                    <span className="inline-flex gap-2">
                      <Button size="sm" onClick={() => abrirEdicao(l)}>Editar</Button>
                      <Button size="sm" variant="danger" onClick={() => excluir(l)}>
                        Excluir
                      </Button>
                    </span>
                  </Td>
                )}
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      <Panel>
        <p className="t-sm text-subtle">
          Vários registros por período são válidos e somam: a previsão de novembro pode
          ser composta de uma linha por parceiro ou por cliente. Diferente do orçamento,
          que tem um teto único por recorte, aqui a previsão é{' '}
          <span className="text-fg">aberta</span> — e por isso não há limite de linhas
          por mês.
        </p>
      </Panel>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal.id ? 'Editar receita prevista' : 'Nova receita prevista'}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg"
                aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              <div>
                <label className={lbl} htmlFor="rp-desc">Descrição *</label>
                <input id="rp-desc" required maxLength={200} value={form.descricao}
                  className={inp} placeholder="Ex.: Faturamento transacional previsto"
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="rp-periodo">Período *</label>
                  <input id="rp-periodo" type="month" required value={form.periodo}
                    className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, periodo: e.target.value }))} />
                  <p className="t-label text-subtle/70 mt-1">
                    Receita se prevê por mês, não por dia.
                  </p>
                </div>
                <div>
                  <label className={lbl} htmlFor="rp-valor">Valor previsto *</label>
                  <input id="rp-valor" type="number" step="0.01" min="0.01" required
                    value={form.valorPrevisto} className={inp} placeholder="0,00"
                    onChange={(e) => setForm((p) => ({ ...p, valorPrevisto: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="rp-vinc">Cliente, BaaS ou White Label</label>
                <select id="rp-vinc" value={form.vinculo} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, vinculo: e.target.value }))}>
                  <option value="">Sem vínculo</option>
                  {parceiros.length > 0 && (
                    <optgroup label="BaaS / White Label">
                      {parceiros.map((p) => (
                        <option key={p.id} value={`condicao:${p.id}`}>{p.nome}</option>
                      ))}
                    </optgroup>
                  )}
                  {clientes.length > 0 && (
                    <optgroup label="Clientes">
                      {clientes.map((c) => (
                        <option key={c.id} value={`cliente:${c.id}`}>{c.nome}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {/* UM seletor para os dois vínculos, e não dois campos: a regra
                    é "um OU o outro", e dois campos convidariam a preencher os
                    dois — que o servidor recusa. */}
                <p className="t-label text-subtle/70 mt-1">
                  Um ou o outro: a mesma receita prevista não pertence a dois devedores.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="rp-cat">Categoria</label>
                  <select id="rp-cat" value={form.categoriaId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, categoriaId: e.target.value }))}>
                    <option value="">Sem categoria</option>
                    {categoriasReceita.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="rp-cc">Centro de custo</label>
                  <select id="rp-cc" value={form.centroCustoId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, centroCustoId: e.target.value }))}>
                    <option value="">Sem centro de custo</option>
                    {centrosCusto.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="rp-status">Status *</label>
                <select id="rp-status" value={form.status} className={inp}
                  onChange={(e) => setForm((p) => ({
                    ...p, status: e.target.value as StatusPrevisao,
                  }))}>
                  {STATUS_PREVISAO.map((s) => (
                    <option key={s} value={s}>{STATUS_PREVISAO_LABEL[s]}</option>
                  ))}
                </select>
                <p className="t-label text-subtle/70 mt-1">
                  Cancelado sai da comparação e da projeção de caixa.
                </p>
              </div>

              <div>
                <label className={lbl} htmlFor="rp-obs">Observação</label>
                <textarea id="rp-obs" rows={2} maxLength={1000} value={form.observacao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} />
              </div>

              {erro && <Alert tone="error">{erro}</Alert>}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary"
                  disabled={salvando || !form.descricao.trim() || !form.valorPrevisto || !form.periodo}>
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
