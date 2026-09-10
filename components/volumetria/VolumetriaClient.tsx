'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { formatMesRef, getCurrentMonth, VOLUMETRIA_STATUS_LABELS } from '@/lib/utils'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'

interface Contrato {
  id: string
  clienteId: string | null
  clienteNome: string | null
  qtdMinima: number
  vigenciaInicio: string
  vigenciaFim: string | null
  ativo: boolean
  notas: string | null
  status: 'VIGENTE' | 'PROGRAMADA' | 'ENCERRADA' | 'INATIVA'
  legado: boolean
}

interface Consolidado {
  periodo: string
  qtdMinima: number
  realizado: number | null
  diferenca: number | null
  status: 'ATINGIDO' | 'NAO_ATINGIDO' | 'EM_ACOMPANHAMENTO' | 'SEM_DADOS'
  origem: 'CLIENTES' | 'GERAL_LEGADO'
  clientes: number
}

interface ClienteOpcao { id: string; nome: string; status: string }

const TOM_STATUS: Record<Contrato['status'], BadgeTone> = {
  VIGENTE: 'pos', PROGRAMADA: 'accent', ENCERRADA: 'neutral', INATIVA: 'neutral',
}

const TOM_CONSOLIDADO: Record<Consolidado['status'], { label: string; tone: BadgeTone }> = {
  ATINGIDO: { label: 'Atingido', tone: 'pos' },
  NAO_ATINGIDO: { label: 'Não atingido', tone: 'neg' },
  EM_ACOMPANHAMENTO: { label: 'Em acompanhamento', tone: 'warn' },
  SEM_DADOS: { label: 'Sem dados', tone: 'neutral' },
}

const FORM_VAZIO = { clienteId: '', qtdMinima: '', vigenciaInicio: getCurrentMonth(), vigenciaFim: '', notas: '' }

function vigenciaTexto(c: Contrato): string {
  const ini = formatMesRef(c.vigenciaInicio)
  return c.vigenciaFim ? `${ini} — ${formatMesRef(c.vigenciaFim)}` : `${ini} — indeterminado`
}

export default function VolumetriaClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [consolidado, setConsolidado] = useState<Consolidado | null>(null)
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [periodo, setPeriodo] = useState(getCurrentMonth())
  const [busca, setBusca] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const [modal, setModal] = useState<'novo' | Contrato | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // `versao` é o gatilho de recarga depois de uma gravação: incrementá-la
  // refaz a busca sem precisar chamar setState de dentro do corpo do efeito.
  const [versao, setVersao] = useState(0)
  const carregar = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    let vivo = true
    const qs = new URLSearchParams({ periodo })
    if (filtroCliente) qs.set('clienteId', filtroCliente)
    if (filtroStatus) qs.set('status', filtroStatus)

    fetch(`/api/volumetria?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setContratos(d.contratos)
        setConsolidado(d.consolidado)
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })

    return () => { vivo = false }
  }, [periodo, filtroCliente, filtroStatus, versao])

  useEffect(() => {
    fetch('/api/clientes')
      .then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => setClientes(d.clientes ?? []))
      .catch(() => setClientes([]))
  }, [])

  // A busca por nome é local: a lista de contratos é pequena e assim o
  // resultado aparece enquanto o usuário digita, sem ida ao servidor.
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return contratos
    return contratos.filter((c) => (c.clienteNome ?? 'contrato geral').toLowerCase().includes(t))
  }, [contratos, busca])

  function abrirNovo() {
    setForm(FORM_VAZIO); setErro(''); setModal('novo')
  }

  function abrirEdicao(c: Contrato) {
    setForm({
      clienteId: c.clienteId ?? '',
      qtdMinima: String(c.qtdMinima),
      vigenciaInicio: c.vigenciaInicio,
      vigenciaFim: c.vigenciaFim ?? '',
      notas: c.notas ?? '',
    })
    setErro(''); setModal(c)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')

    const corpo = {
      clienteId: form.clienteId,
      qtdMinima: Number(form.qtdMinima),
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim || null,
      notas: form.notas || null,
    }
    const editando = modal !== 'novo' && modal !== null
    const res = await fetch(editando ? `/api/volumetria/${modal.id}` : '/api/volumetria', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar.')
      setSalvando(false)
      return
    }

    setModal(null); setSalvando(false); carregar()
  }

  async function alternarAtivo(c: Contrato) {
    const acao = c.ativo ? 'Inativar' : 'Reativar'
    if (!confirm(`${acao} a volumetria de ${c.clienteNome} com vigência a partir de ${formatMesRef(c.vigenciaInicio)}?\n\nO histórico é preservado.`)) return
    const res = await fetch(`/api/volumetria/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível alterar o status.')
      return
    }
    carregar()
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  const cons = consolidado ? TOM_CONSOLIDADO[consolidado.status] : null

  return (
    <div className="space-y-8">
      <PageHeader
        title="Volumetria Mínima por Cliente"
        sub="Exigência contratual de transações por cliente e período de vigência. O realizado é consolidado — vem do lançamento diário."
        actions={
          <>
            <input
              type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
              aria-label="Período de referência"
              className="bg-surface border border-line rounded-lg px-3 py-2 t-sm text-muted focus:outline-none focus:border-accent"
            />
            {podeGerenciar && <Button variant="primary" onClick={abrirNovo}>+ Nova configuração</Button>}
          </>
        }
      />

      {/* Consolidado do período: o único nível em que o atingimento existe. */}
      <Panel className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="t-h2 text-fg">Consolidado de {formatMesRef(periodo)}</h2>
          {consolidado ? (
            <p className="t-sm text-muted mt-1 tabular-nums">
              Mínimo {consolidado.qtdMinima.toLocaleString('pt-BR')} transações
              {consolidado.origem === 'CLIENTES'
                ? ` · soma de ${consolidado.clientes} ${consolidado.clientes === 1 ? 'cliente' : 'clientes'}`
                : ' · contrato geral (legado)'}
              {' · '}Realizado {consolidado.realizado?.toLocaleString('pt-BR') ?? 'sem dados'}
            </p>
          ) : (
            <p className="t-sm text-subtle mt-1">Nenhuma volumetria vigente neste período.</p>
          )}
        </div>
        {cons && <Badge tone={cons.tone}>{cons.label}</Badge>}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..." aria-label="Buscar cliente"
          className="flex-1 min-w-[14rem] bg-surface border border-line rounded-lg px-3 py-2 t-sm text-fg focus:outline-none focus:border-accent"
        />
        <select
          value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} aria-label="Filtrar por cliente"
          className="bg-surface border border-line rounded-lg px-3 py-2 t-sm text-muted focus:outline-none focus:border-accent"
        >
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select
          value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} aria-label="Filtrar por status"
          className="bg-surface border border-line rounded-lg px-3 py-2 t-sm text-muted focus:outline-none focus:border-accent"
        >
          <option value="">Todos os status</option>
          {Object.entries(VOLUMETRIA_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : visiveis.length === 0 && !busca && !filtroCliente && !filtroStatus ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhuma volumetria configurada"
            description="Vincule a quantidade mínima de transações contratada a um cliente e defina o período de vigência."
            action={podeGerenciar ? <Button variant="primary" onClick={abrirNovo}>+ Nova configuração</Button> : undefined}
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th>Cliente</Th>
                <Th align="right">Mínimo / mês</Th>
                <Th>Vigência</Th>
                <Th align="center">Status</Th>
                {podeGerenciar && <Th align="right">Ações</Th>}
              </HeadRow>
            </THead>
            <tbody>
              {visiveis.length === 0 ? (
                <EmptyRow colSpan={podeGerenciar ? 5 : 4}>Nenhum resultado para os filtros aplicados.</EmptyRow>
              ) : visiveis.map((c) => (
                <Row key={c.id} className={c.ativo ? undefined : 'opacity-60'}>
                  <Td className="text-fg font-medium">
                    {c.clienteNome ?? 'Contrato geral'}
                    {c.legado && <span className="ml-2 t-label text-subtle">legado</span>}
                    {c.notas && <p className="t-sm text-subtle font-normal mt-0.5">{c.notas}</p>}
                  </Td>
                  <Td align="right" numeric className="text-fg">{c.qtdMinima.toLocaleString('pt-BR')}</Td>
                  <Td>{vigenciaTexto(c)}</Td>
                  <Td align="center">
                    <Badge tone={TOM_STATUS[c.status]}>{VOLUMETRIA_STATUS_LABELS[c.status]}</Badge>
                  </Td>
                  {podeGerenciar && (
                    <Td align="right">
                      {c.legado ? (
                        <span className="t-sm text-subtle">somente leitura</span>
                      ) : (
                        <div className="inline-flex gap-2">
                          <Button size="sm" onClick={() => abrirEdicao(c)}>Editar</Button>
                          <Button size="sm" variant={c.ativo ? 'danger' : 'subtle'} onClick={() => alternarAtivo(c)}>
                            {c.ativo ? 'Inativar' : 'Reativar'}
                          </Button>
                        </div>
                      )}
                    </Td>
                  )}
                </Row>
              ))}
            </tbody>
          </Table>
        </TableShell>
      )}

      {modal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal === 'novo' ? 'Nova volumetria mínima' : `Editar — ${modal.clienteNome}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={salvar} className="p-5 space-y-4">
              {erro && (
                <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>
              )}

              <div>
                <label className={lbl} htmlFor="vol-cliente">Cliente *</label>
                <select
                  id="vol-cliente" required disabled={modal !== 'novo'} value={form.clienteId}
                  onChange={(e) => setForm((p) => ({ ...p, clienteId: e.target.value }))}
                  className={`${inp} disabled:opacity-50`}
                >
                  <option value="">Selecione um cliente</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                {modal !== 'novo' && (
                  <p className="t-sm text-subtle mt-1">
                    O cliente não muda depois de criado — isso reescreveria o histórico.
                  </p>
                )}
              </div>

              <div>
                <label className={lbl} htmlFor="vol-qtd">Quantidade mínima de transações / mês *</label>
                <input
                  id="vol-qtd" required type="number" min="1" step="1" value={form.qtdMinima}
                  onChange={(e) => setForm((p) => ({ ...p, qtdMinima: e.target.value }))}
                  placeholder="Ex.: 150000" className={`${inp} tabular-nums`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl} htmlFor="vol-ini">Vigência — início *</label>
                  <input
                    id="vol-ini" required type="month" value={form.vigenciaInicio}
                    onChange={(e) => setForm((p) => ({ ...p, vigenciaInicio: e.target.value }))} className={inp}
                  />
                </div>
                <div>
                  <label className={lbl} htmlFor="vol-fim">Vigência — fim</label>
                  <input
                    id="vol-fim" type="month" value={form.vigenciaFim}
                    onChange={(e) => setForm((p) => ({ ...p, vigenciaFim: e.target.value }))} className={inp}
                  />
                  <p className="t-sm text-subtle mt-1">Vazio = indeterminado</p>
                </div>
              </div>

              <div>
                <label className={lbl} htmlFor="vol-notas">Observações</label>
                <textarea
                  id="vol-notas" rows={2} value={form.notas} maxLength={500}
                  onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))} className={inp}
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
