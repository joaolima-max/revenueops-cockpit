'use client'

import { useState, useCallback, useEffect } from 'react'
import Panel from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { TableShell, Table, THead, HeadRow, Th, Row, Td, EmptyRow } from '@/components/ui/DataTable'

interface CentroCusto {
  id: string
  nome: string
  codigo: string | null
  descricao: string | null
  ativo: boolean
}

const FORM_VAZIO = { nome: '', codigo: '', descricao: '' }

/**
 * CENTROS DE CUSTO — aba de Financeiro › Cadastros Financeiros.
 *
 * ── A ESTRUTURA É PLANA ─────────────────────────────────────────────────
 *
 * Sem pai, sem árvore, sem rateio. Centro de custo hierárquico obriga a
 * decidir, em cada tela, se o número de um nó inclui os filhos — e essa
 * decisão volta a ser tomada a cada consulta, com respostas diferentes. A
 * taxonomia de Categorias, nesta mesma página, é plana pelo mesmo motivo.
 *
 * ── ONDE O CENTRO DE CUSTO É USADO ──────────────────────────────────────
 *
 * Em dois lugares, e os dois importam:
 *
 *   1. no LANÇAMENTO financeiro — é por ele que o realizado é atribuído a uma
 *      área, e é o que faz Orçado × Realizado existir;
 *   2. no ORÇAMENTO, na despesa futura e na receita prevista.
 *
 * Por isso o cadastro mora aqui, com Categorias e Fornecedores, e não dentro
 * de Previsão: ele é insumo dos lançamentos também, e um cadastro escondido
 * dentro do módulo de planejamento ficaria longe de quem classifica a despesa
 * do dia.
 *
 * ── EXCLUIR É O ÚLTIMO RECURSO ──────────────────────────────────────────
 *
 * Com qualquer vínculo, a API recusa e manda INATIVAR. Apagar um centro com
 * histórico apagaria a atribuição de área de lançamentos já feitos, e o
 * Orçado × Realizado de períodos fechados mudaria de valor retroativamente.
 */
export default function CentrosCustoPanel({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<{ id?: string } | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Buscar e aplicar separados, como nos outros painéis: dentro do efeito o
  // estado só é tocado no `.then`, e `vivo` evita escrever em componente já
  // desmontado.
  const buscar = useCallback(async (): Promise<CentroCusto[]> => {
    // `incluirInativos`: esta é a tela de cadastro, e sem os inativos não há
    // como reativar um centro desligado por engano.
    const res = await fetch('/api/financeiro/centros-custo?incluirInativos=1')
    if (!res.ok) return []
    const d = await res.json()
    return d.centros as CentroCusto[]
  }, [])

  const carregar = useCallback(async () => {
    setCentros(await buscar())
    setCarregando(false)
  }, [buscar])

  useEffect(() => {
    let vivo = true
    buscar().then((lista) => {
      if (!vivo) return
      setCentros(lista)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [buscar])

  function abrirNovo() {
    setForm(FORM_VAZIO); setErro(''); setModal({})
  }

  function abrirEdicao(c: CentroCusto) {
    setForm({ nome: c.nome, codigo: c.codigo ?? '', descricao: c.descricao ?? '' })
    setErro('')
    setModal({ id: c.id })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!modal) return
    setSalvando(true); setErro('')

    const res = await fetch(
      modal.id ? `/api/financeiro/centros-custo/${modal.id}` : '/api/financeiro/centros-custo',
      {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  async function alternarAtivo(c: CentroCusto) {
    const res = await fetch(`/api/financeiro/centros-custo/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (res.ok) carregar()
  }

  async function excluir(c: CentroCusto) {
    if (!confirm(
      `Excluir o centro de custo ${c.nome}?\n\n`
      + 'Só é possível excluir um centro que nada referencia. Para tirá-lo dos '
      + 'formulários preservando o histórico, use Inativar.',
    )) return

    const res = await fetch(`/api/financeiro/centros-custo/${c.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    // A recusa da API já diz quantos vínculos existem e o que fazer.
    alert(d.error ?? 'Não foi possível excluir.')
  }

  const inp = 'bp-field'
  const lbl = 'bp-field-label'
  const ativos = centros.filter((c) => c.ativo).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="t-sm text-muted">
          {ativos} {ativos === 1 ? 'ativo' : 'ativos'} · a área que consome ou gera o
          dinheiro. Usado nos lançamentos e no orçamento.
        </p>
        {podeGerenciar && (
          <Button variant="primary" onClick={abrirNovo}>Novo centro de custo</Button>
        )}
      </div>

      <TableShell>
        <Table>
          <THead>
            <HeadRow>
              <Th className="pl-5">Centro de custo</Th>
              <Th>Código</Th>
              <Th>Descrição</Th>
              {podeGerenciar && <Th align="right">Ações</Th>}
            </HeadRow>
          </THead>
          <tbody>
            {carregando ? (
              <EmptyRow colSpan={podeGerenciar ? 4 : 3}>Carregando…</EmptyRow>
            ) : centros.length === 0 ? (
              <EmptyRow colSpan={podeGerenciar ? 4 : 3}>
                Nenhum centro de custo cadastrado. Sem ele, o orçamento não tem onde ser lançado.
              </EmptyRow>
            ) : centros.map((c) => (
              <Row key={c.id}>
                <Td className="pl-5">
                  <span className={`block t-body font-medium ${c.ativo ? 'text-fg' : 'text-subtle'}`}>
                    {c.nome}
                  </span>
                  {!c.ativo && <Badge>Inativo</Badge>}
                </Td>
                <Td className="t-mono text-subtle">{c.codigo || '—'}</Td>
                <Td className="t-sm text-muted">{c.descricao || '—'}</Td>
                {podeGerenciar && (
                  <Td align="right">
                    <span className="inline-flex gap-2">
                      <Button size="sm" onClick={() => abrirEdicao(c)}>Editar</Button>
                      <Button size="sm" variant={c.ativo ? 'danger' : 'subtle'}
                        onClick={() => alternarAtivo(c)}>
                        {c.ativo ? 'Inativar' : 'Reativar'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => excluir(c)}>Excluir</Button>
                    </span>
                  </Td>
                )}
              </Row>
            ))}
          </tbody>
        </Table>
      </TableShell>

      <Panel>
        <p className="t-sm text-subtle">
          A estrutura é <span className="text-fg">plana</span>: sem centro de custo pai e
          sem rateio. Um centro hierárquico obrigaria cada tela a decidir se o número
          de uma área inclui as subordinadas — e a decisão voltaria a ser tomada em
          cada consulta.
        </p>
      </Panel>

      {modal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface border border-line-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="t-h2 text-fg">
                {modal.id ? 'Editar centro de custo' : 'Novo centro de custo'}
              </h2>
              <button onClick={() => setModal(null)} className="text-subtle hover:text-fg"
                aria-label="Fechar">✕</button>
            </div>
            <form onSubmit={salvar} className="p-5 space-y-4">
              <div>
                <label className={lbl} htmlFor="cc-nome">Nome *</label>
                <input id="cc-nome" required maxLength={80} value={form.nome} className={inp}
                  placeholder="Ex.: Comercial"
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label className={lbl} htmlFor="cc-codigo">Código</label>
                <input id="cc-codigo" maxLength={12} value={form.codigo} className={inp}
                  placeholder="Ex.: COM"
                  onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} />
                <p className="t-label text-subtle/70 mt-1">
                  Opcional e apenas descritivo — aparece ao lado do nome em listas apertadas.
                </p>
              </div>
              <div>
                <label className={lbl} htmlFor="cc-desc">Descrição</label>
                <textarea id="cc-desc" rows={2} maxLength={500} value={form.descricao}
                  className={inp + ' resize-none'}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} />
              </div>

              {erro && <p className="t-sm text-neg">{erro}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" onClick={() => setModal(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" disabled={salvando || !form.nome.trim()}>
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
