'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td } from '@/components/ui/DataTable'
import { formatPercent, formatDateTime } from '@/lib/utils'

interface Versao {
  id: string; versao: number; publicadaEm: string | null
  _count: { respostas: number; links: number }
}

interface Formulario {
  id: string; nome: string; descricao: string | null; ativo: boolean
  updatedAt: string
  criadoPor: { name: string }
  versoes: Versao[]
}

interface Painel {
  enviados: number; respostas: number
  taxaResposta: number | null; taxaConclusao: number | null
  porStatus: Array<{ status: string; total: number }>
}

export default function FormulariosClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [formularios, setFormularios] = useState<Formulario[]>([])
  const [painel, setPainel] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ nome: '', descricao: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    fetch('/api/formularios?incluirInativos=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return
        setFormularios(d.formularios ?? [])
        setPainel(d.painel ?? null)
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [versao])

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro('')
    const res = await fetch('/api/formularios', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar.'); setSalvando(false); return
    }
    setModal(false); setForm({ nome: '', descricao: '' }); setSalvando(false); setVersao((v) => v + 1)
  }

  const inp = 'w-full bg-bg border border-line rounded-lg px-3 py-2 t-body text-fg focus:outline-none focus:border-accent'
  const lbl = 'block t-label text-subtle mb-1.5'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Formulários"
        sub="Construtor visual com versionamento. Publicada e respondida, uma versão vira imutável — editar cria a próxima."
        actions={podeGerenciar ? <Button variant="primary" onClick={() => { setErro(''); setModal(true) }}>+ Novo formulário</Button> : undefined}
      />

      {painel && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            { l: 'Links gerados', v: String(painel.enviados) },
            { l: 'Respostas', v: String(painel.respostas) },
            { l: 'Taxa de resposta', v: painel.taxaResposta === null ? '—' : formatPercent(painel.taxaResposta, 0) },
            { l: 'Taxa de conclusão', v: painel.taxaConclusao === null ? '—' : formatPercent(painel.taxaConclusao, 0) },
          ].map((c) => (
            <Panel key={c.l} className="!p-4">
              <p className="t-label text-subtle">{c.l}</p>
              <p className="t-h2 text-fg mt-1.5 tabular-nums">{c.v}</p>
            </Panel>
          ))}
        </div>
      )}

      {carregando ? (
        <p className="t-sm text-subtle">Carregando...</p>
      ) : formularios.length === 0 ? (
        <Panel padded={false}>
          <EmptyState
            title="Nenhum formulário"
            description="Monte campos, seções, anexos, aceite e assinatura — e compartilhe por link externo."
            action={podeGerenciar ? <Button variant="primary" onClick={() => setModal(true)}>+ Novo formulário</Button> : undefined}
          />
        </Panel>
      ) : (
        <TableShell>
          <Table>
            <THead><HeadRow>
              <Th>Formulário</Th><Th align="right">Versões</Th>
              <Th align="right">Respostas</Th><Th align="right">Links</Th>
              <Th align="center">Status</Th><Th align="right">Ações</Th>
            </HeadRow></THead>
            <tbody>
              {formularios.map((f) => {
                const respostas = f.versoes.reduce((s, v) => s + v._count.respostas, 0)
                const links = f.versoes.reduce((s, v) => s + v._count.links, 0)
                const publicadas = f.versoes.filter((v) => v.publicadaEm).length
                return (
                  <Row key={f.id} className={f.ativo ? undefined : 'opacity-60'}>
                    <Td className="text-fg font-medium">
                      {f.nome}
                      {f.descricao && <p className="t-sm text-subtle font-normal mt-0.5">{f.descricao}</p>}
                      <p className="t-label text-subtle mt-0.5">
                        {f.criadoPor.name} · {formatDateTime(f.updatedAt)}
                      </p>
                    </Td>
                    <Td align="right" numeric>{f.versoes.length} <span className="text-subtle">({publicadas} pub.)</span></Td>
                    <Td align="right" numeric>{respostas}</Td>
                    <Td align="right" numeric>{links}</Td>
                    <Td align="center"><Badge tone={f.ativo ? 'pos' : 'neutral'}>{f.ativo ? 'Ativo' : 'Inativo'}</Badge></Td>
                    <Td align="right">
                      <Link href={`/dashboard/formularios/${f.id}`}>
                        <Button size="sm">{podeGerenciar ? 'Abrir construtor' : 'Ver'}</Button>
                      </Link>
                    </Td>
                  </Row>
                )
              })}
            </tbody>
          </Table>
        </TableShell>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">Novo formulário</h2>
              <button onClick={() => setModal(false)} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={criar} className="p-5 space-y-4">
              {erro && <div className="bg-neg/10 border border-neg/25 text-neg px-3 py-2 rounded-lg t-sm">{erro}</div>}
              <div>
                <label className={lbl} htmlFor="f-nome">Nome *</label>
                <input id="f-nome" required value={form.nome} className={inp} maxLength={160}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="f-desc">Descrição</label>
                <textarea id="f-desc" rows={2} value={form.descricao} className={inp} maxLength={500}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando}>{salvando ? 'Criando...' : 'Criar'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
