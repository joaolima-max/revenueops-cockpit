'use client'

import { useState, useEffect, useRef } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { DOCUMENTO_CATEGORIA_LABELS, formatDateTime, formatBytes } from '@/lib/utils'

interface Documento {
  id: string
  nome: string
  categoria: string
  mime: string
  tamanho: number
  descricao: string | null
  ativo: boolean
  createdAt: string
  cliente: { id: string; nome: string }
  enviadoPor: { name: string }
}

interface ClienteOpcao { id: string; nome: string }

const CATEGORIAS = Object.keys(DOCUMENTO_CATEGORIA_LABELS)

export default function DocumentosClient({ podeGerenciar, podeBaixar }: {
  podeGerenciar: boolean
  podeBaixar: boolean
}) {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [limites, setLimites] = useState<{ extensoes: string[]; tamanhoMax: number } | null>(null)
  const [storagePronto, setStoragePronto] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)

  const [busca, setBusca] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)

  const [modal, setModal] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [form, setForm] = useState({ clienteId: '', categoria: 'OUTROS', descricao: '' })
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = new URLSearchParams()
    if (filtroCliente) qs.set('clienteId', filtroCliente)
    if (filtroCategoria) qs.set('categoria', filtroCategoria)
    if (busca) qs.set('busca', busca)
    if (incluirInativos) qs.set('incluirInativos', '1')

    fetch(`/api/documentos?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setDocumentos(d.documentos ?? [])
        setLimites(d.limites ?? null)
        setStoragePronto(d.storagePronto !== false)
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [filtroCliente, filtroCategoria, busca, incluirInativos, versao])

  useEffect(() => {
    fetch('/api/clientes').then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => setClientes(d.clientes ?? [])).catch(() => {})
  }, [])

  /** XMLHttpRequest em vez de fetch: é o que dá barra de progresso e cancelamento. */
  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo || !form.clienteId) return

    setEnviando(true); setErro(''); setProgresso(0)

    const dados = new FormData()
    dados.append('arquivo', arquivo)
    dados.append('clienteId', form.clienteId)
    dados.append('categoria', form.categoria)
    dados.append('descricao', form.descricao)

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('POST', '/api/documentos')

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgresso(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      setEnviando(false)
      if (xhr.status >= 200 && xhr.status < 300) {
        setModal(false); setArquivo(null)
        setForm({ clienteId: '', categoria: 'OUTROS', descricao: '' })
        setVersao((v) => v + 1)
      } else {
        try { setErro(JSON.parse(xhr.responseText).error ?? 'Falha no envio.') }
        catch { setErro('Falha no envio.') }
      }
    }
    xhr.onerror = () => { setEnviando(false); setErro('Erro de conexão.') }
    xhr.onabort = () => { setEnviando(false); setErro('Envio cancelado.') }
    xhr.send(dados)
  }

  function cancelar() {
    xhrRef.current?.abort()
    xhrRef.current = null
  }

  async function baixar(doc: Documento) {
    const res = await fetch(`/api/documentos/${doc.id}/download`)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível gerar o link.')
      return
    }
    const { url } = await res.json()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function alternarAtivo(doc: Documento) {
    if (!confirm(`${doc.ativo ? 'Inativar' : 'Reativar'} "${doc.nome}"?\n\nO arquivo não é apagado — o registro é preservado.`)) return
    await fetch(`/api/documentos/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !doc.ativo }),
    })
    setVersao((v) => v + 1)
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'
  const filtro = 'bg-surface border border-line rounded-lg px-3 py-2 t-sm text-muted focus:outline-none focus:border-accent'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Documentos"
        sub="Arquivos privados do cliente. O bucket nunca é público: todo download passa por um link assinado de curta duração e fica registrado na auditoria."
        actions={podeGerenciar ? <Button variant="primary" onClick={() => { setErro(''); setModal(true) }}>+ Enviar documento</Button> : undefined}
      />

      {!storagePronto && (
        <div className="bg-warn/10 border border-warn/25 text-warn px-4 py-3 rounded-xl t-sm">
          Storage não configurado. Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> para habilitar upload e download.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..." aria-label="Buscar documento"
          className={`flex-1 min-w-[14rem] ${filtro} text-fg`} />
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} aria-label="Filtrar por cliente" className={filtro}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} aria-label="Filtrar por categoria" className={filtro}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{DOCUMENTO_CATEGORIA_LABELS[c]}</option>)}
        </select>
        <label className="flex items-center gap-2 t-sm text-muted cursor-pointer">
          <input type="checkbox" checked={incluirInativos} onChange={(e) => setIncluirInativos(e.target.checked)} />
          Incluir inativos
        </label>
      </div>

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : documentos.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum documento"
            description="Contratos, KYC/KYB, comprovantes e certificados do cliente ficam aqui."
            action={podeGerenciar ? <Button variant="primary" onClick={() => setModal(true)}>+ Enviar documento</Button> : undefined}
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th>Documento</Th>
                <Th>Cliente</Th>
                <Th>Categoria</Th>
                <Th align="right">Tamanho</Th>
                <Th>Enviado</Th>
                <Th align="right">Ações</Th>
              </HeadRow>
            </THead>
            <tbody>
              {documentos.length === 0 ? (
                <EmptyRow colSpan={6}>Nenhum resultado.</EmptyRow>
              ) : documentos.map((d) => (
                <Row key={d.id} className={d.ativo ? undefined : 'opacity-60'}>
                  <Td className="text-fg font-medium">
                    {d.nome}
                    {d.descricao && <p className="t-sm text-subtle font-normal mt-0.5">{d.descricao}</p>}
                    {!d.ativo && <Badge tone="neutral" className="mt-1">Inativo</Badge>}
                  </Td>
                  <Td>{d.cliente.nome}</Td>
                  <Td><Badge tone="neutral">{DOCUMENTO_CATEGORIA_LABELS[d.categoria] ?? d.categoria}</Badge></Td>
                  <Td align="right" numeric>{formatBytes(d.tamanho)}</Td>
                  <Td>
                    <span className="t-sm">{formatDateTime(d.createdAt)}</span>
                    <p className="t-label text-subtle mt-0.5">{d.enviadoPor.name}</p>
                  </Td>
                  <Td align="right">
                    <div className="inline-flex gap-2">
                      {podeBaixar && d.ativo && <Button size="sm" onClick={() => baixar(d)}>Baixar</Button>}
                      {podeGerenciar && (
                        <Button size="sm" variant={d.ativo ? 'danger' : 'subtle'} onClick={() => alternarAtivo(d)}>
                          {d.ativo ? 'Inativar' : 'Reativar'}
                        </Button>
                      )}
                    </div>
                  </Td>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableShell>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && !enviando && setModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Enviar documento</h2>
              <button onClick={() => !enviando && setModal(false)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>

            <form onSubmit={enviar} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              <div
                onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault(); setArrastando(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) setArquivo(f)
                }}
                className={`border border-dashed rounded-xl p-6 text-center transition-colors duration-[180ms] ${
                  arrastando ? 'border-accent bg-accent/5' : 'border-line-2'
                }`}
              >
                {arquivo ? (
                  <div>
                    <p className="t-body text-fg font-medium">{arquivo.name}</p>
                    <p className="t-sm text-subtle mt-0.5">{formatBytes(arquivo.size)}</p>
                    <button type="button" onClick={() => setArquivo(null)} className="t-label text-accent-soft hover:text-accent mt-2">
                      Trocar arquivo
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="t-sm text-muted">Arraste o arquivo aqui ou</p>
                    <label className="inline-block mt-2 cursor-pointer t-sm text-accent-soft hover:text-accent">
                      selecione do computador
                      <input type="file" className="sr-only"
                        accept={limites?.extensoes.map((e) => `.${e}`).join(',')}
                        onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                    </label>
                    {limites && (
                      <p className="t-label text-subtle mt-3">
                        {limites.extensoes.join(' · ')} · até {formatBytes(limites.tamanhoMax)}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className={lbl} htmlFor="doc-cliente">Cliente *</label>
                <select id="doc-cliente" required value={form.clienteId} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, clienteId: e.target.value }))}>
                  <option value="">Selecione o cliente</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="doc-cat">Categoria</label>
                <select id="doc-cat" value={form.categoria} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{DOCUMENTO_CATEGORIA_LABELS[c]}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="doc-desc">Descrição</label>
                <input id="doc-desc" value={form.descricao} className={inp} maxLength={500}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              {enviando && (
                <div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progresso}%` }} />
                  </div>
                  <p className="t-label text-subtle mt-1.5 tabular-nums">{progresso}% enviado</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                {enviando ? (
                  <Button type="button" variant="danger" onClick={cancelar}>Cancelar envio</Button>
                ) : (
                  <>
                    <Button type="button" onClick={() => setModal(false)}>Cancelar</Button>
                    <Button type="submit" variant="primary" disabled={!arquivo || !form.clienteId}>Enviar</Button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
