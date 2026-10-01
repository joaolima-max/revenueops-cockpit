'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import {
  TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow,
} from '@/components/ui/DataTable'
import { formatDate } from '@/lib/utils'
import { descarteTexto } from '@/lib/leads'

/**
 * LIXEIRA DE LEADS.
 *
 * Excluir um lead passou a significar movê-lo para cá. O registro sai da
 * lista, da busca e do seletor do Pipeline, e o HISTÓRICO FICA: os cards por
 * onde ele passou continuam existindo e apontando para ele — é isso que as
 * contagens de cada linha mostram.
 *
 * Restaurar existe porque descartar por engano é comum, e a alternativa seria
 * recadastrar o lead: dois registros para a mesma empresa, e o vínculo com os
 * cards antigos perdido.
 */

interface LeadDescartado {
  id: string
  name: string
  company: string | null
  cnpj: string | null
  email: string | null
  status: string
  createdAt: string
  deletedAt: string
  owner: { id: string; name: string }
  deletedBy: { id: string; name: string } | null
  segmentoComercial: { id: string; nome: string } | null
  _count: { deals: number; comentarios: number; activities: number }
}

/** Busca na lixeira. Devolve dado ou motivo — nunca estoura. */
async function buscar(termo: string): Promise<{ leads: LeadDescartado[]; erro?: string }> {
  try {
    const r = await fetch(`/api/leads/lixeira${termo ? `?busca=${encodeURIComponent(termo)}` : ''}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { leads: [], erro: d?.error ?? 'Não foi possível carregar a lixeira.' }
    return { leads: d.leads ?? [] }
  } catch {
    return { leads: [], erro: 'Não foi possível carregar a lixeira. Verifique a conexão.' }
  }
}

export default function LixeiraClient() {
  const [leads, setLeads] = useState<LeadDescartado[]>([])
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)

  /**
   * BUSCAR e APLICAR separados.
   *
   * `setCarregando(true)` no corpo do efeito dispara render em cascata, e o
   * React Compiler recusa. O estado só é tocado no `.then`, já com o `vivo`
   * guardando contra a resposta de uma busca que o usuário abandonou.
   */
  useEffect(() => {
    let vivo = true
    buscar(termo)
      .then((r) => {
        if (!vivo) return
        if (r.erro) { setErro(r.erro); setLeads([]) } else { setErro(''); setLeads(r.leads) }
        setCarregando(false)
      })
    return () => { vivo = false }
  }, [termo, versao])

  async function restaurar(l: LeadDescartado) {
    if (!confirm(
      `Restaurar ${l.company ?? l.name}?\n\n`
      + 'O lead volta para a lista, para a busca e para o seletor do Pipeline.',
    )) return

    const res = await fetch('/api/leads/lixeira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: l.id }),
    })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'Não foi possível restaurar.')
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Lixeira de Leads"
        sub="Leads descartados. O registro sai das listagens e o histórico fica inteiro — os cards por onde o lead passou continuam existindo."
        actions={<Link href="/dashboard/leads"><Button>Voltar para Leads</Button></Link>}
      />

      {erro && (
        <Panel padded={false}>
          <EmptyState title="Acesso restrito" description={erro} />
        </Panel>
      )}

      {!erro && (
        <>
          <form
            className="flex flex-wrap gap-3"
            onSubmit={(e) => { e.preventDefault(); setTermo(busca.trim()) }}
          >
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa, executivo, CNPJ ou e-mail…"
              className="bp-field max-w-sm"
            />
            <Button type="submit">Buscar</Button>
            {termo && (
              <Button onClick={() => { setBusca(''); setTermo('') }}>Limpar</Button>
            )}
          </form>

          {carregando ? (
            <p className="t-sm text-subtle">Carregando...</p>
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <HeadRow>
                    <Th>Empresa</Th>
                    <Th>Executivo</Th>
                    <Th>CNPJ</Th>
                    <Th>Segmento</Th>
                    <Th>Histórico preservado</Th>
                    <Th>Descartado</Th>
                    <Th align="right">Ações</Th>
                  </HeadRow>
                </THead>
                <tbody>
                  {leads.length === 0 ? (
                    <EmptyRow colSpan={7}>
                      {termo
                        ? 'Nenhum lead descartado corresponde à busca.'
                        : 'A lixeira está vazia.'}
                    </EmptyRow>
                  ) : leads.map((l) => (
                    <Row key={l.id}>
                      <Td>
                        <span className="block t-body font-medium text-fg">
                          {l.company ?? <span className="text-subtle">—</span>}
                        </span>
                        <span className="t-label text-subtle">
                          Criado em {formatDate(l.createdAt)} por {l.owner.name}
                        </span>
                      </Td>
                      <Td className="text-muted">{l.name}</Td>
                      <Td className="text-muted">{l.cnpj ?? <span className="text-subtle">—</span>}</Td>
                      <Td className="text-muted">
                        {l.segmentoComercial?.nome ?? <span className="text-subtle">—</span>}
                      </Td>
                      <Td>
                        {/* A prova de que nada foi apagado. */}
                        <span className="inline-flex flex-wrap gap-1.5">
                          {l._count.deals > 0 && (
                            <Badge tone="accent">{l._count.deals} card{l._count.deals === 1 ? '' : 's'}</Badge>
                          )}
                          {l._count.comentarios > 0 && (
                            <Badge tone="neutral">{l._count.comentarios} coment.</Badge>
                          )}
                          {l._count.activities > 0 && (
                            <Badge tone="neutral">{l._count.activities} ativ.</Badge>
                          )}
                          {l._count.deals === 0 && l._count.comentarios === 0 && l._count.activities === 0 && (
                            <span className="t-sm text-subtle">sem histórico</span>
                          )}
                        </span>
                      </Td>
                      <Td className="text-muted t-sm">{descarteTexto(l)}</Td>
                      <Td align="right">
                        <Button size="sm" onClick={() => restaurar(l)}>Restaurar</Button>
                      </Td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableShell>
          )}
        </>
      )}
    </div>
  )
}
