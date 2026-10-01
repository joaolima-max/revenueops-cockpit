'use client'

import { useState, useEffect } from 'react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'
import { moedaCheia } from '@/lib/format-financeiro'

/**
 * PRODUTOS TARIFADOS de um parceiro — painel interno de Condições BaaS.
 *
 * Antes as tarifas eram DOIS CAMPOS FIXOS na condição: `pix` e `kyc`. Não dava
 * para cadastrar manutenção de conta, boleto, API ou o que mais o contrato
 * tivesse — e o Lançamento BaaS precisa listar todos.
 *
 * O PREÇO É MONETÁRIO, sempre. A única exceção percentual do cadastro é o
 * overprice, que mora na própria condição.
 *
 * ESTE É O ÚNICO LUGAR QUE DEFINE TARIFA. É daqui que o Lançamento BaaS lê o
 * preço, e por isso as colunas antigas saíram do formulário da condição:
 * mantê-las criaria duas fontes para o mesmo número, e editar a errada não
 * mudaria a tarifa aplicada.
 */

interface Produto {
  id: string
  nome: string
  preco: number
  unidade: string | null
  ativo: boolean
  ordem: number
}

interface Props {
  condicaoId: string
  condicaoNome: string
  podeGerenciar: boolean
  onFechar: () => void
}

/** Unidades sugeridas. Texto livre: o contrato pode cobrar por qualquer coisa. */
const UNIDADES = ['transação', 'consulta', 'conta', 'mês', 'boleto', 'documento']

const FORM_VAZIO = { nome: '', preco: '', unidade: 'transação' }

async function carregar(condicaoId: string): Promise<Produto[] | null> {
  try {
    const r = await fetch(`/api/financeiro/condicoes-baas/produtos?condicaoId=${condicaoId}`)
    if (!r.ok) return null
    const d = await r.json()
    return d.produtos ?? []
  } catch {
    return null
  }
}

export default function GerenciarProdutos({
  condicaoId, condicaoNome, podeGerenciar, onFechar,
}: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    carregar(condicaoId).then((lista) => {
      if (!vivo) return
      if (lista) setProdutos(lista)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [condicaoId, versao])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    const res = await fetch('/api/financeiro/condicoes-baas/produtos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        condicaoId,
        nome: form.nome.trim(),
        preco: Number(form.preco),
        unidade: form.unidade,
        ordem: (produtos.length + 1) * 10,
      }),
    })
    if (res.ok) { setForm(FORM_VAZIO); setVersao((v) => v + 1) }
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível cadastrar o produto.')
    }
    setSalvando(false)
  }

  async function reajustar(p: Produto) {
    const bruto = prompt(
      `Novo preço de ${p.nome} (R$ por ${p.unidade ?? 'transação'}):`,
      String(p.preco),
    )
    if (bruto === null) return
    const preco = Number(bruto.replace(',', '.'))
    if (!Number.isFinite(preco) || preco < 0) { setErro('Preço inválido.'); return }

    setErro('')
    const res = await fetch('/api/financeiro/condicoes-baas/produtos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, preco }),
    })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível reajustar.')
    }
  }

  async function alternarAtivo(p: Produto) {
    setErro('')
    const res = await fetch('/api/financeiro/condicoes-baas/produtos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    })
    if (res.ok) setVersao((v) => v + 1)
  }

  async function excluir(p: Produto) {
    if (!confirm(
      `Excluir o produto "${p.nome}"?\n\n`
      + 'Os lançamentos já feitos NÃO são afetados: cada um guarda nome e preço '
      + 'próprios (snapshot).',
    )) return
    setErro('')
    const res = await fetch(`/api/financeiro/condicoes-baas/produtos?id=${p.id}`, {
      method: 'DELETE',
    })
    if (res.ok) setVersao((v) => v + 1)
    else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível excluir.')
    }
  }

  const inp = 'bp-field'

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="min-w-0">
            <h2 className="t-h2 text-fg bp-truncate">Produtos tarifados</h2>
            <p className="t-sm text-muted mt-0.5">{condicaoNome}</p>
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
            <form onSubmit={criar} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_9rem_auto] gap-2">
              <input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do produto"
                className={inp}
              />
              {/* MONETÁRIO. Nunca texto livre: o Lançamento BaaS multiplica
                  este valor pelo volume. */}
              <input
                type="number" step="0.01" min="0"
                value={form.preco}
                onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
                placeholder="R$ 0,00"
                className={`${inp} text-right`}
              />
              <input
                list="unidades-produto"
                value={form.unidade}
                onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
                placeholder="por…"
                className={inp}
              />
              <datalist id="unidades-produto">
                {UNIDADES.map((u) => <option key={u} value={u} />)}
              </datalist>
              <Button type="submit" variant="primary"
                disabled={salvando || !form.nome.trim() || form.preco === ''}>
                {salvando ? '...' : 'Adicionar'}
              </Button>
            </form>
          )}

          {carregando ? (
            <p className="t-sm text-subtle">Carregando...</p>
          ) : produtos.length === 0 ? (
            <Panel padded={false}>
              <EmptyState compact
                title="Nenhum produto tarifado"
                description="Cadastre os produtos e preços acima. É daqui que o Lançamento BaaS carrega as tarifas — sem produto, não há o que tarifar." />
            </Panel>
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <HeadRow>
                    <Th>Produto</Th>
                    <Th align="right">Preço</Th>
                    <Th>Por</Th>
                    <Th>Status</Th>
                    <Th align="right">Ações</Th>
                  </HeadRow>
                </THead>
                <tbody>
                  {produtos.length === 0 ? (
                    <EmptyRow colSpan={5}>Nenhum produto.</EmptyRow>
                  ) : produtos.map((p) => (
                    <Row key={p.id} className={p.ativo ? undefined : 'opacity-60'}>
                      <Td className="text-fg font-medium">{p.nome}</Td>
                      <Td align="right" numeric>{moedaCheia(p.preco)}</Td>
                      <Td className="text-muted">{p.unidade ?? 'transação'}</Td>
                      <Td>
                        <Badge tone={p.ativo ? 'pos' : 'neutral'}>
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </Td>
                      <Td align="right">
                        {podeGerenciar && (
                          <span className="inline-flex gap-2">
                            <Button size="sm" onClick={() => reajustar(p)}>Reajustar</Button>
                            <Button size="sm" onClick={() => alternarAtivo(p)}>
                              {p.ativo ? 'Inativar' : 'Reativar'}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => excluir(p)}>
                              Excluir
                            </Button>
                          </span>
                        )}
                      </Td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            </TableShell>
          )}

          <p className="t-label text-subtle">
            Reajustar o preço NÃO altera lançamentos já feitos: cada item guarda nome e
            preço próprios. Produto inativo sai do formulário de lançamento e o histórico
            fica. O overprice é percentual e fica no cadastro da condição.
          </p>
        </div>
      </div>
    </div>
  )
}
