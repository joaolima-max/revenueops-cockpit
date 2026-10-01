'use client'

import { useState, useEffect, useMemo } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import HairlineGrid, { HairlineCell } from '@/components/ui/HairlineGrid'
import {
  TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow,
} from '@/components/ui/DataTable'
import Figure from '@/components/ui/Figure'
import { figuraMoeda, moedaCheia, quantidadeCompacta } from '@/lib/format-financeiro'
import { calcular, rotuloPeriodo, type ProdutoTarifado } from '@/lib/lancamento-baas'

/**
 * LANÇAMENTO BAAS — ambiente OPERACIONAL de lançamento, não dashboard.
 *
 * O colaborador escolhe o parceiro, informa o período, o saldo e os volumes.
 * PREÇO, CONTA E OVERPRICE VÊM DO CADASTRO: as tarifas não são redigitadas,
 * porque redigitá-las é como elas passam a divergir de Condições BaaS.
 *
 * A CASCATA aparece inteira na tela — saldo, tarifas, saldo após tarifas,
 * percentual, overprice e valor devido ao cliente. É o número que o parceiro
 * vai conferir, e cada etapa precisa estar visível para a conferência ser
 * possível sem recalcular à mão.
 */

interface Produto { id: string; nome: string; preco: number }

interface Parceiro {
  id: string
  nomeFantasia: string
  identificacao: string
  tipo: 'BAAS' | 'WHITE_LABEL'
  overpricePercent: number | null
  produtos: Produto[]
}

interface Item {
  id: string; nome: string; preco: number; volume: number; total: number; ordem: number
}

interface Lancamento {
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
  status: 'RASCUNHO' | 'LANCADO' | 'FECHADO'
  observacao: string | null
  lancamentoId: string | null
  contaReceberId: string | null
  contaPagarId: string | null
  condicao: { id: string; nomeFantasia: string; identificacao: string; tipo: string }
  itens: Item[]
  criadoPor: { id: string; name: string }
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', LANCADO: 'Lançado', FECHADO: 'Fechado',
}
const STATUS_TONE: Record<string, BadgeTone> = {
  RASCUNHO: 'neutral', LANCADO: 'accent', FECHADO: 'pos',
}
const TIPO_LABEL: Record<string, string> = { BAAS: 'BaaS', WHITE_LABEL: 'White Label' }

const FORM_VAZIO = {
  condicaoId: '', numeroConta: '', periodoInicio: '', periodoFim: '',
  saldoInicial: '', observacao: '',
}

export default function LancamentoBaasClient() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [podeGerenciar, setPodeGerenciar] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)

  const [modal, setModal] = useState<'novo' | Lancamento | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  /** Volume por produto, por NOME: o nome é o que sobrevive ao snapshot. */
  const [volumes, setVolumes] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    let vivo = true
    fetch('/api/lancamento-baas')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setLancamentos(d.lancamentos)
        setParceiros(d.parceiros)
        setPodeGerenciar(d.podeGerenciar)
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [versao])

  const parceiro = useMemo(
    () => parceiros.find((p) => p.id === form.condicaoId) ?? null,
    [parceiros, form.condicaoId],
  )

  /**
   * A cascata, calculada no NAVEGADOR com a MESMA função do servidor.
   *
   * O resultado que grava é o do servidor — mas o colaborador precisa ver o
   * total mudar enquanto digita o volume, e duplicar a aritmética numa segunda
   * implementação seria garantir que as duas divergissem.
   */
  const previa = useMemo(() => {
    if (!parceiro) return null
    const produtos: ProdutoTarifado[] = parceiro.produtos.map((p) => ({
      produtoId: p.id, nome: p.nome, preco: p.preco,
      volume: Math.max(0, Math.trunc(Number(volumes[p.nome] ?? 0)) || 0),
    }))
    const saldo = Number(form.saldoInicial) || 0
    return calcular(saldo, produtos, parceiro.overpricePercent)
  }, [parceiro, volumes, form.saldoInicial])

  const visiveis = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    if (!t) return lancamentos
    return lancamentos.filter((l) =>
      [l.condicao.nomeFantasia, l.condicao.identificacao, l.numeroConta]
        .some((c) => c.toLowerCase().includes(t)))
  }, [lancamentos, filtro])

  function abrirNovo() {
    setForm(FORM_VAZIO); setVolumes({}); setErro(''); setModal('novo')
  }

  function abrirEdicao(l: Lancamento) {
    setForm({
      condicaoId: l.condicao.id,
      numeroConta: l.numeroConta,
      periodoInicio: l.periodoInicio.slice(0, 10),
      periodoFim: l.periodoFim.slice(0, 10),
      saldoInicial: String(l.saldoInicial),
      observacao: l.observacao ?? '',
    })
    // Os volumes vêm do SNAPSHOT do lançamento, não do cadastro atual.
    setVolumes(Object.fromEntries(l.itens.map((i) => [i.nome, String(i.volume)])))
    setErro(''); setModal(l)
  }

  /** Ao escolher o parceiro, a conta nasce preenchida pela identificação. */
  function escolherParceiro(id: string) {
    const p = parceiros.find((x) => x.id === id)
    setForm((f) => ({ ...f, condicaoId: id, numeroConta: p?.identificacao ?? '' }))
    setVolumes({})
  }

  async function salvar() {
    if (!parceiro) { setErro('Escolha o BaaS ou White Label.'); return }
    setSalvando(true); setErro('')

    const corpo = {
      condicaoId: form.condicaoId,
      numeroConta: form.numeroConta,
      periodoInicio: form.periodoInicio,
      periodoFim: form.periodoFim,
      saldoInicial: Number(form.saldoInicial),
      observacao: form.observacao || null,
      produtos: parceiro.produtos.map((p) => ({
        produtoId: p.id, nome: p.nome, preco: p.preco,
        volume: Math.max(0, Math.trunc(Number(volumes[p.nome] ?? 0)) || 0),
      })),
    }

    const editando = modal !== 'novo' && modal !== null
    const res = await fetch(
      editando ? `/api/lancamento-baas/${(modal as Lancamento).id}` : '/api/lancamento-baas',
      {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      },
    )

    if (res.ok) {
      setModal(null); setVersao((v) => v + 1)
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar o lançamento.')
    }
    setSalvando(false)
  }

  async function lancar(l: Lancamento) {
    if (!confirm(
      `Lançar ${l.condicao.nomeFantasia}?\n\n`
      + `Isto gera o lançamento financeiro da receita (${moedaCheia(l.totalTarifas + l.overpriceValor)}), `
      + `o título a receber e o título a pagar do valor devido ao cliente `
      + `(${moedaCheia(l.valorCliente)}).`,
    )) return

    const res = await fetch(`/api/lancamento-baas/${l.id}`, { method: 'POST' })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível gerar os títulos.')
    }
  }

  async function fechar(l: Lancamento) {
    if (!confirm('Fechar este lançamento? Depois de fechado ele não pode mais ser editado.')) return
    const res = await fetch(`/api/lancamento-baas/${l.id}?acao=fechar`, { method: 'POST' })
    if (res.ok) setVersao((v) => v + 1)
  }

  async function excluir(l: Lancamento) {
    if (!confirm('Excluir este rascunho?')) return
    const res = await fetch(`/api/lancamento-baas/${l.id}`, { method: 'DELETE' })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível excluir.')
    }
  }

  if (carregando) return <p className="t-sm text-subtle">Carregando...</p>

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Lançamento BaaS"
        sub="Volume mensal de BaaS e White Label, tarifado pelas condições vigentes. As tarifas vêm do cadastro — não se redigitam aqui."
        actions={podeGerenciar
          ? <Button variant="primary" onClick={abrirNovo}>Novo lançamento</Button>
          : undefined}
      />

      {parceiros.length === 0 && (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum parceiro ativo cadastrado"
            description="O Lançamento BaaS tarifa o volume a partir das condições vigentes. Cadastre o BaaS ou White Label em Financeiro › Condições BaaS, com os produtos e preços, antes de lançar."
          />
        </Panel>
      )}

      {parceiros.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar parceiro, identificação ou conta…"
            className={`${inp} max-w-sm`}
          />
        </div>
      )}

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th>Parceiro</Th>
              <Th>Conta</Th>
              <Th>Período</Th>
              <Th align="right">Saldo</Th>
              <Th align="right">Tarifas</Th>
              <Th align="right">Overprice</Th>
              <Th align="right">Devido ao cliente</Th>
              <Th>Status</Th>
              <Th align="right">Ações</Th>
            </HeadRow>
          </THead>
          <tbody>
            {visiveis.length === 0 ? (
              <EmptyRow colSpan={9}>
                {lancamentos.length === 0
                  ? 'Nenhum lançamento registrado.'
                  : 'Nenhum lançamento corresponde à busca.'}
              </EmptyRow>
            ) : visiveis.map((l) => (
              <Row key={l.id}>
                <Td>
                  <span className="block t-body font-medium text-fg">{l.condicao.nomeFantasia}</span>
                  <span className="t-label text-subtle">{TIPO_LABEL[l.condicao.tipo] ?? l.condicao.tipo}</span>
                </Td>
                <Td className="text-muted">{l.numeroConta}</Td>
                <Td className="text-muted">
                  {rotuloPeriodo(new Date(l.periodoInicio), new Date(l.periodoFim))}
                </Td>
                <Td align="right" numeric>{moedaCheia(l.saldoInicial)}</Td>
                <Td align="right" numeric>{moedaCheia(l.totalTarifas)}</Td>
                <Td align="right" numeric>
                  {l.overpriceValor > 0 ? moedaCheia(l.overpriceValor) : <span className="text-subtle">—</span>}
                </Td>
                <Td align="right" numeric className="font-medium">{moedaCheia(l.valorCliente)}</Td>
                <Td><Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge></Td>
                <Td align="right">
                  <span className="inline-flex gap-2">
                    {podeGerenciar && l.status !== 'FECHADO' && (
                      <Button size="sm" onClick={() => abrirEdicao(l)}>Editar</Button>
                    )}
                    {podeGerenciar && l.status === 'RASCUNHO' && (
                      <>
                        <Button size="sm" variant="primary" onClick={() => lancar(l)}>Lançar</Button>
                        <Button size="sm" variant="danger" onClick={() => excluir(l)}>Excluir</Button>
                      </>
                    )}
                    {podeGerenciar && l.status === 'LANCADO' && (
                      <Button size="sm" onClick={() => fechar(l)}>Fechar</Button>
                    )}
                  </span>
                </Td>
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {/* ── FORMULÁRIO ────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal === 'novo' ? 'Novo Lançamento BaaS' : `Editar — ${(modal as Lancamento).condicao.nomeFantasia}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {erro && (
                <div className="rounded-lg border border-neg/25 bg-neg/10 px-3 py-2">
                  <p className="t-sm text-neg">{erro}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="lb-parceiro">BaaS / White Label *</label>
                  <select id="lb-parceiro" className={inp} value={form.condicaoId}
                    disabled={modal !== 'novo'}
                    onChange={(e) => escolherParceiro(e.target.value)}>
                    <option value="">Selecione…</option>
                    {parceiros.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nomeFantasia} — {TIPO_LABEL[p.tipo]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="lb-conta">Número da conta *</label>
                  <input id="lb-conta" className={inp} value={form.numeroConta}
                    onChange={(e) => setForm((f) => ({ ...f, numeroConta: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="lb-ini">Período — início *</label>
                  <input id="lb-ini" type="date" className={inp} value={form.periodoInicio}
                    onChange={(e) => setForm((f) => ({ ...f, periodoInicio: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="lb-fim">Período — fim *</label>
                  <input id="lb-fim" type="date" className={inp} value={form.periodoFim}
                    onChange={(e) => setForm((f) => ({ ...f, periodoFim: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl} htmlFor="lb-saldo">Saldo atual da conta *</label>
                  <input id="lb-saldo" type="number" step="0.01" min="0" className={inp}
                    value={form.saldoInicial}
                    onChange={(e) => setForm((f) => ({ ...f, saldoInicial: e.target.value }))} />
                </div>
              </div>

              {/* ── PRODUTOS ────────────────────────────────────────────────
                  Todos os produtos ATIVOS do parceiro, com o preço do
                  cadastro em somente-leitura. Volume é o único campo que o
                  colaborador preenche. */}
              {parceiro && (
                <section className="space-y-3">
                  <PanelHeader
                    title="Produtos tarifados"
                    sub="Preços vêm de Condições BaaS e não são editáveis aqui. Informe o volume do período."
                  />
                  {parceiro.produtos.length === 0 ? (
                    <Panel padded={false}>
                      <EmptyState compact
                        title="Nenhum produto tarifado neste parceiro"
                        description="Cadastre os produtos e preços em Financeiro › Condições BaaS para poder lançar o volume."
                      />
                    </Panel>
                  ) : (
                    <TableShell>
                      <Table>
                        <THead>
                          <HeadRow>
                            <Th>Produto</Th>
                            <Th align="right">Preço</Th>
                            <Th align="right">Volume</Th>
                            <Th align="right">Total</Th>
                          </HeadRow>
                        </THead>
                        <tbody>
                          {parceiro.produtos.map((p) => {
                            const vol = Math.max(0, Math.trunc(Number(volumes[p.nome] ?? 0)) || 0)
                            return (
                              <Row key={p.id}>
                                <Td>{p.nome}</Td>
                                <Td align="right" numeric className="text-subtle">{moedaCheia(p.preco)}</Td>
                                <Td align="right">
                                  <input
                                    type="number" min="0" step="1"
                                    className={`${inp} w-28 text-right`}
                                    value={volumes[p.nome] ?? ''}
                                    placeholder="0"
                                    onChange={(e) => setVolumes((v) => ({ ...v, [p.nome]: e.target.value }))}
                                  />
                                </Td>
                                <Td align="right" numeric>{moedaCheia(p.preco * vol)}</Td>
                              </Row>
                            )
                          })}
                        </tbody>
                      </Table>
                    </TableShell>
                  )}
                </section>
              )}

              {/* ── RESUMO — a cascata inteira, etapa por etapa ───────────── */}
              {previa && parceiro && parceiro.produtos.length > 0 && (
                <section className="space-y-3">
                  <PanelHeader title="Resumo" sub="Cada etapa aparece para que o parceiro possa conferir sem recalcular." />
                  <HairlineGrid cols={4}>
                    <HairlineCell className="gap-2">
                      <p className="t-label text-subtle">Total de tarifas</p>
                      <Figure figura={figuraMoeda(previa.totalTarifas)} size="sm" />
                      <p className="t-label text-subtle/70">
                        {quantidadeCompacta(previa.itens.reduce((a, i) => a + i.volume, 0))} transações
                      </p>
                    </HairlineCell>
                    <HairlineCell className="gap-2">
                      <p className="t-label text-subtle">Saldo após tarifas</p>
                      <Figure figura={figuraMoeda(previa.saldoRemanescente)} size="sm" />
                      <p className="t-label text-subtle/70">Base do overprice</p>
                    </HairlineCell>
                    <HairlineCell className="gap-2">
                      <p className="t-label text-subtle">Overprice</p>
                      <Figure figura={figuraMoeda(previa.overpriceValor)} size="sm" />
                      <p className="t-label text-subtle/70">
                        {previa.overpricePercent === null
                          ? 'Parceiro sem overprice'
                          : `${previa.overpricePercent}% do saldo após tarifas`}
                      </p>
                    </HairlineCell>
                    <HairlineCell className="gap-2">
                      <p className="t-label text-subtle">Devido ao cliente</p>
                      <Figure figura={figuraMoeda(previa.valorCliente)} size="sm" />
                      <p className="t-label text-subtle/70">Valor residual</p>
                    </HairlineCell>
                  </HairlineGrid>

                  {previa.saldoRemanescente < 0 && (
                    <p className="t-sm text-neg">
                      As tarifas somam mais que o saldo informado. Confira o saldo e os volumes —
                      o overprice não é aplicado sobre saldo negativo.
                    </p>
                  )}
                </section>
              )}

              <div>
                <label className={lbl} htmlFor="lb-obs">Observação</label>
                <textarea id="lb-obs" rows={2} className={`${inp} resize-none`}
                  value={form.observacao}
                  onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-1">
                <Button className="flex-1" onClick={() => setModal(null)}>Cancelar</Button>
                <Button variant="primary" className="flex-1" disabled={salvando} onClick={salvar}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
