'use client'

import { useState, useCallback, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import GerenciarProdutos from '@/components/financeiro/GerenciarProdutos'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { figuraMoeda, figuraContagem, figuraPercentual } from '@/lib/format-financeiro'
import { formatDate } from '@/lib/utils'

type TipoParceiro = 'BAAS' | 'WHITE_LABEL'

interface Condicao {
  id: string
  nomeFantasia: string
  identificacao: string
  tipo: TipoParceiro
  /** LEGADO. A tarifa por transação virou produto; o valor fica no histórico. */
  pix: number | null
  kyc: number | null
  _count?: { produtos: number }
  sustentacao: number | null
  apiMensal: number | null
  mensalidadeContaAtiva: number | null
  /** ISO "YYYY-MM-DD". Antes dela a sustentação não entra no MRR. */
  sustentacaoInicio: string | null
  overpricePercent: number | null
  ativo: boolean
  observacao: string | null
}

interface EventoHistorico {
  id: string
  campo: string
  valorAnterior: string | null
  valorNovo: string | null
  createdAt: string
  user: { id: string; name: string }
}

interface Mrr {
  sustentacaoBaas: number
  sustentacaoWhiteLabel: number
  apiMensalParceiros: number
  mensalidadeContaAtiva: number
  apiMensalCarteira: number
  sustentacaoAguardandoInicio: number
  total: number
}

interface Resposta {
  condicoes: Condicao[]
  mrr: Mrr | null
  parceiros: { baasAtivos: number; whiteLabelsAtivos: number }
}

const TIPO_LABEL: Record<TipoParceiro, string> = { BAAS: 'BaaS', WHITE_LABEL: 'White Label' }
const TIPO_TONE: Record<TipoParceiro, BadgeTone> = { BAAS: 'accent', WHITE_LABEL: 'neutral' }

const CAMPO_LABEL: Record<string, string> = {
  pix: 'PIX', kyc: 'KYC', sustentacao: 'Sustentação', apiMensal: 'API mensal',
  mensalidadeContaAtiva: 'Mensalidade de conta ativa',
  sustentacaoInicio: 'Início da sustentação',
  overpricePercent: 'Overprice (%)', tipo: 'Tipo', ativo: 'Ativo',
}

const FORM_VAZIO = {
  nomeFantasia: '', identificacao: '', tipo: 'BAAS' as TipoParceiro,
  pix: '', kyc: '', sustentacao: '', apiMensal: '', mensalidadeContaAtiva: '',
  sustentacaoInicio: '', overpricePercent: '', observacao: '',
}

/** Valor monetário opcional: vazio é "não contratado", não R$ 0,00. */
function moeda(v: number | null): string {
  return v === null ? '—' : figuraMoeda(v).completo
}

/**
 * CONDIÇÕES COMERCIAIS BaaS — os parceiros e suas taxas vigentes.
 *
 * É a fonte de "BaaS ativos", "White Labels ativos" e de duas das quatro
 * parcelas do MRR. Toda alteração de taxa passa pelo histórico: o valor
 * anterior nunca some em silêncio.
 */
export default function CondicoesClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [condicoes, setCondicoes] = useState<Condicao[]>([])
  const [mrr, setMrr] = useState<Mrr | null>(null)
  const [parceiros, setParceiros] = useState({ baasAtivos: 0, whiteLabelsAtivos: 0 })
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const [modal, setModal] = useState<{ id?: string } | null>(null)
  /** Painel de produtos tarifados do parceiro. */
  const [produtosDe, setProdutosDe] = useState<Condicao | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [historico, setHistorico] = useState<{ condicao: Condicao; eventos: EventoHistorico[] } | null>(null)

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (): Promise<Resposta | null> => {
    const p = new URLSearchParams()
    if (incluirInativos) p.set('incluirInativos', '1')
    const res = await fetch(`/api/financeiro/condicoes-baas?${p}`)
    if (!res.ok) return null
    return (await res.json()) as Resposta
  }, [incluirInativos])

  const aplicar = useCallback((d: Resposta | null) => {
    if (d) {
      setCondicoes(d.condicoes)
      setMrr(d.mrr)
      setParceiros(d.parceiros)
    }
    setCarregando(false)
  }, [])

  const carregar = useCallback(async () => {
    aplicar(await buscar())
  }, [buscar, aplicar])

  useEffect(() => {
    let vivo = true
    buscar().then((d) => { if (vivo) aplicar(d) })
    return () => { vivo = false }
  }, [buscar, aplicar])

  function abrirNovo() {
    setForm(FORM_VAZIO); setErro(''); setModal({})
  }

  function abrirEdicao(c: Condicao) {
    setForm({
      nomeFantasia: c.nomeFantasia,
      identificacao: c.identificacao,
      tipo: c.tipo,
      pix: c.pix != null ? String(c.pix) : '',
      kyc: c.kyc != null ? String(c.kyc) : '',
      sustentacao: c.sustentacao != null ? String(c.sustentacao) : '',
      apiMensal: c.apiMensal != null ? String(c.apiMensal) : '',
      mensalidadeContaAtiva: c.mensalidadeContaAtiva != null ? String(c.mensalidadeContaAtiva) : '',
      sustentacaoInicio: c.sustentacaoInicio ? c.sustentacaoInicio.slice(0, 10) : '',
      overpricePercent: c.overpricePercent != null ? String(c.overpricePercent) : '',
      observacao: c.observacao ?? '',
    })
    setErro(''); setModal({ id: c.id })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSalvando(true); setErro('')

    const res = await fetch(
      modal.id ? `/api/financeiro/condicoes-baas/${modal.id}` : '/api/financeiro/condicoes-baas',
      {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      },
    )

    if (res.ok) {
      setModal(null); carregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar.')
    }
    setSalvando(false)
  }

  async function abrirHistorico(c: Condicao) {
    const res = await fetch(`/api/financeiro/condicoes-baas/${c.id}`)
    if (!res.ok) return
    const d = await res.json()
    setHistorico({ condicao: d.condicao, eventos: d.condicao.historico ?? [] })
  }

  async function inativar(c: Condicao) {
    const ok = confirm(
      `Inativar ${c.nomeFantasia} (${c.identificacao})?\n\n` +
      `Sai do MRR e da contagem de ${TIPO_LABEL[c.tipo]} ativos a partir de agora. ` +
      `O cadastro e todo o histórico de taxas continuam disponíveis para auditoria.`
    )
    if (!ok) return
    const res = await fetch(`/api/financeiro/condicoes-baas/${c.id}`, { method: 'DELETE' })
    if (res.ok) carregar()
  }

  async function reativar(c: Condicao) {
    const res = await fetch(`/api/financeiro/condicoes-baas/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: true }),
    })
    if (res.ok) carregar()
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Condições BaaS"
        sub="Onde BaaS e White Labels são cadastrados. Alimenta o MRR e as contagens de ativos."
        actions={podeGerenciar ? <Button variant="primary" onClick={abrirNovo}>Novo cadastro</Button> : undefined}
      />

      <HairlineGrid cols={3}>
        {/* Conta ativa NÃO entra: o MRR é Mensalidades + Sustentação. A
            coluna continua na tabela abaixo porque é dado do contrato — o que
            saiu foi a participação no recorrente. */}
        <StatTile label="MRR destes cadastros"
          figura={mrr ? figuraMoeda(
            mrr.sustentacaoBaas + mrr.sustentacaoWhiteLabel + mrr.apiMensalParceiros,
          ) : null}
          note="Sustentação vigente + API mensal" />
        <StatTile label="BaaS ativos" figura={figuraContagem(parceiros.baasAtivos)} />
        <StatTile label="White Labels ativos" figura={figuraContagem(parceiros.whiteLabelsAtivos)} />
      </HairlineGrid>

      {/* Sustentação contratada que ainda não começou: fora do MRR, mas a tela
          precisa poder dizer isso — senão o número só parece faltar. */}
      {mrr && mrr.sustentacaoAguardandoInicio > 0 && (
        <Badge tone="warn">
          {figuraMoeda(mrr.sustentacaoAguardandoInicio).completo} de sustentação contratada ainda
          não entra no MRR — a data de início não chegou
        </Badge>
      )}

      <Panel padded={false}>
        <label className="p-3 flex items-center gap-2 t-sm text-muted cursor-pointer">
          <input type="checkbox" checked={incluirInativos}
            onChange={(e) => setIncluirInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Nome fantasia</Th>
              <Th>Identificação</Th>
              <Th>Tipo</Th>
              {/* PRODUTOS em lugar de PIX e KYC: a tarifa por transação
                  passou a ser cadastro próprio, e o número aqui diz quantos
                  produtos o parceiro tem tarifados. */}
              <Th align="right">Produtos</Th>
              <Th align="right">Sustentação</Th>
              <Th align="right">API mensal</Th>
              <Th align="right">Conta ativa</Th>
              <Th align="right">Overprice</Th>
              <Th align="right">Ações</Th>
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={10}>Carregando…</EmptyRow>
            ) : condicoes.length === 0 ? (
              <EmptyRow colSpan={10}>Nenhum BaaS ou White Label cadastrado.</EmptyRow>
            ) : condicoes.map((c) => (
              <Row key={c.id}>
                <Td className="pl-5">
                  <span className={`block t-body font-medium ${c.ativo ? 'text-fg' : 'text-subtle'}`}>
                    {c.nomeFantasia}
                  </span>
                  {!c.ativo && <Badge>Inativo</Badge>}
                </Td>
                <Td className="t-mono text-subtle">{c.identificacao}</Td>
                <Td><Badge tone={TIPO_TONE[c.tipo]}>{TIPO_LABEL[c.tipo]}</Badge></Td>
                <Td align="right">
                  <button
                    onClick={() => setProdutosDe(c)}
                    className="t-sm text-accent-soft hover:underline tabular-nums">
                    {c._count?.produtos ?? 0}
                  </button>
                </Td>
                <Td align="right" numeric>
                  <span className="block">{moeda(c.sustentacao)}</span>
                  {c.sustentacaoInicio && (
                    <span className="block t-label text-subtle">
                      a partir de {formatDate(c.sustentacaoInicio)}
                    </span>
                  )}
                </Td>
                <Td align="right" numeric>{moeda(c.apiMensal)}</Td>
                <Td align="right" numeric>{moeda(c.mensalidadeContaAtiva)}</Td>
                <Td align="right" numeric>
                  {c.overpricePercent === null ? '—' : figuraPercentual(c.overpricePercent, 2).completo}
                </Td>
                <Td align="right">
                  <span className="inline-flex gap-2">
                    <Button size="sm" onClick={() => abrirHistorico(c)}>Histórico</Button>
                    {podeGerenciar && (
                      <>
                        <Button size="sm" onClick={() => abrirEdicao(c)}>Editar</Button>
                        {c.ativo
                          ? <Button size="sm" variant="danger" onClick={() => inativar(c)}>Inativar</Button>
                          : <Button size="sm" variant="subtle" onClick={() => reativar(c)}>Reativar</Button>}
                      </>
                    )}
                  </span>
                </Td>
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {/* ── Cadastro / edição ────────────────────────────────────────────── */}
      {produtosDe && (
        <GerenciarProdutos
          condicaoId={produtosDe.id}
          condicaoNome={produtosDe.nomeFantasia}
          podeGerenciar={podeGerenciar}
          onFechar={() => { setProdutosDe(null); carregar() }}
        />
      )}

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">{modal.id ? 'Editar condições' : 'Novo cadastro'}</h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={lbl} htmlFor="c-nome">Nome fantasia *</label>
                  <input id="c-nome" required value={form.nomeFantasia} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, nomeFantasia: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="c-ident">Número da conta / identificação *</label>
                  <input id="c-ident" required value={form.identificacao} className={inp} placeholder="Ex.: 12002"
                    onChange={(e) => setForm((p) => ({ ...p, identificacao: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="c-tipo">Tipo *</label>
                  <select id="c-tipo" value={form.tipo} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value as TipoParceiro }))}>
                    <option value="BAAS">BaaS</option>
                    <option value="WHITE_LABEL">White Label</option>
                  </select>
                </div>
                {/* PIX e KYC SAÍRAM DAQUI.
                    As tarifas por transação passaram a ser PRODUTOS — é o que
                    permite cadastrar manutenção de conta, boleto, API e o que
                    mais o contrato tiver, em vez de dois campos fixos.
                    Mantê-los aqui criaria duas fontes para o mesmo preço: o
                    Lançamento BaaS lê os produtos, e editar a coluna antiga
                    não mudaria a tarifa aplicada. As colunas continuam no
                    banco, com o valor histórico. */}
                <div>
                  <label className={lbl} htmlFor="c-sust">Sustentação (R$/mês)</label>
                  <input id="c-sust" type="number" step="0.01" min="0" value={form.sustentacao} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, sustentacao: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="c-api">API mensal (R$/mês)</label>
                  <input id="c-api" type="number" step="0.01" min="0" value={form.apiMensal} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, apiMensal: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="c-conta">Mensalidade de conta ativa (R$/mês)</label>
                  <input id="c-conta" type="number" step="0.01" min="0" value={form.mensalidadeContaAtiva}
                    className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, mensalidadeContaAtiva: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="c-sust-ini">Início da sustentação</label>
                  <input id="c-sust-ini" type="date" value={form.sustentacaoInicio} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, sustentacaoInicio: e.target.value }))} />
                  <p className="t-label text-subtle mt-1">
                    Antes desta data a sustentação não entra no MRR. Vazio = já vigente.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl} htmlFor="c-over">Overprice (%)</label>
                  <input id="c-over" type="number" step="0.01" min="0" value={form.overpricePercent} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, overpricePercent: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="c-obs">Observação</label>
                <textarea id="c-obs" rows={2} maxLength={1000} value={form.observacao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} />
              </div>

              {modal.id && (
                <p className="t-sm text-subtle">
                  Sustentação e API mensal entram no MRR a partir de agora. O valor anterior
                  fica registrado no histórico — o MRR já reportado não é reescrito.
                </p>
              )}

              {erro && <p className="t-sm text-neg">{erro}</p>}

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

      {/* ── Condições atuais + histórico ─────────────────────────────────── */}
      {historico && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setHistorico(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line flex-none">
              <div className="min-w-0">
                <h2 className="t-h2 text-fg bp-truncate">{historico.condicao.nomeFantasia}</h2>
                <p className="t-sm text-muted mt-0.5">
                  {historico.condicao.identificacao} · {TIPO_LABEL[historico.condicao.tipo]}
                </p>
              </div>
              <button onClick={() => setHistorico(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              <section>
                <h3 className="t-label text-subtle mb-2">Condições atuais</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 t-sm">
                  {([
                    ['PIX', moeda(historico.condicao.pix)],
                    ['KYC', moeda(historico.condicao.kyc)],
                    ['Sustentação', moeda(historico.condicao.sustentacao)],
                    ['API mensal', moeda(historico.condicao.apiMensal)],
                    ['Mensalidade de conta ativa', moeda(historico.condicao.mensalidadeContaAtiva)],
                    ['Início da sustentação', historico.condicao.sustentacaoInicio
                      ? formatDate(historico.condicao.sustentacaoInicio) : '—'],
                    ['Overprice', historico.condicao.overpricePercent === null
                      ? '—' : figuraPercentual(historico.condicao.overpricePercent, 2).completo],
                    ['Situação', historico.condicao.ativo ? 'Ativo' : 'Inativo'],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
                      <dt className="text-subtle">{k}</dt>
                      <dd className="text-fg tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h3 className="t-label text-subtle mb-2">Histórico de condições</h3>
                {historico.eventos.length === 0 ? (
                  <p className="t-sm text-subtle">Nenhuma alteração registrada desde o cadastro.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {historico.eventos.map((ev) => (
                      <li key={ev.id} className="py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="t-sm text-fg">{CAMPO_LABEL[ev.campo] ?? ev.campo}</span>
                          <span className="t-mono text-subtle">
                            {new Date(ev.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="t-sm text-muted mt-0.5">
                          <span className="text-subtle line-through">{ev.valorAnterior ?? '—'}</span>
                          {' → '}
                          <span className="text-fg">{ev.valorNovo ?? '—'}</span>
                          {' · '}{ev.user.name}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
