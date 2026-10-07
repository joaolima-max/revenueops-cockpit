'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { moedaCheia } from '@/lib/format-financeiro'
import { formatDate } from '@/lib/utils'
// DO MÓDULO PURO: `lib/previsao` importa Prisma, e isso não pode entrar no
// bundle do navegador. Ver o cabeçalho de `lib/previsao-calculo.ts`.
import {
  STATUS_PREVISAO, STATUS_PREVISAO_LABEL, RECORRENCIAS, RECORRENCIA_LABEL,
  type StatusPrevisao, type Recorrencia,
} from '@/lib/previsao-calculo'

/**
 * DESPESAS FUTURAS — a saída que ainda não foi lançada.
 *
 * ── A DISTINÇÃO QUE A TELA PRECISA DEIXAR CLARA ─────────────────────────
 *
 * Despesa futura NÃO é lançamento pendente:
 *
 *   LANÇAMENTO PENDENTE  já aconteceu. Tem competência, entra na Despesa do
 *                        período e aparece em Contas a Pagar. Falta PAGAR.
 *
 *   DESPESA FUTURA       é EXPECTATIVA. Não toca o resultado contábil, não
 *                        aparece em Contas a Pagar, e serve à projeção de
 *                        caixa. Pode nem vir a acontecer.
 *
 * Quem cadastra aqui precisa saber disso, senão lança a folha de novembro
 * esperando vê-la em Contas a Pagar. O rodapé da tela diz, e o fluxo de
 * materialização ("já virou lançamento") é mostrado na própria linha.
 *
 * ── A RECORRÊNCIA NÃO É MATERIALIZADA ───────────────────────────────────
 *
 * Uma folha "recorrente sem data final" é UMA linha, e a projeção a expande
 * até onde a consulta pergunta. Materializá-la obrigaria a escolher um
 * horizonte na gravação — 12 meses? 60? —, e revisá-lo depois exigiria
 * reescrever linhas gravadas.
 */

interface Entidade { id: string; nome: string }

export interface DespesaLinha {
  id: string
  descricao: string
  valor: number
  dataPrevista: string
  recorrencia: Recorrencia
  recorrenciaFim: string | null
  observacao: string | null
  status: StatusPrevisao
  fornecedor: { id: string; razaoSocial: string } | null
  categoria: { id: string; nome: string } | null
  centroCusto: { id: string; nome: string } | null
  responsavel: { id: string; name: string } | null
  /** Preenchido quando a despesa já virou lançamento. */
  lancamento: { id: string; descricao: string; data: string; valor: number } | null
}

const TOM_STATUS: Record<StatusPrevisao, BadgeTone> = {
  PREVISTO: 'neutral',
  CONFIRMADO: 'accent',
  REALIZADO: 'pos',
  CANCELADO: 'neg',
}

const FORM_VAZIO = {
  descricao: '',
  valor: '',
  dataPrevista: '',
  recorrencia: 'UNICA' as Recorrencia,
  recorrenciaFim: '',
  fornecedorId: '',
  categoriaId: '',
  centroCustoId: '',
  responsavelId: '',
  observacao: '',
  status: 'PREVISTO' as StatusPrevisao,
}

export default function DespesasClient({
  fornecedores, categorias, centrosCusto, usuarios, podeGerenciar,
}: {
  fornecedores: Entidade[]
  categorias: Array<Entidade & { tipo: string }>
  centrosCusto: Entidade[]
  usuarios: Entidade[]
  podeGerenciar: boolean
}) {
  const [linhas, setLinhas] = useState<DespesaLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<{ id?: string } | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroLista, setErroLista] = useState('')

  const buscar = useCallback(async (): Promise<DespesaLinha[]> => {
    const res = await fetch('/api/previsao/despesas-futuras')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Não foi possível carregar as despesas futuras.')
    }
    const d = await res.json()
    return d.despesas as DespesaLinha[]
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
    setForm({ ...FORM_VAZIO, dataPrevista: hojeIso() })
    setErro(''); setModal({})
  }

  function abrirEdicao(l: DespesaLinha) {
    setForm({
      descricao: l.descricao,
      valor: String(l.valor),
      dataPrevista: l.dataPrevista.slice(0, 10),
      recorrencia: l.recorrencia,
      recorrenciaFim: l.recorrenciaFim?.slice(0, 10) ?? '',
      fornecedorId: l.fornecedor?.id ?? '',
      categoriaId: l.categoria?.id ?? '',
      centroCustoId: l.centroCusto?.id ?? '',
      responsavelId: l.responsavel?.id ?? '',
      observacao: l.observacao ?? '',
      status: l.status,
    })
    setErro(''); setModal({ id: l.id })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSalvando(true); setErro('')

    const corpo = {
      descricao: form.descricao,
      valor: Number(form.valor),
      dataPrevista: form.dataPrevista,
      recorrencia: form.recorrencia,
      // O fim só viaja em RECORRENTE: o servidor recusa o campo nos outros
      // tipos, e mandá-lo em branco é diferente de mandá-lo nulo.
      recorrenciaFim: form.recorrencia === 'RECORRENTE' && form.recorrenciaFim
        ? form.recorrenciaFim
        : null,
      fornecedorId: form.fornecedorId || null,
      categoriaId: form.categoriaId || null,
      centroCustoId: form.centroCustoId || null,
      responsavelId: form.responsavelId || null,
      observacao: form.observacao || null,
      status: form.status,
    }

    const res = await fetch(
      modal.id
        ? `/api/previsao/despesas-futuras/${modal.id}`
        : '/api/previsao/despesas-futuras',
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
      setErro(d.error ?? 'Não foi possível salvar a despesa futura.')
    }
    setSalvando(false)
  }

  async function excluir(l: DespesaLinha) {
    if (!confirm(
      `Excluir a despesa futura "${l.descricao}"?\n\n`
      + 'Ela sai da projeção de caixa. Para preservar o registro, use o status Cancelado.',
    )) return

    const res = await fetch(`/api/previsao/despesas-futuras/${l.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível excluir.')
  }

  const categoriasDespesa = useMemo(
    () => categorias.filter((c) => c.tipo === 'DESPESA'),
    [categorias],
  )

  const inp = 'bp-field'
  const lbl = 'bp-field-label'
  const materializada = !!linhas.find((l) => l.id === modal?.id)?.lancamento

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="t-sm text-muted max-w-2xl">
          A saída que ainda <span className="text-fg">não foi lançada</span>. Não aparece
          em Contas a Pagar e não toca o resultado contábil — ela alimenta a projeção de
          caixa.
        </p>
        {podeGerenciar && (
          <Button variant="primary" onClick={abrirNovo}>Nova despesa futura</Button>
        )}
      </div>

      {erroLista && <Alert tone="error">{erroLista}</Alert>}

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Descrição</Th>
              <Th>Fornecedor</Th>
              <Th>Centro de custo</Th>
              <Th>Data prevista</Th>
              <Th>Recorrência</Th>
              <Th align="right">Valor</Th>
              <Th>Status</Th>
              {podeGerenciar && <Th align="right">Ações</Th>}
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={podeGerenciar ? 8 : 7}>Carregando…</EmptyRow>
            ) : linhas.length === 0 ? (
              <EmptyRow colSpan={podeGerenciar ? 8 : 7}>
                Nenhuma despesa futura registrada. Sem elas, a projeção de caixa só conhece
                o que já foi lançado.
              </EmptyRow>
            ) : linhas.map((l) => (
              <Row key={l.id}>
                <Td className="pl-5">
                  <span className="block t-body font-medium text-fg bp-truncate"
                    title={l.descricao}>{l.descricao}</span>
                  {/* A MATERIALIZAÇÃO É VISÍVEL NA LINHA: sem isto, uma despesa
                      já lançada pareceria continuar pendente, e alguém a
                      lançaria de novo. */}
                  {l.lancamento && (
                    <span className="t-label text-pos">
                      Já lançada em{' '}
                      <Link href="/dashboard/financeiro/cp-cr/lancamentos"
                        className="underline">Lançamentos</Link>
                      {' '}· {formatDate(l.lancamento.data)} · {moedaCheia(l.lancamento.valor)}
                    </span>
                  )}
                </Td>
                <Td className="text-muted">
                  {l.fornecedor?.razaoSocial ?? <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-muted">
                  {l.centroCusto?.nome ?? <span className="text-subtle">—</span>}
                </Td>
                <Td className="t-num whitespace-nowrap">{formatDate(l.dataPrevista)}</Td>
                <Td>
                  <Badge tone="neutral">{RECORRENCIA_LABEL[l.recorrencia]}</Badge>
                  {l.recorrencia === 'RECORRENTE' && (
                    <span className="t-label text-subtle block mt-0.5">
                      {l.recorrenciaFim
                        ? `até ${formatDate(l.recorrenciaFim)}`
                        : 'sem prazo definido'}
                    </span>
                  )}
                </Td>
                <Td align="right" numeric className="font-medium">{moedaCheia(l.valor)}</Td>
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
          Despesa futura <span className="text-fg">não é</span> lançamento pendente. O
          lançamento pendente já aconteceu — tem competência, entra na Despesa do período
          e aparece em Contas a Pagar, faltando apenas pagar. A despesa futura é
          expectativa: quando ela ocorre, é lançada em{' '}
          <Link href="/dashboard/financeiro/cp-cr/lancamentos" className="text-accent-soft">
            Lançamentos
          </Link>{' '}
          e só então sai da projeção — manter as duas somaria a mesma saída duas vezes.
        </p>
      </Panel>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal.id ? 'Editar despesa futura' : 'Nova despesa futura'}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg"
                aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              {materializada && (
                <Alert tone="info">
                  Esta despesa já foi lançada. O valor previsto não muda depois do fato —
                  isso criaria um desvio fictício. Ajuste o valor no lançamento, em
                  Financeiro › Lançamentos.
                </Alert>
              )}

              <div>
                <label className={lbl} htmlFor="df-desc">Descrição *</label>
                <input id="df-desc" required maxLength={200} value={form.descricao}
                  className={inp} placeholder="Ex.: Folha de pagamento"
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="df-valor">Valor *</label>
                  <input id="df-valor" type="number" step="0.01" min="0.01" required
                    disabled={materializada}
                    value={form.valor} className={inp} placeholder="0,00"
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="df-data">Data prevista *</label>
                  <input id="df-data" type="date" required value={form.dataPrevista}
                    className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, dataPrevista: e.target.value }))} />
                  <p className="t-label text-subtle/70 mt-1">
                    O dia em que o dinheiro deve sair.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="df-rec">Recorrência *</label>
                  <select id="df-rec" value={form.recorrencia} className={inp}
                    onChange={(e) => setForm((p) => ({
                      ...p,
                      recorrencia: e.target.value as Recorrencia,
                      // Trocar para não-recorrente limpa o fim: o servidor
                      // recusa o campo fora de RECORRENTE.
                      recorrenciaFim: e.target.value === 'RECORRENTE' ? p.recorrenciaFim : '',
                    }))}>
                    {RECORRENCIAS.map((r) => (
                      <option key={r} value={r}>{RECORRENCIA_LABEL[r]}</option>
                    ))}
                  </select>
                </div>
                {form.recorrencia === 'RECORRENTE' && (
                  <div>
                    <label className={lbl} htmlFor="df-fim">Fim da recorrência</label>
                    <input id="df-fim" type="date" value={form.recorrenciaFim}
                      className={inp}
                      onChange={(e) => setForm((p) => ({ ...p, recorrenciaFim: e.target.value }))} />
                    <p className="t-label text-subtle/70 mt-1">
                      Em branco = sem prazo definido.
                    </p>
                  </div>
                )}
              </div>

              {form.recorrencia === 'PARCELADA' && (
                <Alert tone="info">
                  Uma despesa parcelada é UMA parcela por linha, como em Lançamentos.
                  Cadastre uma despesa futura por vencimento — expandir a parcela aqui e
                  materializá-la no lançamento contaria a mesma parcela duas vezes.
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="df-forn">Fornecedor</label>
                  <select id="df-forn" value={form.fornecedorId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, fornecedorId: e.target.value }))}>
                    <option value="">Sem fornecedor</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="df-cat">Categoria</label>
                  <select id="df-cat" value={form.categoriaId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, categoriaId: e.target.value }))}>
                    <option value="">Sem categoria</option>
                    {categoriasDespesa.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="df-cc">Centro de custo</label>
                  <select id="df-cc" value={form.centroCustoId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, centroCustoId: e.target.value }))}>
                    <option value="">Sem centro de custo</option>
                    {centrosCusto.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="df-resp">Responsável</label>
                  <select id="df-resp" value={form.responsavelId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, responsavelId: e.target.value }))}>
                    <option value="">Sem responsável</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="df-status">Status *</label>
                <select id="df-status" value={form.status} className={inp}
                  onChange={(e) => setForm((p) => ({
                    ...p, status: e.target.value as StatusPrevisao,
                  }))}>
                  {STATUS_PREVISAO.map((s) => (
                    <option key={s} value={s}>{STATUS_PREVISAO_LABEL[s]}</option>
                  ))}
                </select>
                <p className="t-label text-subtle/70 mt-1">
                  Cancelado e Realizado saem da projeção de caixa.
                </p>
              </div>

              <div>
                <label className={lbl} htmlFor="df-obs">Observação</label>
                <textarea id="df-obs" rows={2} maxLength={1000} value={form.observacao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} />
              </div>

              {erro && <Alert tone="error">{erro}</Alert>}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary"
                  disabled={salvando || !form.descricao.trim() || !form.valor || !form.dataPrevista}>
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

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10)
}
