'use client'

import { useState, useCallback, useEffect } from 'react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'

interface Categoria { id: string; nome: string; tipo: string }

interface Fornecedor {
  id: string
  razaoSocial: string
  cnpj: string | null
  chavePix: string | null
  descricaoServico: string | null
  ativo: boolean
  categoria: Categoria | null
}

const FORM_VAZIO = {
  razaoSocial: '', cnpj: '', chavePix: '', descricaoServico: '', categoriaId: '',
}

/**
 * FORNECEDORES — aba de Financeiro › Cadastros Financeiros.
 *
 * Era uma PÁGINA própria e virou aba, pela mesma razão de Categorias: os dois
 * cadastros se consultam juntos, e ocupavam dois itens do sidebar para isso.
 * Nenhuma funcionalidade saiu — criar, editar, inativar, reativar, excluir e
 * buscar continuam exatamente como estavam.
 *
 * Cadastro de fornecedor: razão social, CNPJ, chave PIX, serviço e categoria.
 */
export default function FornecedoresPanel({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<{ id?: string } | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Buscar e aplicar separados: dentro do efeito o estado só é tocado no
  // `.then`, e `vivo` evita escrever em componente já desmontado.
  const buscar = useCallback(async (): Promise<Fornecedor[]> => {
    const p = new URLSearchParams({ incluirInativos: '1' })
    if (busca) p.set('search', busca)
    const res = await fetch(`/api/financeiro/fornecedores?${p}`)
    if (!res.ok) return []
    const d = await res.json()
    return d.fornecedores as Fornecedor[]
  }, [busca])

  const carregar = useCallback(async () => {
    setFornecedores(await buscar())
    setCarregando(false)
  }, [buscar])

  useEffect(() => {
    let vivo = true
    buscar().then((lista) => {
      if (!vivo) return
      setFornecedores(lista)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [buscar])

  useEffect(() => {
    // Só despesas: fornecedor presta serviço, não gera receita.
    let vivo = true
    fetch('/api/financeiro/categorias?tipo=DESPESA')
      .then((r) => (r.ok ? r.json() : { categorias: [] }))
      .then((d) => { if (vivo) setCategorias(d.categorias ?? []) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  function abrirNovo() {
    setForm(FORM_VAZIO); setErro(''); setModal({})
  }

  function abrirEdicao(f: Fornecedor) {
    setForm({
      razaoSocial: f.razaoSocial,
      cnpj: f.cnpj ?? '',
      chavePix: f.chavePix ?? '',
      descricaoServico: f.descricaoServico ?? '',
      categoriaId: f.categoria?.id ?? '',
    })
    setErro('')
    setModal({ id: f.id })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSalvando(true); setErro('')

    const res = await fetch(
      modal.id ? `/api/financeiro/fornecedores/${modal.id}` : '/api/financeiro/fornecedores',
      {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, categoriaId: form.categoriaId || null }),
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

  async function alternarAtivo(f: Fornecedor) {
    const res = await fetch(`/api/financeiro/fornecedores/${f.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !f.ativo }),
    })
    if (res.ok) carregar()
  }

  async function excluir(f: Fornecedor) {
    if (!confirm(`Excluir o fornecedor ${f.razaoSocial}?\n\nPara manter o cadastro fora de uso sem apagá-lo, use Inativar.`)) return
    const res = await fetch(`/api/financeiro/fornecedores/${f.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível excluir.')
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'

  return (
    <div className="space-y-6">
      {/* A AÇÃO fica aqui, e não no cabeçalho da página: "Novo fornecedor" só
          faz sentido na aba de Fornecedores, e no cabeçalho ela apareceria
          também sobre Categorias e Centros de Custo. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="t-sm text-muted">
          {fornecedores.filter((f) => f.ativo).length} ativos · quem presta serviço
          à Bass Pago e aparece nas despesas.
        </p>
        {podeGerenciar && (
          <Button variant="primary" onClick={abrirNovo}>Novo fornecedor</Button>
        )}
      </div>

      <Panel padded={false}>
        <div className="p-3">
          <input
            type="text" placeholder="Buscar por razão social, CNPJ ou serviço…"
            value={busca} onChange={(e) => setBusca(e.target.value)}
            className="bp-field w-full"
          />
        </div>
      </Panel>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Razão Social</Th>
              <Th>CNPJ</Th>
              <Th>Chave PIX</Th>
              <Th>Serviço</Th>
              <Th>Categoria</Th>
              {podeGerenciar && <Th align="right">Ações</Th>}
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={podeGerenciar ? 6 : 5}>Carregando…</EmptyRow>
            ) : fornecedores.length === 0 ? (
              <EmptyRow colSpan={podeGerenciar ? 6 : 5}>Nenhum fornecedor cadastrado.</EmptyRow>
            ) : fornecedores.map((f) => (
              <Row key={f.id}>
                <Td className="pl-5">
                  <span className={`block t-body font-medium ${f.ativo ? 'text-fg' : 'text-subtle'}`}>
                    {f.razaoSocial}
                  </span>
                  {!f.ativo && <Badge>Inativo</Badge>}
                </Td>
                <Td className="t-mono text-subtle">{f.cnpj || '—'}</Td>
                <Td className="t-mono text-subtle">{f.chavePix || '—'}</Td>
                <Td className="t-sm text-muted">{f.descricaoServico || '—'}</Td>
                <Td>{f.categoria ? <Badge>{f.categoria.nome}</Badge> : <span className="text-subtle">—</span>}</Td>
                {podeGerenciar && (
                  <Td align="right">
                    <span className="inline-flex gap-2">
                      <Button size="sm" onClick={() => abrirEdicao(f)}>Editar</Button>
                      <Button size="sm" variant={f.ativo ? 'danger' : 'subtle'} onClick={() => alternarAtivo(f)}>
                        {f.ativo ? 'Inativar' : 'Reativar'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => excluir(f)}>Excluir</Button>
                    </span>
                  </Td>
                )}
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">{modal.id ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              <div>
                <label className={lbl} htmlFor="f-razao">Razão Social *</label>
                <input id="f-razao" required value={form.razaoSocial} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, razaoSocial: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="f-cnpj">CNPJ</label>
                  <input id="f-cnpj" value={form.cnpj} className={inp} placeholder="00.000.000/0001-00"
                    onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl} htmlFor="f-pix">Chave PIX</label>
                  <input id="f-pix" value={form.chavePix} className={inp}
                    onChange={(e) => setForm((p) => ({ ...p, chavePix: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={lbl} htmlFor="f-servico">Descrição do serviço</label>
                <textarea id="f-servico" rows={2} value={form.descricaoServico} className={inp + ' resize-none'}
                  maxLength={500}
                  onChange={(e) => setForm((p) => ({ ...p, descricaoServico: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="f-cat">Categoria</label>
                <select id="f-cat" value={form.categoriaId} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, categoriaId: e.target.value }))}>
                  <option value="">Selecione…</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

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
    </div>
  )
}
