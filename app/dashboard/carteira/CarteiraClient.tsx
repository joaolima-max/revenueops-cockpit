'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import {
  formatCurrency,
  CLIENTE_STATUS_LABELS,
  MODELO_OPERACIONAL_LABELS,
  SEGMENTO_CRM_LABELS,
} from '@/lib/utils'
import { STATUS_CLIENTE, STATUS_CLIENTE_LABEL } from '@/lib/clientes'
import GerenciarSegmentos from '@/components/carteira/GerenciarSegmentos'

/**
 * CARTEIRA DE CLIENTES.
 *
 * Campos do cadastro: nome, CNPJ, modelo operacional, e-mail, telefone,
 * segmento, data de fechamento, mensalidade de API, número da conta, gestor
 * de conta e status. Saíram os campos de expectativa financeira e o Score de
 * Risco; as condições de BaaS/White Label moram em CondicaoComercial.
 *
 * O BLOCO "ÚLTIMOS 5 DIAS" SAIU. Era uma grade de marcação manual dentro da
 * listagem: o gestor marcava à mão se o cliente movimentou, e o dado não
 * alimentava nenhum indicador — TPV e transações vêm do Lançamento Diário, que
 * é geral. Uma coluna de caixas de marcação no meio da carteira competia com a
 * informação que a tela existe para dar.
 *
 * O SEGMENTO vem da ENTIDADE (`segmentoComercial`). O enum antigo continua na
 * coluna `segmento` dos registros anteriores, e é a retaguarda da leitura.
 */
interface Cliente {
  id: string; nome: string; cnpj: string | null; email: string | null
  telefone: string | null
  modeloOperacional: string; status: string
  segmento: string | null
  segmentoComercialId: string | null
  segmentoComercial: { id: string; nome: string; slug: string } | null
  numeroConta: string | null
  mensalidadeApi: number | null; dataFechamento: string | null
  notas: string | null
  owner: { name: string }
  gestor: { id: string; name: string } | null
}

interface Segmento { id: string; nome: string; ativo: boolean }
interface Usuario { id: string; name: string }

const emptyForm = {
  nome: '', cnpj: '', email: '', telefone: '', modeloOperacional: 'API',
  segmentoComercialId: '', mensalidadeApi: '', dataFechamento: '', notas: '',
  numeroConta: '', gestorId: '', status: 'ATIVO',
}

/** Os três modelos operacionais do produto. */
const MODELOS = ['API', 'BAAS', 'WHITE_LABEL'] as const

export default function CarteiraClient() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modeloFilter, setModeloFilter] = useState('')
  const [segFilter, setSegFilter] = useState('')
  const [gestorFilter, setGestorFilter] = useState('')
  /** null = fechado · 'novo' = criação · Cliente = edição daquele cliente. */
  const [modal, setModal] = useState<'novo' | Cliente | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [gerenciandoSegmentos, setGerenciandoSegmentos] = useState(false)

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscarClientes = useCallback(async (): Promise<Cliente[] | null> => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    if (statusFilter) p.set('status', statusFilter)
    if (modeloFilter) p.set('modelo', modeloFilter)
    if (segFilter) p.set('segmentoId', segFilter)
    if (gestorFilter) p.set('gestorId', gestorFilter)
    const res = await fetch(`/api/clientes?${p}`)
    if (!res.ok) return null
    const data = await res.json()
    return (data.clientes ?? []) as Cliente[]
  }, [search, statusFilter, modeloFilter, segFilter, gestorFilter])

  const aplicarClientes = useCallback((lista: Cliente[] | null) => {
    if (lista) setClientes(lista)
    setLoading(false)
  }, [])

  const fetchClientes = useCallback(
    async () => { aplicarClientes(await buscarClientes()) },
    [buscarClientes, aplicarClientes],
  )

  // Segmentos e usuários: o que os seletores do formulário precisam. Uma
  // chamada só, no primeiro render — não mudam a cada filtro.
  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch('/api/segmentos').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/users').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([seg, usr]) => {
      if (!vivo) return
      if (seg) setSegmentos(seg.segmentos ?? [])
      // Gestor de conta é qualquer usuário ATIVO — não é cargo.
      if (Array.isArray(usr)) setUsuarios(usr.filter((u: { active: boolean }) => u.active))
    })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    let vivo = true
    buscarClientes().then((d) => { if (vivo) aplicarClientes(d) })
    return () => { vivo = false }
  }, [buscarClientes, aplicarClientes])

  function resetModal() {
    setModal(null)
    setForm(emptyForm)
    setErro('')
  }

  function abrirNovo() {
    setForm(emptyForm); setErro(''); setModal('novo')
  }

  /** A EDIÇÃO que faltava: a tela só criava cliente. */
  function abrirEdicao(c: Cliente) {
    setForm({
      nome: c.nome,
      cnpj: c.cnpj ?? '',
      email: c.email ?? '',
      telefone: c.telefone ?? '',
      modeloOperacional: c.modeloOperacional,
      segmentoComercialId: c.segmentoComercialId ?? '',
      mensalidadeApi: c.mensalidadeApi != null ? String(c.mensalidadeApi) : '',
      dataFechamento: c.dataFechamento ? c.dataFechamento.slice(0, 10) : '',
      notas: c.notas ?? '',
      numeroConta: c.numeroConta ?? '',
      gestorId: c.gestor?.id ?? '',
      status: c.status === 'INATIVO' ? 'INATIVO' : 'ATIVO',
    })
    setErro(''); setModal(c)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErro('')

    const editando = modal !== 'novo' && modal !== null
    const corpo = {
      ...form,
      segmentoComercialId: form.segmentoComercialId || null,
      gestorId: form.gestorId || null,
      numeroConta: form.numeroConta || null,
      mensalidadeApi: form.mensalidadeApi ? parseFloat(form.mensalidadeApi) : null,
      dataFechamento: form.dataFechamento || null,
      notas: form.notas || null,
    }

    const res = await fetch(
      editando ? `/api/clientes/${(modal as Cliente).id}` : '/api/clientes',
      {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      },
    )
    if (res.ok) { resetModal(); fetchClientes() }
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar o cliente.')
    }
    setSaving(false)
  }

  // Mensalidade de API da carteira — é UMA das quatro parcelas do MRR, não o
  // MRR inteiro. O MRR completo (com sustentação e API dos parceiros) está no
  // Financeiro, que é onde ele é calculado.
  const mensalidades = clientes.filter(c => c.status === 'ATIVO').reduce((s, c) => s + (c.mensalidadeApi || 0), 0)
  const ativos = clientes.filter(c => c.status === 'ATIVO').length

  const input = 'bp-field'
  const lbl = 'bp-field-label'

  const STATUS_TONE: Record<string, BadgeTone> = {
    ATIVO: 'pos', INATIVO: 'neutral',
    // Legados: legíveis, nunca graváveis pela tela.
    PROSPECCAO: 'accent', ENCERRADO: 'neutral', STANDBY: 'neutral',
  }
  const filtro = 'bp-field w-auto'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Carteira de Clientes"
        sub={`${ativos} ativos · Mensalidades de API ${formatCurrency(mensalidades)}`}
        actions={
          <span className="inline-flex items-center gap-2">
            {/* Mesmo padrão de "Gerenciar funis" no Pipeline: a taxonomia é
                configuração da Carteira, não um ambiente próprio. */}
            <Button onClick={() => setGerenciandoSegmentos(true)}>Gerenciar segmentos</Button>
            <Button variant="primary" onClick={abrirNovo}>Novo cliente</Button>
          </span>
        }
      />

      {/* Filtros numa barra única, em vez de quatro campos soltos. */}
      <Panel className="flex gap-3 flex-wrap items-center" padded={false}>
        <div className="flex gap-3 flex-wrap w-full p-3">
          <input
            type="text" placeholder="Buscar cliente…" value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${filtro} flex-1 min-w-[12rem]`}
          />
          {/* STATUS: Ativo e Inativo. Os legados do enum não são oferecidos
              como filtro — só sobrevivem nos registros que já os têm. */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={filtro}>
            <option value="">Todos os status</option>
            {STATUS_CLIENTE.map(v => (
              <option key={v} value={v}>{STATUS_CLIENTE_LABEL[v]}</option>
            ))}
          </select>
          <select value={modeloFilter} onChange={e => setModeloFilter(e.target.value)} className={filtro}>
            <option value="">Todos os modelos</option>
            {MODELOS.map(m => <option key={m} value={m}>{MODELO_OPERACIONAL_LABELS[m]}</option>)}
          </select>
          {/* Segmentos da ENTIDADE, não de um mapa fixo no código. */}
          <select value={segFilter} onChange={e => setSegFilter(e.target.value)} className={filtro}>
            <option value="">Todos os segmentos</option>
            {segmentos.map(sg => <option key={sg.id} value={sg.id}>{sg.nome}</option>)}
          </select>
          <select value={gestorFilter} onChange={e => setGestorFilter(e.target.value)} className={filtro}>
            <option value="">Todos os gestores</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              {/* MODELO antes de SEGMENTO, e os dois com largura própria.
                  Estavam colados: segmento é texto cadastrado, de largura
                  imprevisível, e sem teto ele encostava no modelo — que é um
                  badge curto e fixo. Ordenar do fixo para o variável, com
                  larguras declaradas, é o que dá respiro entre as duas
                  colunas sem alargar a tabela. */}
              <Th className="pl-5">Cliente</Th>
              <Th className="w-[7rem]">Conta</Th>
              <Th className="w-[7.5rem]">Modelo</Th>
              <Th className="w-[10rem]">Segmento</Th>
              <Th className="w-[6rem]">Status</Th>
              <Th align="right" className="w-[9rem]">Mensalidade API</Th>
              <Th className="w-[9rem]">Gestor</Th>
              <Th align="right" className="w-[6rem]">Ações</Th>
            </HeadRow>
          </THead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={8}>Carregando…</EmptyRow>
            ) : clientes.length === 0 ? (
              <EmptyRow colSpan={8}>Nenhum cliente encontrado com esses filtros.</EmptyRow>
            ) : clientes.map(c => (
              <Row key={c.id}>
                <Td className="pl-5">
                  <Link href={`/dashboard/carteira/${c.id}`} className="group block">
                    <span className="block t-body font-medium text-fg group-hover:text-accent-soft transition-colors duration-[180ms]">{c.nome}</span>
                    {c.cnpj && <span className="block t-mono text-subtle mt-1">{c.cnpj}</span>}
                  </Link>
                </Td>
                {/* NÚMERO DA CONTA — opcional, e é a chave que o Lançamento
                    BaaS usa para achar o cliente de um título. */}
                <Td className="t-mono text-muted">
                  {c.numeroConta ?? <span className="text-subtle">—</span>}
                </Td>
                {/* MODELO antes de SEGMENTO, na ordem do cabeçalho, com
                    `pr-4` de respiro. Os dois estavam colados: o modelo é um
                    badge curto e fixo, o segmento é texto cadastrado de
                    largura imprevisível, e sem espaçamento o segundo começava
                    encostado no primeiro.
                    Os dois são categorias, não status: tom neutro. O nome do
                    segmento vem da entidade, com retaguarda no enum antigo, e
                    trunca com o nome completo no hover. */}
                <Td className="pr-4">
                  <Badge>{MODELO_OPERACIONAL_LABELS[c.modeloOperacional]}</Badge>
                </Td>
                <Td className="max-w-0">
                  {c.segmentoComercial
                    ? <Badge truncar title={c.segmentoComercial.nome}>{c.segmentoComercial.nome}</Badge>
                    : c.segmento
                      ? (() => {
                          const nome = SEGMENTO_CRM_LABELS[c.segmento] ?? c.segmento
                          return <Badge truncar title={nome}>{nome}</Badge>
                        })()
                      : <span className="text-subtle">—</span>}
                </Td>
                <Td><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{CLIENTE_STATUS_LABELS[c.status]}</Badge></Td>
                <Td align="right" numeric className="text-fg">
                  {c.mensalidadeApi ? formatCurrency(c.mensalidadeApi) : <span className="text-subtle">—</span>}
                </Td>
                <Td className="text-subtle">
                  {c.gestor?.name ?? <span className="text-subtle">{c.owner.name}</span>}
                </Td>
                <Td align="right">
                  <Button size="sm" onClick={() => abrirEdicao(c)}>Editar</Button>
                </Td>
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {gerenciandoSegmentos && (
        <GerenciarSegmentos onFechar={() => {
          setGerenciandoSegmentos(false)
          // Recarrega os seletores: um segmento criado agora precisa aparecer.
          setSegmentos([]); setSearch((v) => v)
          fetch('/api/segmentos').then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d) setSegmentos(d.segmentos ?? []) })
            .catch(() => {})
        }} />
      )}

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && resetModal()}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal === 'novo' ? 'Novo Cliente' : `Editar — ${(modal as Cliente).nome}`}
              </h2>
              <button onClick={resetModal} className="text-subtle hover:text-fg">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {erro && (
                <div className="rounded-lg border border-neg/25 bg-neg/10 px-3 py-2">
                  <p className="t-sm text-neg">{erro}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2"><label className={lbl}>Nome *</label><input required value={form.nome} onChange={f('nome')} className={input} /></div>
                <div><label className={lbl}>CNPJ</label><input value={form.cnpj} onChange={f('cnpj')} placeholder="00.000.000/0001-00" className={input} /></div>
                <div>
                  <label className={lbl}>Modelo Operacional *</label>
                  <select required value={form.modeloOperacional} onChange={f('modeloOperacional')} className={input}>
                    {MODELOS.map(m => <option key={m} value={m}>{MODELO_OPERACIONAL_LABELS[m]}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>E-mail</label><input type="email" value={form.email} onChange={f('email')} className={input} /></div>
                <div><label className={lbl}>Telefone</label><input value={form.telefone} onChange={f('telefone')} className={input} /></div>
                <div>
                  <label className={lbl}>Segmento</label>
                  <select value={form.segmentoComercialId} onChange={f('segmentoComercialId')} className={input}>
                    <option value="">Selecione</option>
                    {segmentos.map(sg => <option key={sg.id} value={sg.id}>{sg.nome}</option>)}
                  </select>
                </div>
                <div><label className={lbl}>Data de Fechamento</label><input type="date" value={form.dataFechamento} onChange={f('dataFechamento')} className={input} /></div>
                <div>
                  {/* OPCIONAL e nunca gerado: inventar um número criaria um
                      identificador que não existe em lugar nenhum. */}
                  <label className={lbl}>Número da conta</label>
                  <input value={form.numeroConta} onChange={f('numeroConta')}
                    placeholder="Opcional" className={input} />
                </div>
                <div>
                  <label className={lbl}>Status</label>
                  <select value={form.status} onChange={f('status')} className={input}>
                    {STATUS_CLIENTE.map(v => (
                      <option key={v} value={v}>{STATUS_CLIENTE_LABEL[v]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {/* GESTOR DE CONTA é responsabilidade pela conta — qualquer
                      usuário ativo é elegível. Não é Diretor, não é sócio. */}
                  <label className={lbl}>Gestor de conta</label>
                  <select value={form.gestorId} onChange={f('gestorId')} className={input}>
                    <option value="">Sem gestor</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Mensalidade de API (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.mensalidadeApi} onChange={f('mensalidadeApi')} className={input} />
                </div>
              </div>

              <div><label className={lbl}>Notas</label><textarea rows={2} value={form.notas} onChange={f('notas')} className={input + ' resize-none'} /></div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={resetModal} className="px-4 py-2 text-subtle border border-line-2 hover:border-line-2 hover:text-fg text-sm rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="bp-btn-primary px-4 py-2 text-sm font-medium rounded-lg transition-all">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
