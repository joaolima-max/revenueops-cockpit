'use client'

import { useState, useCallback, useEffect } from 'react'
import PageHeader from '@/components/dashboard/PageHeader'
import Panel, { PanelHeader } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'

type Natureza = 'FLOAT' | 'SETUP' | 'SUSTENTACAO'

interface Categoria {
  id: string
  nome: string
  tipo: 'RECEITA' | 'DESPESA'
  /** Só em receita. Ver o comentário do componente. */
  natureza: Natureza | null
  ativo: boolean
}

const NATUREZA_LABEL: Record<Natureza, string> = {
  FLOAT: 'Float', SETUP: 'Setup', SUSTENTACAO: 'Sustentação',
}
const NATUREZAS = Object.keys(NATUREZA_LABEL) as Natureza[]

const TIPOS = [
  { valor: 'RECEITA' as const, titulo: 'Receita', descricao: 'Como a entrada é classificada.' },
  { valor: 'DESPESA' as const, titulo: 'Despesa', descricao: 'Como a saída é classificada.' },
]

/**
 * Categorias de receita e de despesa.
 *
 * O tipo não é editável depois de criado: mudá-lo reclassificaria de receita
 * para despesa todo lançamento já feito com a categoria.
 *
 * NATUREZA é o que faz uma categoria de receita ser reconhecida pelos gráficos
 * financeiros como Float, Setup ou Sustentação. É um campo, e não o nome
 * digitado: renomear "Float" para "Float / rendimento" não quebra o gráfico, e
 * duas categorias podem compartilhar a mesma natureza.
 *
 * Sustentação tem uma consequência a mais: havendo lançamento real com essa
 * natureza no período, ele SUBSTITUI a sustentação derivada do cadastro de
 * BaaS/White Label — é a regra que evita contar o mesmo dinheiro duas vezes.
 */
export default function CategoriasClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [novo, setNovo] = useState<Record<string, string>>({ RECEITA: '', DESPESA: '' })
  const [novaNatureza, setNovaNatureza] = useState<'' | Natureza>('')
  const [salvando, setSalvando] = useState('')
  const [erro, setErro] = useState('')

  // Buscar e aplicar são separados de propósito: dentro do efeito o estado só
  // é tocado no `.then`, nunca de forma síncrona, e o `vivo` evita escrever em
  // componente já desmontado.
  const buscar = useCallback(async (): Promise<Categoria[]> => {
    const res = await fetch('/api/financeiro/categorias')
    if (!res.ok) return []
    const d = await res.json()
    return d.categorias as Categoria[]
  }, [])

  const carregar = useCallback(async () => {
    setCategorias(await buscar())
    setCarregando(false)
  }, [buscar])

  useEffect(() => {
    let vivo = true
    buscar().then((lista) => {
      if (!vivo) return
      setCategorias(lista)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [buscar])

  async function criar(tipo: 'RECEITA' | 'DESPESA') {
    const nome = novo[tipo].trim()
    if (!nome) return
    setSalvando(tipo); setErro('')
    const res = await fetch('/api/financeiro/categorias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome, tipo,
        natureza: tipo === 'RECEITA' && novaNatureza ? novaNatureza : null,
      }),
    })
    if (res.ok) {
      setNovo((p) => ({ ...p, [tipo]: '' }))
      setNovaNatureza('')
      await carregar()
    } else {
      const d = await res.json().catch(() => ({}))
      setErro(d.error ?? 'Não foi possível criar a categoria.')
    }
    setSalvando('')
  }

  async function definirNatureza(c: Categoria, natureza: '' | Natureza) {
    setErro('')
    const res = await fetch(`/api/financeiro/categorias/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ natureza: natureza || null }),
    })
    if (res.ok) carregar()
    else setErro('Não foi possível alterar a natureza da categoria.')
  }

  async function alternarAtivo(c: Categoria) {
    const res = await fetch(`/api/financeiro/categorias/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (res.ok) carregar()
  }

  async function excluir(c: Categoria) {
    if (!confirm(`Excluir a categoria ${c.nome}?`)) return
    const res = await fetch(`/api/financeiro/categorias/${c.id}`, { method: 'DELETE' })
    if (res.ok) { carregar(); return }
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'Não foi possível excluir.')
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Categorias"
        sub="Como receitas e despesas são classificadas nos lançamentos. A natureza de uma categoria de receita é o que a torna Float, Setup ou Sustentação para os gráficos financeiros."
      />

      {erro && <p className="t-sm text-neg">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {TIPOS.map(({ valor, titulo, descricao }) => {
          const daLista = categorias.filter((c) => c.tipo === valor)
          return (
            <Panel key={valor} padded={false}>
              <div className="p-5 sm:p-6 pb-3">
                <PanelHeader title={titulo} sub={descricao} />
              </div>

              {podeGerenciar && (
                <div className="px-5 sm:px-6 pb-4 flex gap-2">
                  <input
                    value={novo[valor]}
                    onChange={(e) => setNovo((p) => ({ ...p, [valor]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criar(valor) } }}
                    placeholder={valor === 'RECEITA' ? 'Ex.: Tarifas' : 'Ex.: Infraestrutura'}
                    className="bp-field flex-1"
                  />
                  {valor === 'RECEITA' && (
                    <select value={novaNatureza} aria-label="Natureza"
                      className="bp-field w-auto"
                      onChange={(e) => setNovaNatureza(e.target.value as '' | Natureza)}>
                      <option value="">Sem natureza</option>
                      {NATUREZAS.map((n) => (
                        <option key={n} value={n}>{NATUREZA_LABEL[n]}</option>
                      ))}
                    </select>
                  )}
                  <Button variant="primary" disabled={salvando === valor || !novo[valor].trim()}
                    onClick={() => criar(valor)}>
                    {salvando === valor ? '...' : 'Adicionar'}
                  </Button>
                </div>
              )}

              {carregando ? (
                <p className="px-5 sm:px-6 pb-6 t-sm text-subtle">Carregando…</p>
              ) : daLista.length === 0 ? (
                <EmptyState compact title="Nenhuma categoria"
                  description={`Crie a primeira categoria de ${titulo.toLowerCase()}.`} />
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {daLista.map((c) => (
                    <li key={c.id} className="px-5 sm:px-6 py-3 flex items-center gap-3">
                      <span className={`t-body flex-1 bp-truncate ${c.ativo ? 'text-fg' : 'text-subtle line-through'}`}>
                        {c.nome}
                      </span>
                      {!c.ativo && <Badge>Inativa</Badge>}
                      {c.natureza && <Badge tone="accent">{NATUREZA_LABEL[c.natureza]}</Badge>}
                      {podeGerenciar && (
                        <span className="inline-flex gap-2 items-center">
                          {valor === 'RECEITA' && (
                            <select value={c.natureza ?? ''} aria-label={`Natureza de ${c.nome}`}
                              className="bp-field w-auto py-1.5 t-sm"
                              onChange={(e) => definirNatureza(c, e.target.value as '' | Natureza)}>
                              <option value="">Sem natureza</option>
                              {NATUREZAS.map((n) => (
                                <option key={n} value={n}>{NATUREZA_LABEL[n]}</option>
                              ))}
                            </select>
                          )}
                          <Button size="sm" onClick={() => alternarAtivo(c)}>
                            {c.ativo ? 'Inativar' : 'Reativar'}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => excluir(c)}>Excluir</Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
