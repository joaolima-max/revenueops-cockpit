'use client'

import { useState, useEffect } from 'react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'

/**
 * GERENCIAR SEGMENTOS — painel interno da Carteira.
 *
 * Não é um ambiente: é o cadastro de uma taxonomia que o Comercial e a
 * Carteira usam. Mesmo padrão de "Gerenciar funis" dentro do Pipeline.
 *
 * EXCLUIR só vale para segmento SEM USO. Com cliente, lead ou card vinculado,
 * a exclusão é recusada e a saída é INATIVAR: o segmento sai dos seletores e
 * o vínculo histórico fica. Apagar zeraria o segmento desses registros pelo
 * `ON DELETE SET NULL` — perdendo a informação de que aquele cliente era
 * daquele segmento.
 */

interface Segmento {
  id: string
  nome: string
  slug: string
  ativo: boolean
  ordem: number
  _count: { clientes: number; leads: number; deals: number }
}

async function carregarSegmentos(): Promise<{ segmentos: Segmento[]; podeGerenciar: boolean } | null> {
  try {
    const r = await fetch('/api/segmentos?todos=1')
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export default function GerenciarSegmentos({ onFechar }: { onFechar: () => void }) {
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [podeGerenciar, setPodeGerenciar] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    carregarSegmentos().then((d) => {
      if (!vivo) return
      if (d) { setSegmentos(d.segmentos); setPodeGerenciar(d.podeGerenciar) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [versao])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const nome = novo.trim()
    if (!nome) return
    setSalvando(true); setErro('')

    const res = await fetch('/api/segmentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    })
    if (res.ok) { setNovo(''); setVersao((v) => v + 1) }
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar o segmento.')
    }
    setSalvando(false)
  }

  async function renomear(s: Segmento) {
    const nome = prompt('Novo nome do segmento:', s.nome)?.trim()
    if (!nome || nome === s.nome) return
    setErro('')
    const res = await fetch('/api/segmentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, nome }),
    })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível renomear.')
    }
  }

  async function alternarAtivo(s: Segmento) {
    setErro('')
    const res = await fetch('/api/segmentos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, ativo: !s.ativo }),
    })
    if (res.ok) setVersao((v) => v + 1)
  }

  async function excluir(s: Segmento) {
    if (!confirm(`Excluir o segmento "${s.nome}"?`)) return
    setErro('')
    const res = await fetch(`/api/segmentos?id=${s.id}`, { method: 'DELETE' })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível excluir.')
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div>
            <h2 className="t-h2 text-fg">Segmentos</h2>
            <p className="t-sm text-muted mt-0.5">
              Usados em Clientes, Leads, Pipeline e na Visão geral do Comercial.
            </p>
          </div>
          <button onClick={onFechar} className="text-subtle hover:text-fg" aria-label="Fechar">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {erro && (
            <div className="rounded-lg border border-neg/25 bg-neg/10 px-3 py-2">
              <p className="t-sm text-neg">{erro}</p>
            </div>
          )}

          {podeGerenciar && (
            <form onSubmit={criar} className="flex gap-2 flex-wrap">
              <input
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                placeholder="Nome do novo segmento"
                className="bp-field flex-1 min-w-[12rem]"
              />
              <Button type="submit" variant="primary" disabled={salvando || !novo.trim()}>
                {salvando ? 'Criando...' : 'Criar'}
              </Button>
            </form>
          )}

          {carregando ? (
            <p className="t-sm text-subtle">Carregando...</p>
          ) : segmentos.length === 0 ? (
            <Panel padded={false}>
              <EmptyState compact title="Nenhum segmento cadastrado"
                description="Crie o primeiro acima. Os segmentos aparecem nos seletores de Clientes, Leads e Pipeline." />
            </Panel>
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <HeadRow>
                    <Th>Segmento</Th>
                    <Th>Em uso</Th>
                    <Th>Status</Th>
                    <Th align="right">Ações</Th>
                  </HeadRow>
                </THead>
                <tbody>
                  {segmentos.length === 0 ? (
                    <EmptyRow colSpan={4}>Nenhum segmento.</EmptyRow>
                  ) : segmentos.map((s) => {
                    const usos = s._count.clientes + s._count.leads + s._count.deals
                    return (
                      <Row key={s.id} className={s.ativo ? undefined : 'opacity-60'}>
                        <Td>
                          <span className="block t-body font-medium text-fg">{s.nome}</span>
                          <span className="t-mono text-subtle">{s.slug}</span>
                        </Td>
                        <Td>
                          {usos === 0 ? (
                            <span className="t-sm text-subtle">não usado</span>
                          ) : (
                            <span className="inline-flex flex-wrap gap-1.5">
                              {s._count.clientes > 0 && <Badge>{s._count.clientes} cliente(s)</Badge>}
                              {s._count.leads > 0 && <Badge>{s._count.leads} lead(s)</Badge>}
                              {s._count.deals > 0 && <Badge>{s._count.deals} card(s)</Badge>}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={s.ativo ? 'pos' : 'neutral'}>
                            {s.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </Td>
                        <Td align="right">
                          {podeGerenciar && (
                            <span className="inline-flex gap-2">
                              <Button size="sm" onClick={() => renomear(s)}>Renomear</Button>
                              <Button size="sm" onClick={() => alternarAtivo(s)}>
                                {s.ativo ? 'Inativar' : 'Reativar'}
                              </Button>
                              {/* EXCLUIR só aparece quando não há uso: com
                                  vínculo, a saída é inativar, e oferecer um
                                  botão que vai ser recusado é ruído. */}
                              {usos === 0 && (
                                <Button size="sm" variant="danger" onClick={() => excluir(s)}>
                                  Excluir
                                </Button>
                              )}
                            </span>
                          )}
                        </Td>
                      </Row>
                    )
                  })}
                </tbody>
              </Table>
            </TableShell>
          )}

          <p className="t-label text-subtle">
            Segmento em uso não pode ser excluído — inative-o. O vínculo histórico dos
            clientes, leads e cards é preservado, e ele sai dos seletores.
          </p>
        </div>
      </div>
    </div>
  )
}
