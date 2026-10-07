'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { moedaCheia, percentual } from '@/lib/format-financeiro'
import { formatMesRef } from '@/lib/utils'
// DO MÓDULO PURO, nunca de `lib/previsao`: ele importa Prisma, e um Client
// Component que o importasse arrastaria o driver do Postgres para o bundle do
// navegador — o build falha com "Can't resolve 'fs'", e `tsc` não pega.
import {
  STATUS_ORCAMENTO, STATUS_ORCAMENTO_LABEL, execucao, LIMIAR_ATENCAO,
  type StatusOrcamentoValor,
} from '@/lib/previsao-calculo'

/**
 * ORÇAMENTO — lançar, editar e excluir o teto de um período.
 *
 * ── ORÇAMENTO NÃO É PREVISÃO ────────────────────────────────────────────
 *
 * A distinção governa esta tela:
 *
 *   ORÇAMENTO   é DECISÃO. Alguém aprovou que a área pode gastar até X.
 *               Tem status de aprovação, responsável e um teto que se estoura.
 *
 *   PREVISÃO    é EXPECTATIVA. Acha-se que vai entrar Y, ou sair Z.
 *               Não se "estoura" uma previsão; ela simplesmente erra.
 *
 * Por isso o orçamento tem RASCUNHO → APROVADO → ENCERRADO, e a previsão tem
 * PREVISTO → CONFIRMADO → REALIZADO. Juntar os dois numa tabela só obrigaria a
 * decidir o que significa "aprovar uma expectativa".
 *
 * ── O REALIZADO NÃO É DIGITADO ──────────────────────────────────────────
 *
 * A coluna "Realizado" vem dos LANÇAMENTOS do período, apurada no servidor. Um
 * campo editável ali criaria uma segunda versão do gasto, divergente da
 * primeira no instante seguinte.
 */

interface Entidade { id: string; nome: string; codigo?: string | null }

export interface OrcamentoLinha {
  id: string
  periodo: string
  tipo: 'RECEITA' | 'DESPESA'
  valor: number
  observacao: string | null
  status: StatusOrcamentoValor
  centroCusto: { id: string; nome: string; codigo: string | null } | null
  categoria: { id: string; nome: string; tipo: string } | null
  responsavel: { id: string; name: string } | null
}

/** O realizado de cada recorte, apurado no servidor. */
export interface RealizadoPorRecorte {
  /** `${tipo}:${centroCustoId ?? '—'}:${categoriaId ?? '—'}` → valor. */
  [chave: string]: number
}

const TOM_STATUS: Record<StatusOrcamentoValor, BadgeTone> = {
  RASCUNHO: 'neutral',
  APROVADO: 'accent',
  ENCERRADO: 'pos',
}

const FORM_VAZIO = {
  periodo: '',
  tipo: 'DESPESA' as 'RECEITA' | 'DESPESA',
  valor: '',
  centroCustoId: '',
  categoriaId: '',
  responsavelId: '',
  observacao: '',
  status: 'RASCUNHO' as StatusOrcamentoValor,
}

function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function OrcamentoClient({
  centrosCusto, categorias, usuarios, realizado, periodoInicial, podeGerenciar,
}: {
  centrosCusto: Entidade[]
  categorias: Array<Entidade & { tipo: string }>
  usuarios: Entidade[]
  realizado: RealizadoPorRecorte
  periodoInicial: string
  podeGerenciar: boolean
}) {
  const [linhas, setLinhas] = useState<OrcamentoLinha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<{ id?: string } | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroLista, setErroLista] = useState('')

  const buscar = useCallback(async (): Promise<OrcamentoLinha[]> => {
    const res = await fetch('/api/previsao/orcamentos')
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? 'Não foi possível carregar os orçamentos.')
    }
    const d = await res.json()
    return d.orcamentos as OrcamentoLinha[]
  }, [])

  const carregar = useCallback(async () => {
    try {
      setLinhas(await buscar())
      setErroLista('')
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

  /** O realizado de uma linha, pela MESMA chave que o servidor montou. */
  const realizadoDe = useCallback((l: OrcamentoLinha) => {
    const k = `${l.tipo}:${l.centroCusto?.id ?? '—'}:${l.categoria?.id ?? '—'}`
    return realizado[k] ?? 0
  }, [realizado])

  function abrirNovo() {
    setForm({ ...FORM_VAZIO, periodo: periodoInicial || mesCorrente() })
    setErro('')
    setModal({})
  }

  function abrirEdicao(l: OrcamentoLinha) {
    setForm({
      periodo: l.periodo,
      tipo: l.tipo,
      valor: String(l.valor),
      centroCustoId: l.centroCusto?.id ?? '',
      categoriaId: l.categoria?.id ?? '',
      responsavelId: l.responsavel?.id ?? '',
      observacao: l.observacao ?? '',
      status: l.status,
    })
    setErro('')
    setModal({ id: l.id })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSalvando(true); setErro('')

    /**
     * NA EDIÇÃO, O RECORTE NÃO VIAJA.
     *
     * Período, tipo, centro de custo e categoria são imutáveis (ver a rota
     * PUT): mudá-los não é editar este orçamento, é mover o teto de um recorte
     * para outro. Mandá-los no corpo e deixar o servidor ignorá-los seria pior
     * — a tela pareceria ter aceitado a mudança.
     */
    const corpo = modal.id
      ? {
          valor: Number(form.valor),
          responsavelId: form.responsavelId || null,
          observacao: form.observacao || null,
          status: form.status,
        }
      : {
          periodo: form.periodo,
          tipo: form.tipo,
          valor: Number(form.valor),
          centroCustoId: form.centroCustoId || null,
          categoriaId: form.categoriaId || null,
          responsavelId: form.responsavelId || null,
          observacao: form.observacao || null,
          status: form.status,
        }

    const res = await fetch(
      modal.id ? `/api/previsao/orcamentos/${modal.id}` : '/api/previsao/orcamentos',
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
      setErro(d.error ?? 'Não foi possível salvar o orçamento.')
    }
    setSalvando(false)
  }

  async function excluir(l: OrcamentoLinha) {
    if (!confirm(
      `Excluir o orçamento de ${formatMesRef(l.periodo)}`
      + `${l.centroCusto ? ` · ${l.centroCusto.nome}` : ''}?\n\n`
      + 'O teto desaparece e o recorte passa a aparecer como "sem orçamento". '
      + 'O realizado não é afetado — ele vem dos lançamentos.',
    )) return

    const res = await fetch(`/api/previsao/orcamentos/${l.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível excluir.')
  }

  /** As categorias oferecidas respeitam o tipo do orçamento. */
  const categoriasDoTipo = useMemo(
    () => categorias.filter((c) => c.tipo === form.tipo),
    [categorias, form.tipo],
  )

  const inp = 'bp-field'
  const lbl = 'bp-field-label'
  const editando = !!modal?.id

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="t-sm text-muted max-w-2xl">
          O orçamento é o teto <span className="text-fg">aprovado</span> de um período,
          por centro de custo e categoria. Só orçamento aprovado ou encerrado entra nos
          indicadores — rascunho é orçamento sendo montado.
        </p>
        {podeGerenciar && (
          <Button variant="primary" onClick={abrirNovo}>Novo orçamento</Button>
        )}
      </div>

      {erroLista && <Alert tone="error">{erroLista}</Alert>}

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Período</Th>
              <Th>Tipo</Th>
              <Th>Centro de custo</Th>
              <Th>Categoria</Th>
              <Th align="right">Orçado</Th>
              <Th align="right">Realizado</Th>
              <Th align="right">Saldo</Th>
              <Th align="right">Utilização</Th>
              <Th>Status</Th>
              {podeGerenciar && <Th align="right">Ações</Th>}
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={podeGerenciar ? 10 : 9}>Carregando…</EmptyRow>
            ) : linhas.length === 0 ? (
              <EmptyRow colSpan={podeGerenciar ? 10 : 9}>
                Nenhum orçamento lançado. Sem teto, não há o que comparar com o realizado.
              </EmptyRow>
            ) : linhas.map((l) => {
              const ex = execucao(l.valor, realizadoDe(l))
              return (
                <Row key={l.id}>
                  <Td className="pl-5 t-num whitespace-nowrap">{formatMesRef(l.periodo)}</Td>
                  <Td>
                    <Badge tone="neutral">
                      {l.tipo === 'RECEITA' ? 'Receita' : 'Despesa'}
                    </Badge>
                  </Td>
                  <Td className="text-muted">
                    {l.centroCusto
                      ? <span title={l.centroCusto.nome}>{l.centroCusto.nome}</span>
                      : <span className="text-subtle">—</span>}
                  </Td>
                  <Td className="text-muted">
                    {l.categoria?.nome ?? <span className="text-subtle">—</span>}
                  </Td>
                  <Td align="right" numeric>{moedaCheia(ex.orcado)}</Td>
                  <Td align="right" numeric>{moedaCheia(ex.realizado)}</Td>
                  <Td align="right" numeric
                    className={ex.saldo < 0 ? 'text-neg font-medium' : undefined}>
                    {moedaCheia(ex.saldo)}
                  </Td>
                  <Td align="right" numeric>
                    {ex.utilizacao === null
                      ? <span className="text-subtle">—</span>
                      : (
                        <span className={
                          ex.situacao === 'ESTOURADO' ? 'text-neg font-medium'
                            : ex.situacao === 'ATENCAO' ? 'text-warn font-medium'
                            : undefined
                        }>
                          {percentual(ex.utilizacao, 1)}
                        </span>
                      )}
                  </Td>
                  <Td><Badge tone={TOM_STATUS[l.status]}>{STATUS_ORCAMENTO_LABEL[l.status]}</Badge></Td>
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
              )
            })}
          </tbody>
        </Table>
      </TableShell>

      <Panel>
        <PanelHeader
          title="Como o alerta funciona"
          sub={`A utilização fica amarela a partir de ${Math.round(LIMIAR_ATENCAO * 100)}% do orçado e vermelha quando passa de 100%.`}
        />
        <p className="t-sm text-subtle mt-3">
          {Math.round(LIMIAR_ATENCAO * 100)}% não é um número arbitrário: é o ponto em que
          ainda dá para remanejar. A 95% o mês já está decidido, e a 70% o alerta vira
          ruído — as pessoas param de olhar. Em orçamento de{' '}
          <span className="text-fg">receita</span>, passar do previsto é bom, e por isso
          o alerta de estouro não aparece no painel para esse tipo.
        </p>
      </Panel>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {editando ? 'Editar orçamento' : 'Novo orçamento'}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg"
                aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              {editando && (
                <Alert tone="info">
                  Período, tipo, centro de custo e categoria não mudam: alterá-los moveria
                  o teto de um recorte para outro. Para isso, exclua e crie outro.
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="or-periodo">Período *</label>
                  <input id="or-periodo" type="month" required disabled={editando}
                    value={form.periodo} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, periodo: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="or-tipo">Tipo *</label>
                  <select id="or-tipo" disabled={editando} value={form.tipo} className={inp}
                    onChange={(e) => setForm((p) => ({
                      ...p,
                      tipo: e.target.value as 'RECEITA' | 'DESPESA',
                      // Trocar o tipo invalida a categoria: ela é de um tipo só.
                      categoriaId: '',
                    }))}>
                    <option value="DESPESA">Despesa</option>
                    <option value="RECEITA">Receita</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="or-cc">Centro de custo</label>
                  <select id="or-cc" disabled={editando} value={form.centroCustoId}
                    className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, centroCustoId: e.target.value }))}>
                    <option value="">Sem centro de custo</option>
                    {centrosCusto.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="or-cat">Categoria</label>
                  <select id="or-cat" disabled={editando} value={form.categoriaId}
                    className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, categoriaId: e.target.value }))}>
                    <option value="">Sem categoria</option>
                    {categoriasDoTipo.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="or-valor">Valor orçado *</label>
                  <input id="or-valor" type="number" step="0.01" min="0" required
                    value={form.valor} className={inp} placeholder="0,00"
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="or-status">Status *</label>
                  <select id="or-status" value={form.status} className={inp}
                    onChange={(e) => setForm((p) => ({
                      ...p, status: e.target.value as StatusOrcamentoValor,
                    }))}>
                    {STATUS_ORCAMENTO.map((s) => (
                      <option key={s} value={s}>{STATUS_ORCAMENTO_LABEL[s]}</option>
                    ))}
                  </select>
                  <p className="t-label text-subtle/70 mt-1">
                    Rascunho não entra nos indicadores.
                  </p>
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="or-resp">Responsável</label>
                <select id="or-resp" value={form.responsavelId} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, responsavelId: e.target.value }))}>
                  <option value="">Sem responsável</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="or-obs">Observação</label>
                <textarea id="or-obs" rows={2} maxLength={1000} value={form.observacao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} />
              </div>

              {erro && <Alert tone="error">{erro}</Alert>}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary"
                  disabled={salvando || !form.valor || !form.periodo}>
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
