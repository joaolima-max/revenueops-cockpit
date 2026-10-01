'use client'

import { useState, useCallback, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge, { type BadgeTone } from '@/components/ui/Badge'
import HairlineGrid from '@/components/ui/HairlineGrid'
import StatTile from '@/components/ui/StatTile'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { figuraMoeda } from '@/lib/format-financeiro'
import { formatDate, formatMesRef } from '@/lib/utils'
import {
  validarArquivo, EXTENSOES_ACEITAS, MAX_ANEXOS_LANCAMENTO, TAMANHO_MAX,
} from '@/lib/arquivos'
import DetalheBaas, { type LancamentoBaasDetalhe } from '@/components/financeiro/DetalheBaas'

/**
 * O Lançamento BaaS que originou a linha, se houver.
 *
 * Um lançamento é o lado da receita OU o do repasse — nunca os dois —, e nos
 * dois casos o detalhe é o mesmo registro de origem.
 */
function origemBaas(l: {
  baasReceita?: LancamentoBaasDetalhe | null
  baasContaPagar?: LancamentoBaasDetalhe | null
}): LancamentoBaasDetalhe | null {
  return l.baasReceita ?? l.baasContaPagar ?? null
}

/**
 * A segunda linha da descrição: tipo, fornecedor, parceiro e anexos.
 *
 * Montada numa função para poder ir junto no `title` — o texto truncado sem
 * tooltip esconderia justamente o fornecedor e o parceiro, que é o que
 * distingue dois lançamentos de mesma descrição.
 */
function contexto(l: {
  tipo: string
  fornecedor: { razaoSocial: string } | null
  condicao: { nomeFantasia: string } | null
  anexos: unknown[]
}): string {
  const partes = [l.tipo === 'RECEITA' ? 'Receita' : 'Despesa']
  if (l.fornecedor) partes.push(l.fornecedor.razaoSocial)
  if (l.condicao) partes.push(l.condicao.nomeFantasia)
  if (l.anexos.length > 0) {
    partes.push(`${l.anexos.length} anexo${l.anexos.length === 1 ? '' : 's'}`)
  }
  return partes.join(' · ')
}

/** MIMEs que o navegador abre inline — o resto só faz sentido baixar. */
const VISUALIZAVEIS = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]

/** Tipo em linguagem de gente: "PDF", "Imagem JPEG". */
function rotuloTipo(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return `Imagem ${mime.slice(6).toUpperCase()}`
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'Planilha'
  if (mime.includes('word')) return 'Documento'
  if (mime === 'text/csv') return 'CSV'
  return mime || 'arquivo'
}

/** Tamanho com a unidade que o número pede: 840 KB, 2,4 MB. */
function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`
}

type Tipo = 'RECEITA' | 'DESPESA'
type Periodicidade = 'UNICA' | 'RECORRENTE' | 'PARCELADA'
type Status = 'PENDENTE' | 'PAGO' | 'CANCELADO'
type Natureza = 'FLOAT' | 'SETUP' | 'SUSTENTACAO' | null

interface Categoria { id: string; nome: string; tipo: Tipo; natureza: Natureza; ativo: boolean }
interface Fornecedor { id: string; razaoSocial: string; ativo: boolean }
interface Parceiro { id: string; nomeFantasia: string; tipo: 'BAAS' | 'WHITE_LABEL'; ativo: boolean }
interface Cliente { id: string; nome: string }

interface Anexo {
  id: string
  documento: { id: string; nome: string; mime: string; tamanho: number }
}

interface Lancamento {
  id: string
  tipo: Tipo
  descricao: string
  /**
   * ORIGEM BaaS, quando houver. Um lançamento pode ser o lado da RECEITA ou o
   * do REPASSE de um Lançamento BaaS — nos dois casos o detalhe é o mesmo
   * registro, e é dele que vem a composição por produto.
   */
  baasReceita?: LancamentoBaasDetalhe | null
  baasContaPagar?: LancamentoBaasDetalhe | null
  valor: number
  data: string
  dataVencimento: string | null
  status: Status
  observacao: string | null
  periodicidade: Periodicidade
  recorrenteIndefinido: boolean
  recorrenciaFim: string | null
  grupoId: string | null
  parcela: number | null
  totalParcelas: number | null
  categoria: Categoria
  fornecedor: { id: string; razaoSocial: string } | null
  condicao: { id: string; nomeFantasia: string; tipo: 'BAAS' | 'WHITE_LABEL' } | null
  criadoPor: { id: string; name: string }
  anexos: Anexo[]
}

interface Resposta {
  lancamentos: Lancamento[]
  resultado: { receita: number; despesa: number; resultado: number }
}

const STATUS_LABEL: Record<Status, string> = {
  PENDENTE: 'Pendente', PAGO: 'Pago', CANCELADO: 'Cancelado',
}
const STATUS_TONE: Record<Status, BadgeTone> = {
  PENDENTE: 'warn', PAGO: 'pos', CANCELADO: 'neutral',
}
const PERIODICIDADE_LABEL: Record<Periodicidade, string> = {
  UNICA: 'Única', RECORRENTE: 'Recorrente', PARCELADA: 'Parcelada',
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const FORM_VAZIO = {
  descricao: '', categoriaId: '', valor: '', data: hojeISO(),
  dataVencimento: '', status: 'PENDENTE' as Status, observacao: '',
  periodicidade: 'UNICA' as Periodicidade, totalParcelas: '2',
  /** 'INDEFINIDA' | 'ATE_DATA' — só lida quando a periodicidade é RECORRENTE. */
  duracao: 'INDEFINIDA' as 'INDEFINIDA' | 'ATE_DATA',
  recorrenciaFim: '',
  fornecedorId: '', condicaoId: '',
  /* RECEITA: cliente e geracao do titulo a receber. Contas a Receber nao
     cadastra — o recebivel nasce aqui. */
  clienteId: '', gerarRecebivel: false,
}

const FILTRO_VAZIO = { descricao: '', categoriaId: '', de: '', ate: '', valorMin: '', valorMax: '' }

/**
 * LANÇAMENTOS — receita e despesa com os MESMOS campos base.
 *
 * A criação começa escolhendo RECEITA ou DESPESA. O que muda entre os dois é
 * pequeno e deliberado:
 *
 *   DESPESA → data de vencimento (alimenta Contas a Pagar) e fornecedor
 *   RECEITA → vínculo opcional com um BaaS / White Label
 *
 * Nenhum dos dois é obrigatório, e nenhum cria uma segunda base: são colunas
 * da mesma linha de LancamentoFinanceiro.
 */
export default function LancamentosClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [periodo, setPeriodo] = useState(() => hojeISO().slice(0, 7))
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [resultado, setResultado] = useState({ receita: 0, despesa: 0, resultado: 0 })
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [filtro, setFiltro] = useState(FILTRO_VAZIO)
  const [carregando, setCarregando] = useState(true)

  const [tipoNovo, setTipoNovo] = useState<Tipo | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [anexosDe, setAnexosDe] = useState<Lancamento | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erroAnexo, setErroAnexo] = useState('')
  /** Nome do arquivo em upload — o progresso que o fetch não dá. */
  const [nomeEnviando, setNomeEnviando] = useState('')
  /** Detalhe do Lançamento BaaS que originou a linha. */
  const [detalheBaas, setDetalheBaas] = useState<LancamentoBaasDetalhe | null>(null)

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (): Promise<Resposta | null> => {
    const p = new URLSearchParams({ periodo })
    if (filtro.descricao) p.set('descricao', filtro.descricao)
    if (filtro.categoriaId) p.set('categoriaId', filtro.categoriaId)
    if (filtro.de) p.set('de', filtro.de)
    if (filtro.ate) p.set('ate', filtro.ate)
    if (filtro.valorMin) p.set('valorMin', filtro.valorMin)
    if (filtro.valorMax) p.set('valorMax', filtro.valorMax)

    const res = await fetch(`/api/financeiro/lancamentos?${p}`)
    if (!res.ok) return null
    return (await res.json()) as Resposta
  }, [periodo, filtro])

  const aplicar = useCallback((d: Resposta | null) => {
    if (d) {
      setLancamentos(d.lancamentos)
      setResultado(d.resultado)
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

  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch('/api/financeiro/categorias').then((r) => (r.ok ? r.json() : { categorias: [] })),
      fetch('/api/financeiro/fornecedores').then((r) => (r.ok ? r.json() : { fornecedores: [] })),
      fetch('/api/financeiro/condicoes-baas').then((r) => (r.ok ? r.json() : { condicoes: [] })),
      fetch('/api/clientes').then((r) => (r.ok ? r.json() : { clientes: [] })),
    ])
      .then(([cat, forn, cond, cli]) => {
        if (!vivo) return
        setCategorias(cat.categorias ?? [])
        setFornecedores(forn.fornecedores ?? [])
        setParceiros(cond.condicoes ?? [])
        setClientes(cli.clientes ?? [])
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  // Categoria inativa não é oferecida em lançamento novo, mas continua
  // classificando os lançamentos que já existem.
  const categoriasDoTipo = (t: Tipo) => categorias.filter((c) => c.tipo === t && c.ativo)

  function abrirNovo(tipo: Tipo) {
    setForm({ ...FORM_VAZIO, dataVencimento: tipo === 'DESPESA' ? hojeISO() : '' })
    setErro(''); setEditando(null); setTipoNovo(tipo)
  }

  function abrirEdicao(l: Lancamento) {
    setForm({
      descricao: l.descricao,
      categoriaId: l.categoria.id,
      valor: String(l.valor),
      data: l.data.slice(0, 10),
      dataVencimento: l.dataVencimento?.slice(0, 10) ?? '',
      status: l.status,
      observacao: l.observacao ?? '',
      periodicidade: l.periodicidade,
      totalParcelas: String(l.totalParcelas ?? 2),
      duracao: l.recorrenteIndefinido ? 'INDEFINIDA' : 'ATE_DATA',
      recorrenciaFim: l.recorrenciaFim?.slice(0, 10) ?? '',
      fornecedorId: l.fornecedor?.id ?? '',
      condicaoId: l.condicao?.id ?? '',
      // O recebível só é gerado na CRIAÇÃO: editar o lançamento não cria nem
      // reescreve título nenhum, senão uma correção de valor viraria cobrança
      // duplicada.
      clienteId: '', gerarRecebivel: false,
    })
    setErro(''); setTipoNovo(l.tipo); setEditando(l)
  }

  function fecharForm() {
    setTipoNovo(null); setEditando(null); setForm(FORM_VAZIO); setErro('')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!tipoNovo) return
    setSalvando(true); setErro('')

    const corpo = {
      tipo: tipoNovo,
      descricao: form.descricao,
      categoriaId: form.categoriaId,
      valor: form.valor,
      data: form.data,
      status: form.status,
      observacao: form.observacao,
      periodicidade: form.periodicidade,
      totalParcelas: form.periodicidade === 'PARCELADA' ? Number(form.totalParcelas) : undefined,
      // Recorrência indefinida manda `null`: é a ausência de data final que
      // caracteriza "sem prazo", não um sentinela.
      recorrenciaFim:
        form.periodicidade === 'RECORRENTE' && form.duracao === 'ATE_DATA' && form.recorrenciaFim
          ? form.recorrenciaFim
          : null,
      dataVencimento: tipoNovo === 'DESPESA' ? (form.dataVencimento || form.data) : null,
      fornecedorId: tipoNovo === 'DESPESA' ? (form.fornecedorId || null) : null,
      condicaoId: tipoNovo === 'RECEITA' ? (form.condicaoId || null) : null,
      clienteId: tipoNovo === 'RECEITA' ? (form.clienteId || null) : null,
      gerarRecebivel: tipoNovo === 'RECEITA' && !editando && !!form.clienteId && form.gerarRecebivel,
    }

    const res = await fetch(
      editando ? `/api/financeiro/lancamentos/${editando.id}` : '/api/financeiro/lancamentos',
      {
        method: editando ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      },
    )

    if (res.ok) {
      fecharForm(); carregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar o lançamento.')
    }
    setSalvando(false)
  }

  async function excluir(l: Lancamento) {
    const emGrupo = !!l.grupoId
    const mensagem = emGrupo
      ? `Excluir TODAS as linhas de "${l.descricao}"?\n\nO lançamento foi cadastrado como ${PERIODICIDADE_LABEL[l.periodicidade].toLowerCase()} e gerou várias linhas. Os anexos vão junto.`
      : `Excluir o lançamento "${l.descricao}"?\n\nOs anexos vão junto.`
    if (!confirm(mensagem)) return

    const res = await fetch(
      `/api/financeiro/lancamentos/${l.id}${emGrupo ? '?grupo=1' : ''}`,
      { method: 'DELETE' },
    )
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível excluir.')
  }

  async function anexar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo || !anexosDe) return
    setErroAnexo('')

    // Barreira de tela. A do SERVIDOR é a que vale — esta só evita o upload
    // inteiro para receber um 409 no fim.
    if (anexosDe.anexos.length >= MAX_ANEXOS_LANCAMENTO) {
      setErroAnexo(`Este lançamento já tem ${MAX_ANEXOS_LANCAMENTO} anexos, que é o máximo. Remova um antes de enviar outro.`)
      e.target.value = ''
      return
    }

    const problema = validarArquivo(arquivo.name, arquivo.type, arquivo.size)
    if (problema) { setErroAnexo(problema); e.target.value = ''; return }

    setEnviando(true)
    setNomeEnviando(arquivo.name)
    const fd = new FormData()
    fd.append('arquivo', arquivo)
    const res = await fetch(`/api/financeiro/lancamentos/${anexosDe.id}/anexos`, {
      method: 'POST', body: fd,
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErroAnexo(d.error ?? 'Não foi possível anexar o arquivo.')
    } else {
      await carregar()
      const atualizado = await fetch(`/api/financeiro/lancamentos/${anexosDe.id}/anexos`)
      if (atualizado.ok) {
        const d = await atualizado.json()
        setAnexosDe((p) => (p ? { ...p, anexos: d.anexos } : p))
      }
    }
    setEnviando(false)
    setNomeEnviando('')
    e.target.value = ''
  }

  /**
   * Abre ou baixa o anexo.
   *
   * `baixar=false` ABRE o arquivo numa aba: o caso comum de um comprovante é
   * olhar, não guardar. A URL assinada vinha sempre com `download: true`, e o
   * efeito era que nenhuma foto e nenhum PDF podiam ser visualizados.
   */
  async function abrirAnexo(lancamentoId: string, anexoId: string, baixar: boolean) {
    setErroAnexo('')
    const res = await fetch(
      `/api/financeiro/lancamentos/${lancamentoId}/anexos/${anexoId}${baixar ? '?download=1' : ''}`,
    )
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErroAnexo(d.error ?? 'Não foi possível gerar o link do arquivo.')
      return
    }
    const d = await res.json()
    window.open(d.url, '_blank', 'noopener')
  }

  async function removerAnexo(lancamentoId: string, anexo: Anexo) {
    if (!confirm(`Remover o anexo ${anexo.documento.nome}?`)) return
    const res = await fetch(`/api/financeiro/lancamentos/${lancamentoId}/anexos/${anexo.id}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setErroAnexo('')
      setAnexosDe((p) => (p ? { ...p, anexos: p.anexos.filter((a) => a.id !== anexo.id) } : p))
      carregar()
    }
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'
  const cheio = !!anexosDe && anexosDe.anexos.length >= MAX_ANEXOS_LANCAMENTO

  return (
    <div className="space-y-8">
      <PageHeader
        title="Lançamentos"
        sub={formatMesRef(periodo)}
        actions={
          <div className="flex gap-2 items-center">
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
              aria-label="Período" className="bp-field w-auto" />
            {podeGerenciar && (
              <>
                <Button onClick={() => abrirNovo('RECEITA')}>+ Receita</Button>
                <Button variant="primary" onClick={() => abrirNovo('DESPESA')}>+ Despesa</Button>
              </>
            )}
          </div>
        }
      />

      {/* Receita | Despesa | Resultado — nesta ordem. O resultado é a
          consequência dos dois primeiros, e vem depois deles. */}
      <HairlineGrid cols={3}>
        <StatTile label="Receita" figura={figuraMoeda(resultado.receita)} />
        <StatTile label="Despesa" figura={figuraMoeda(resultado.despesa)} />
        <StatTile label="Resultado" figura={figuraMoeda(resultado.resultado)} primary
          note="Receita − Despesa" />
      </HairlineGrid>

      {/* Filtros: descrição, categoria, data e valor. */}
      <Panel padded={false}>
        <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input placeholder="Descrição…" value={filtro.descricao} className={inp + ' lg:col-span-2'}
            onChange={(e) => setFiltro((p) => ({ ...p, descricao: e.target.value }))} />
          <select value={filtro.categoriaId} className={inp}
            onChange={(e) => setFiltro((p) => ({ ...p, categoriaId: e.target.value }))}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} ({c.tipo === 'RECEITA' ? 'R' : 'D'})</option>
            ))}
          </select>
          <input type="date" value={filtro.de} aria-label="Data inicial" className={inp}
            onChange={(e) => setFiltro((p) => ({ ...p, de: e.target.value }))} />
          <input type="date" value={filtro.ate} aria-label="Data final" className={inp}
            onChange={(e) => setFiltro((p) => ({ ...p, ate: e.target.value }))} />
          <div className="flex gap-2">
            <input type="number" placeholder="Valor mín." value={filtro.valorMin} className={inp}
              onChange={(e) => setFiltro((p) => ({ ...p, valorMin: e.target.value }))} />
            <input type="number" placeholder="máx." value={filtro.valorMax} className={inp}
              onChange={(e) => setFiltro((p) => ({ ...p, valorMax: e.target.value }))} />
          </div>
        </div>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              {/* A DESCRIÇÃO tem teto de largura: ela é texto livre, e sem
                  limite um lançamento com descrição longa empurrava as
                  colunas de valor e ações para fora da tela. */}
              <Th className="pl-5 w-[clamp(12rem,32%,24rem)]">Descrição</Th>
              <Th className="w-[9rem]">Categoria</Th>
              <Th>Lançamento</Th>
              <Th>Vencimento</Th>
              <Th>Período</Th>
              <Th align="center">Status</Th>
              <Th align="right">Valor</Th>
              <Th align="right">Ações</Th>
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={8}>Carregando…</EmptyRow>
            ) : lancamentos.length === 0 ? (
              <EmptyRow colSpan={8}>Nenhum lançamento com esses filtros.</EmptyRow>
            ) : lancamentos.map((l) => (
              <Row key={l.id}>
                {/* DUAS LINHAS, as duas truncadas. `max-w-0` com `w-full` é o
                    que faz a célula respeitar o teto da coluna em vez de
                    crescer com o conteúdo — sem isso, `truncate` não corta
                    nada dentro de uma tabela. O título leva o texto inteiro. */}
                <Td className="pl-5 max-w-0">
                  <span className="block t-body font-medium text-fg bp-truncate" title={l.descricao}>
                    {l.descricao}
                  </span>
                  <span className="block t-label text-subtle mt-0.5 bp-truncate" title={contexto(l)}>
                    {contexto(l)}
                  </span>
                </Td>
                <Td className="max-w-0">
                  <Badge truncar title={l.categoria.nome}>{l.categoria.nome}</Badge>
                </Td>
                <Td className="text-subtle t-num">{formatDate(l.data)}</Td>
                <Td className="text-subtle t-num">
                  {l.dataVencimento ? formatDate(l.dataVencimento) : '—'}
                </Td>
                <Td className="t-sm text-muted">
                  {PERIODICIDADE_LABEL[l.periodicidade]}
                  {l.parcela && l.totalParcelas ? ` ${l.parcela}/${l.totalParcelas}` : ''}
                  {l.periodicidade === 'RECORRENTE' && (
                    <span className="block t-label text-subtle">
                      {l.recorrenteIndefinido
                        ? 'sem data final'
                        : l.recorrenciaFim ? `até ${formatDate(l.recorrenciaFim)}` : ''}
                    </span>
                  )}
                </Td>
                <Td align="center">
                  <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                </Td>
                <Td align="right" numeric className={l.tipo === 'RECEITA' ? 'text-pos font-medium' : 'text-fg font-medium'}>
                  {l.tipo === 'DESPESA' && '− '}{figuraMoeda(l.valor).completo}
                </Td>
                <Td align="right">
                  <span className="inline-flex gap-2">
                    {/* DETALHE da origem BaaS: a composição por produto, que
                        é o que responde "de onde veio esse valor". Só aparece
                        nas linhas que vêm de um Lançamento BaaS. */}
                    {origemBaas(l) && (
                      <Button size="sm" onClick={() => setDetalheBaas(origemBaas(l))}>
                        Detalhes
                      </Button>
                    )}
                    <Button size="sm" onClick={() => { setAnexosDe(l); setErroAnexo('') }}>
                      Anexos {l.anexos.length > 0 && `(${l.anexos.length})`}
                    </Button>
                    {podeGerenciar && (
                      <>
                        <Button size="sm" onClick={() => abrirEdicao(l)}>Editar</Button>
                        <Button size="sm" variant="danger" onClick={() => excluir(l)}>Excluir</Button>
                      </>
                    )}
                  </span>
                </Td>
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {/* ── Formulário ───────────────────────────────────────────────────── */}
      {tipoNovo && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && fecharForm()}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {editando ? 'Editar' : 'Novo'} lançamento · {tipoNovo === 'RECEITA' ? 'Receita' : 'Despesa'}
              </h2>
              <button onClick={fecharForm} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              <div>
                <label className={lbl} htmlFor="l-desc">Descrição *</label>
                <input id="l-desc" required value={form.descricao} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="l-cat">Categoria *</label>
                  <select id="l-cat" required value={form.categoriaId} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, categoriaId: e.target.value }))}>
                    <option value="">Selecione…</option>
                    {categoriasDoTipo(tipoNovo).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="l-valor">Valor (R$) *</label>
                  <input id="l-valor" required type="number" step="0.01" min="0.01" value={form.valor} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
                </div>

                <div>
                  <label className={lbl} htmlFor="l-data">Data de lançamento *</label>
                  <input id="l-data" required type="date" value={form.data} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, data: e.target.value }))} />
                  <p className="t-label text-subtle mt-1">Quando a despesa/receita foi registrada.</p>
                </div>

                {/* VENCIMENTO só existe em despesa — é o que alimenta Contas a
                    Pagar. Lançar não é vencer. */}
                {tipoNovo === 'DESPESA' ? (
                  <div>
                    <label className={lbl} htmlFor="l-venc">Data de vencimento *</label>
                    <input id="l-venc" required type="date" value={form.dataVencimento} className={inp}
                      min={form.data}
                      onChange={(e) => setForm((p) => ({ ...p, dataVencimento: e.target.value }))} />
                    <p className="t-label text-subtle mt-1">Alimenta Contas a Pagar.</p>
                  </div>
                ) : (
                  <div>
                    <label className={lbl} htmlFor="l-status">Status *</label>
                    <select id="l-status" value={form.status} className={inp}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Status }))}>
                      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                )}

                {tipoNovo === 'DESPESA' && (
                  <>
                    <div>
                      <label className={lbl} htmlFor="l-status-d">Status *</label>
                      <select id="l-status-d" value={form.status} className={inp}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Status }))}>
                        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={lbl} htmlFor="l-forn">Fornecedor</label>
                      <select id="l-forn" value={form.fornecedorId} className={inp}
                        onChange={(e) => setForm((p) => ({ ...p, fornecedorId: e.target.value }))}>
                        <option value="">Sem fornecedor</option>
                        {fornecedores.filter((f) => f.ativo).map((f) => (
                          <option key={f.id} value={f.id}>{f.razaoSocial}</option>
                        ))}
                      </select>
                      <p className="t-label text-subtle mt-1">Opcional.</p>
                    </div>
                  </>
                )}

                {/* CLIENTE — opcional, só em receita. É o que permite gerar o
                    título em Contas a Receber, que não cadastra por conta
                    própria. */}
                {tipoNovo === 'RECEITA' && !editando && (
                  <div className="sm:col-span-2 space-y-3">
                    <div>
                      <label className={lbl} htmlFor="l-cliente">Cliente</label>
                      <select id="l-cliente" value={form.clienteId} className={inp}
                        onChange={(e) => setForm((p) => ({
                          ...p, clienteId: e.target.value,
                          gerarRecebivel: e.target.value ? p.gerarRecebivel : false,
                        }))}>
                        <option value="">Sem cliente</option>
                        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>

                    <label className={`flex items-start gap-2.5 ${form.clienteId ? 'cursor-pointer' : 'opacity-50'}`}>
                      <input type="checkbox" className="mt-0.5" disabled={!form.clienteId}
                        checked={form.gerarRecebivel}
                        onChange={(e) => setForm((p) => ({ ...p, gerarRecebivel: e.target.checked }))} />
                      <span className="min-w-0">
                        <span className="block t-sm text-fg">Gerar título em Contas a Receber</span>
                        <span className="block t-label text-subtle mt-0.5">
                          Cria um título por parcela, com o vencimento de cada uma. Contas a Receber
                          não cadastra — é aqui que o recebível nasce.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {/* VÍNCULO DE BaaS / White Label — opcional, só em receita.
                    Alimenta "Receita por BaaS" e "Receita por White Label". */}
                {tipoNovo === 'RECEITA' && (
                  <div className="sm:col-span-2">
                    <label className={lbl} htmlFor="l-parceiro">BaaS / White Label</label>
                    <select id="l-parceiro" value={form.condicaoId} className={inp}
                      onChange={(e) => setForm((p) => ({ ...p, condicaoId: e.target.value }))}>
                      <option value="">Sem vínculo</option>
                      {parceiros.filter((c) => c.ativo).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nomeFantasia} ({c.tipo === 'BAAS' ? 'BaaS' : 'White Label'})
                        </option>
                      ))}
                    </select>
                    <p className="t-label text-subtle mt-1">
                      Opcional. Com vínculo, a receita entra em “Receita por BaaS / White Label”.
                    </p>
                  </div>
                )}
              </div>

              {/* Período só na criação: as linhas já existem depois disso. */}
              {!editando && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={lbl} htmlFor="l-per">Período *</label>
                    <select id="l-per" value={form.periodicidade} className={inp}
                      onChange={(e) => setForm((p) => ({ ...p, periodicidade: e.target.value as Periodicidade }))}>
                      {(Object.keys(PERIODICIDADE_LABEL) as Periodicidade[]).map((p) => (
                        <option key={p} value={p}>{PERIODICIDADE_LABEL[p]}</option>
                      ))}
                    </select>
                  </div>

                  {form.periodicidade === 'PARCELADA' && (
                    <div>
                      <label className={lbl} htmlFor="l-parcelas">Parcelas *</label>
                      <input id="l-parcelas" type="number" min="2" max="360" value={form.totalParcelas} className={inp}
                        onChange={(e) => setForm((p) => ({ ...p, totalParcelas: e.target.value }))} />
                      <p className="t-label text-subtle mt-1">O valor informado é o da parcela.</p>
                    </div>
                  )}

                  {/* RECORRÊNCIA: indefinida ou com data final. A data NUNCA é
                      obrigatória — aluguel e mensalidade não têm data de fim. */}
                  {form.periodicidade === 'RECORRENTE' && (
                    <div className="sm:col-span-2 space-y-3 border border-line rounded-xl p-4">
                      <p className="t-label text-subtle">Duração da recorrência</p>
                      <div className="flex flex-wrap gap-4">
                        <label className="inline-flex items-center gap-2 t-sm text-fg cursor-pointer">
                          <input type="radio" name="l-duracao" value="INDEFINIDA"
                            checked={form.duracao === 'INDEFINIDA'}
                            onChange={() => setForm((p) => ({ ...p, duracao: 'INDEFINIDA', recorrenciaFim: '' }))} />
                          Indefinida
                        </label>
                        <label className="inline-flex items-center gap-2 t-sm text-fg cursor-pointer">
                          <input type="radio" name="l-duracao" value="ATE_DATA"
                            checked={form.duracao === 'ATE_DATA'}
                            onChange={() => setForm((p) => ({ ...p, duracao: 'ATE_DATA' }))} />
                          Até uma data
                        </label>
                      </div>
                      {form.duracao === 'ATE_DATA' && (
                        <div>
                          <label className={lbl} htmlFor="l-recfim">Data final *</label>
                          <input id="l-recfim" required type="date" min={form.data}
                            value={form.recorrenciaFim} className={inp}
                            onChange={(e) => setForm((p) => ({ ...p, recorrenciaFim: e.target.value }))} />
                        </div>
                      )}
                      <p className="t-label text-subtle">
                        {form.duracao === 'INDEFINIDA'
                          ? 'Sem data final. O lançamento se repete mensalmente por prazo indeterminado.'
                          : 'O lançamento se repete mensalmente até o mês da data informada, inclusive.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className={lbl} htmlFor="l-obs">Observação</label>
                <textarea id="l-obs" rows={2} maxLength={1000} value={form.observacao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))} />
              </div>

              {erro && <p className="t-sm text-neg">{erro}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={fecharForm}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Anexos ───────────────────────────────────────────────────────── */}
      {detalheBaas && (
        <DetalheBaas l={detalheBaas} onFechar={() => setDetalheBaas(null)} />
      )}

      {anexosDe && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setAnexosDe(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-line flex-none">
              <div className="min-w-0">
                <h2 className="t-h2 text-fg bp-truncate">{anexosDe.descricao}</h2>
                <p className="t-sm text-muted mt-0.5">
                  Nota fiscal, comprovante, contrato, print · {anexosDe.anexos.length} de {MAX_ANEXOS_LANCAMENTO}
                </p>
              </div>
              <button onClick={() => setAnexosDe(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto">
              {erroAnexo && (
                <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erroAnexo}</div>
              )}

              {anexosDe.anexos.length === 0 ? (
                <p className="t-sm text-subtle">Nenhum arquivo anexado.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {anexosDe.anexos.map((a) => (
                    <li key={a.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                      <span className="min-w-0 flex-1">
                        <span className="block t-sm text-fg bp-truncate">{a.documento.nome}</span>
                        {/* TIPO e TAMANHO: o que o usuário precisa para saber
                            se é o arquivo certo antes de abrir. */}
                        <span className="block t-label text-subtle">
                          {rotuloTipo(a.documento.mime)} · {tamanhoLegivel(a.documento.tamanho)}
                        </span>
                      </span>
                      {VISUALIZAVEIS.includes(a.documento.mime) && (
                        <Button size="sm" onClick={() => abrirAnexo(anexosDe.id, a.id, false)}>
                          Visualizar
                        </Button>
                      )}
                      <Button size="sm" onClick={() => abrirAnexo(anexosDe.id, a.id, true)}>Baixar</Button>
                      {podeGerenciar && (
                        <Button size="sm" variant="danger" onClick={() => removerAnexo(anexosDe.id, a)}>
                          Remover
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {podeGerenciar && (
                <div className="pt-2">
                  <label className={lbl} htmlFor="l-arquivo">Anexar arquivo</label>
                  {/* `accept` filtra o seletor do sistema pelos formatos que o
                      servidor aceita — sem isso o usuário escolhe um .mov e
                      descobre a recusa depois do upload inteiro. */}
                  <input id="l-arquivo" type="file" disabled={enviando || cheio} onChange={anexar}
                    accept={EXTENSOES_ACEITAS.map((e) => `.${e}`).join(',')}
                    className="t-sm text-muted disabled:opacity-40" />
                  <p className="t-label text-subtle mt-1.5">
                    {cheio
                      ? `Limite de ${MAX_ANEXOS_LANCAMENTO} anexos atingido. Remova um arquivo para enviar outro.`
                      : `Fotos (JPG, PNG, WEBP) e PDF, entre outros: ${EXTENSOES_ACEITAS.join(', ')}. `
                        + `Máximo de ${MAX_ANEXOS_LANCAMENTO} por lançamento, até ${(TAMANHO_MAX / 1024 / 1024).toFixed(0)} MB cada.`}
                  </p>
                  {enviando && (
                    <p className="t-sm text-accent-soft mt-1.5" role="status">
                      Enviando {nomeEnviando}…
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
