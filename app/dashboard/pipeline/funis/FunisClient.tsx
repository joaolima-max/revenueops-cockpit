'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import type { FunilResumo } from '@/components/pipeline/tipos'

const FORM_VAZIO = { nome: '', descricao: '', area: '', exigeCliente: false }

export default function FunisClient() {
  const [funis, setFunis] = useState<FunilResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  const [modal, setModal] = useState<'novo' | FunilResumo | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    fetch('/api/pipeline/funis?incluirInativos=1')
      .then((r) => (r.ok ? r.json() : { funis: [] }))
      .then((d) => { if (vivo) setFunis(d.funis ?? []) })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [versao])

  function abrirNovo() { setForm(FORM_VAZIO); setErro(''); setModal('novo') }

  function abrirEdicao(f: FunilResumo) {
    setForm({ nome: f.nome, descricao: f.descricao ?? '', area: f.area ?? '', exigeCliente: f.exigeCliente })
    setErro(''); setModal(f)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const editando = modal !== 'novo' && modal !== null
    const res = await fetch(editando ? `/api/pipeline/funis/${modal.id}` : '/api/pipeline/funis', {
      method: editando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível salvar.')
      setSalvando(false)
      return
    }
    setModal(null); setSalvando(false); recarregar()
  }

  async function alternarAtivo(f: FunilResumo) {
    const acao = f.ativo ? 'Inativar' : 'Reativar'
    if (!confirm(`${acao} o funil ${f.nome}?\n\nNada é excluído — o histórico das movimentações é preservado.`)) return
    const res = await fetch(`/api/pipeline/funis/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !f.ativo }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível alterar o status.')
      return
    }
    recarregar()
  }

  async function moverOrdem(index: number, delta: number) {
    const alvo = index + delta
    if (alvo < 0 || alvo >= funis.length) return
    const ids = funis.map((f) => f.id)
    ;[ids[index], ids[alvo]] = [ids[alvo], ids[index]]
    const res = await fetch(`/api/pipeline/funis/${funis[index].id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordemFunis: ids }),
    })
    if (res.ok) recarregar()
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Funis"
        sub="Cada funil tem suas próprias etapas e alçadas de acesso. Funis não são excluídos — apenas inativados."
        actions={
          <>
            <Link href="/dashboard/pipeline"><Button>Voltar ao quadro</Button></Link>
            <Button variant="primary" onClick={abrirNovo}>+ Novo Funil</Button>
          </>
        }
      />

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : funis.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum funil criado"
            description="Crie o primeiro funil para começar a organizar o pipeline."
            action={<Button variant="primary" onClick={abrirNovo}>+ Novo Funil</Button>}
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead>
              <HeadRow>
                <Th>Funil</Th>
                <Th>Área</Th>
                <Th align="center">Exige cliente</Th>
                <Th align="center">Status</Th>
                <Th align="right">Ordem</Th>
                <Th align="right">Ações</Th>
              </HeadRow>
            </THead>
            <tbody>
              {funis.length === 0 ? (
                <EmptyRow colSpan={6}>Nenhum funil.</EmptyRow>
              ) : funis.map((f, i) => (
                <Row key={f.id} className={f.ativo ? undefined : 'opacity-60'}>
                  <Td className="text-fg font-medium">
                    {f.nome}
                    {f.descricao && <p className="t-sm text-subtle font-normal mt-0.5">{f.descricao}</p>}
                  </Td>
                  <Td>{f.area ?? <span className="text-subtle">—</span>}</Td>
                  <Td align="center">{f.exigeCliente ? 'Sim' : 'Não'}</Td>
                  <Td align="center">
                    <Badge tone={f.ativo ? 'pos' : 'neutral'}>{f.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </Td>
                  <Td align="right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="subtle" onClick={() => moverOrdem(i, -1)} disabled={i === 0} aria-label="Subir">↑</Button>
                      <Button size="sm" variant="subtle" onClick={() => moverOrdem(i, 1)} disabled={i === funis.length - 1} aria-label="Descer">↓</Button>
                    </div>
                  </Td>
                  <Td align="right">
                    <div className="inline-flex gap-2">
                      <Link href={`/dashboard/pipeline/funis/${f.id}`}><Button size="sm">Etapas e permissões</Button></Link>
                      <Button size="sm" onClick={() => abrirEdicao(f)}>Editar</Button>
                      <Button size="sm" variant={f.ativo ? 'danger' : 'subtle'} onClick={() => alternarAtivo(f)}>
                        {f.ativo ? 'Inativar' : 'Reativar'}
                      </Button>
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
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">{modal === 'novo' ? 'Novo Funil' : `Editar — ${modal.nome}`}</h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}

              <div>
                <label className={lbl} htmlFor="fn-nome">Nome *</label>
                <input id="fn-nome" required value={form.nome} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="fn-desc">Descrição</label>
                <textarea id="fn-desc" rows={2} maxLength={500} value={form.descricao} className={inp}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="fn-area">Área / departamento</label>
                <input id="fn-area" value={form.area} className={inp} placeholder="Ex.: Comercial, Operacional"
                  onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))} />
                <p className="t-sm text-subtle mt-1">Rótulo descritivo. Quem acessa o quê é definido em Permissões.</p>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.exigeCliente} className="mt-0.5"
                  onChange={(e) => setForm((p) => ({ ...p, exigeCliente: e.target.checked }))} />
                <span>
                  <span className="t-body text-fg">Exige cliente vinculado</span>
                  <span className="block t-sm text-subtle">Ao receber um card por transferência, o funil pede um cliente cadastrado.</span>
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
