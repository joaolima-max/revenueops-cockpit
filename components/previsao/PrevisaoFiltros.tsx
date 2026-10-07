'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'

/**
 * FILTROS GLOBAIS DA PREVISÃO.
 *
 * ── OS FILTROS VIVEM NA URL ─────────────────────────────────────────────
 *
 * E não em `useState`. Quatro razões, todas práticas:
 *
 *   1. as páginas são Server Components e leem os filtros de `searchParams` —
 *      o dado filtrado vem do SERVIDOR, não de um recorte feito no navegador;
 *   2. recarregar não perde o recorte;
 *   3. "despesa de Tecnologia no trimestre" é um endereço que se compartilha;
 *   4. navegar entre as sete áreas PRESERVA o filtro, porque ele viaja na URL
 *      — sem isto, trocar de Orçamento para Fluxo de Caixa zeraria a seleção e
 *      a pessoa refaria o recorte em cada área.
 *
 * ── `push` E NÃO `replace`, AQUI ────────────────────────────────────────
 *
 * Ao contrário das abas de Cadastros, filtrar É navegar: a pessoa que filtrou
 * por um centro de custo e abriu o detalhe espera que "voltar" devolva a lista
 * filtrada. Com `replace`, o botão voltar a tiraria da tela inteira.
 */

/** As janelas que a tela oferece. Espelho de `JANELAS_MESES` em lib/previsao. */
const JANELAS = [
  { valor: 1, label: 'Mês' },
  { valor: 3, label: 'Trimestre' },
  { valor: 12, label: 'Ano' },
] as const

const TIPOS = [
  { valor: '', label: 'Receita e despesa' },
  { valor: 'RECEITA', label: 'Receita' },
  { valor: 'DESPESA', label: 'Despesa' },
] as const

interface Opcao { id: string; nome: string }

export interface OpcoesFiltro {
  centrosCusto: Opcao[]
  categorias: Array<Opcao & { tipo: string }>
  fornecedores: Opcao[]
  parceiros: Opcao[]
}

/**
 * O período de referência, em "YYYY-MM". O padrão é o mês corrente, calculado
 * no CLIENTE apenas como valor inicial do campo — quem apura é o servidor, que
 * tem o seu próprio padrão. Os dois concordam porque ambos usam o mês corrente
 * em UTC.
 */
function mesCorrente(): string {
  const h = new Date()
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function PrevisaoFiltros({
  opcoes,
  /**
   * Quais filtros esta área usa.
   *
   * Nem toda área usa os seis: Fluxo de Caixa não filtra por tipo (ele mostra
   * entradas E saídas por definição), e Centros de Custo não filtra por centro
   * de custo (ele os lista todos). Mostrar um filtro que a área ignora é pior
   * que não mostrar: a pessoa seleciona e nada muda.
   */
  usa = ['periodo', 'janela', 'tipo', 'centroCusto', 'categoria'],
}: {
  opcoes: OpcoesFiltro
  usa?: Array<'periodo' | 'janela' | 'tipo' | 'centroCusto' | 'categoria' | 'fornecedor' | 'parceiro'>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const atual = useMemo(() => ({
    periodo: params.get('periodo') ?? mesCorrente(),
    meses: Number(params.get('meses') ?? 1),
    tipo: params.get('tipo') ?? '',
    centroCustoId: params.get('centroCustoId') ?? '',
    categoriaId: params.get('categoriaId') ?? '',
    fornecedorId: params.get('fornecedorId') ?? '',
    condicaoId: params.get('condicaoId') ?? '',
  }), [params])

  const aplicar = useCallback((mudancas: Record<string, string>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v)
      // Valor vazio REMOVE o parâmetro em vez de gravar "": uma URL com
      // `tipo=` seria recusada pela validação do servidor, que espera
      // RECEITA ou DESPESA.
      else p.delete(k)
    }
    router.push(`${pathname}?${p}`)
  }, [params, pathname, router])

  const temFiltro = !!(
    atual.tipo || atual.centroCustoId || atual.categoriaId
    || atual.fornecedorId || atual.condicaoId || atual.meses !== 1
  )

  const campo = 'bp-field'
  const rotulo = 'bp-field-label'

  /** As categorias oferecidas respeitam o tipo já escolhido. */
  const categorias = atual.tipo
    ? opcoes.categorias.filter((c) => c.tipo === atual.tipo)
    : opcoes.categorias

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {usa.includes('periodo') && (
          <div className="min-w-[10rem]">
            <label className={rotulo} htmlFor="pv-periodo">Período</label>
            {/* ── O CAMPO É NÃO CONTROLADO, E O `key` O RESSINCRONIZA ──────
                `<input type="month">` dispara `onChange` a cada tecla:
                navegar a cada dígito faria seis requisições para digitar
                "2026-11". Então o commit acontece no BLUR ou no Enter.

                Para isso o campo precisa guardar o que está sendo digitado sem
                que a URL mande nele — ou seja, não controlado, com
                `defaultValue`.

                O `key` é o que faz a sincronização no sentido inverso: quando
                a URL muda por outro caminho (o botão "Limpar filtros", o voltar
                do navegador, um link colado), o `key` muda e o React REMONTA o
                input com o novo `defaultValue`.

                É o padrão que a própria documentação do React recomenda para
                "resetar estado quando uma prop muda" — e substitui um
                `useEffect` com `setState`, que causa renderização em cascata a
                cada navegação. */}
            <input
              key={atual.periodo}
              id="pv-periodo"
              type="month"
              defaultValue={atual.periodo}
              onBlur={(e) => {
                const v = e.target.value
                if (v && v !== atual.periodo) aplicar({ periodo: v })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className={campo}
            />
          </div>
        )}

        {usa.includes('janela') && (
          <div>
            <span className={rotulo}>Janela</span>
            <div className="flex items-center gap-1" role="group" aria-label="Janela">
              {JANELAS.map((j) => (
                <button
                  key={j.valor}
                  type="button"
                  onClick={() => aplicar({ meses: String(j.valor) })}
                  aria-pressed={atual.meses === j.valor}
                  className={cn(
                    'px-3 py-2 rounded-lg t-sm font-medium border whitespace-nowrap',
                    'transition-colors duration-[180ms] ease-bp',
                    atual.meses === j.valor
                      ? 'border-accent/40 bg-accent/10 text-accent-soft'
                      : 'border-line text-muted hover:border-line-2 hover:text-fg',
                  )}
                >
                  {j.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {usa.includes('tipo') && (
          <div className="min-w-[11rem]">
            <label className={rotulo} htmlFor="pv-tipo">Tipo</label>
            <select id="pv-tipo" value={atual.tipo} className={campo}
              onChange={(e) => aplicar({
                tipo: e.target.value,
                // Trocar o tipo INVALIDA a categoria escolhida: uma categoria
                // de despesa com tipo RECEITA devolveria lista vazia, e a
                // pessoa veria "sem dados" sem entender por quê.
                categoriaId: '',
              })}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {usa.includes('centroCusto') && (
          <div className="min-w-[12rem]">
            <label className={rotulo} htmlFor="pv-cc">Centro de custo</label>
            <select id="pv-cc" value={atual.centroCustoId} className={campo}
              onChange={(e) => aplicar({ centroCustoId: e.target.value })}>
              <option value="">Todos</option>
              {opcoes.centrosCusto.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}

        {usa.includes('categoria') && (
          <div className="min-w-[12rem]">
            <label className={rotulo} htmlFor="pv-cat">Categoria</label>
            <select id="pv-cat" value={atual.categoriaId} className={campo}
              onChange={(e) => aplicar({ categoriaId: e.target.value })}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}

        {usa.includes('fornecedor') && (
          <div className="min-w-[12rem]">
            <label className={rotulo} htmlFor="pv-forn">Fornecedor</label>
            <select id="pv-forn" value={atual.fornecedorId} className={campo}
              onChange={(e) => aplicar({ fornecedorId: e.target.value })}>
              <option value="">Todos</option>
              {opcoes.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
        )}

        {usa.includes('parceiro') && (
          <div className="min-w-[12rem]">
            <label className={rotulo} htmlFor="pv-parc">BaaS / White Label</label>
            <select id="pv-parc" value={atual.condicaoId} className={campo}
              onChange={(e) => aplicar({ condicaoId: e.target.value })}>
              <option value="">Todos</option>
              {opcoes.parceiros.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        )}

        {temFiltro && (
          <Button size="sm" onClick={() => router.push(pathname)}>Limpar filtros</Button>
        )}
      </div>
    </div>
  )
}
