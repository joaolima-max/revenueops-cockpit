'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import CategoriasPanel from '@/components/financeiro/CategoriasPanel'
import FornecedoresPanel from '@/components/financeiro/FornecedoresPanel'
import CentrosCustoPanel from '@/components/financeiro/CentrosCustoPanel'

/**
 * CADASTROS FINANCEIROS — navegação profunda em três abas.
 *
 * ── O QUE ESTA TELA RESOLVE ─────────────────────────────────────────────
 *
 * Categorias e Fornecedores ocupavam DOIS itens do sidebar, para dois
 * cadastros que se consultam juntos: ao classificar um fornecedor escolhe-se
 * uma categoria, e ao conferir uma despesa olha-se os dois. Eram dois cliques
 * de menu e duas telas para uma tarefa só.
 *
 * Agora é um item — "Cadastros Financeiros" — com navegação profunda. Centro
 * de Custo entra como terceira aba porque é da mesma natureza: cadastro que
 * classifica lançamento.
 *
 * NENHUMA FUNCIONALIDADE SAIU. Criar, editar, inativar, reativar, excluir e
 * buscar continuam exatamente como estavam em cada cadastro — os painéis são
 * os mesmos componentes, só sem o cabeçalho de página próprio.
 *
 * ── A ABA VIVE NA URL ───────────────────────────────────────────────────
 *
 * `?aba=categorias|fornecedores|centros-custo`, e não em `useState`. Três
 * razões, todas práticas:
 *
 *   1. recarregar a página não joga a pessoa de volta para a primeira aba;
 *   2. o link de uma aba específica pode ser compartilhado e favoritado;
 *   3. as rotas ANTIGAS (`/financeiro/categorias`, `/financeiro/fornecedores`)
 *      redirecionam para a aba correspondente, então um favorito antigo
 *      continua chegando onde chegava.
 *
 * `replace` e não `push`: trocar de aba não é navegar: encher o histórico
 * faria o botão "voltar" do navegador percorrer as abas uma a uma antes de
 * sair da tela.
 */

const ABAS = [
  {
    chave: 'categorias',
    label: 'Categorias',
    descricao: 'Como receitas e despesas são classificadas',
  },
  {
    chave: 'fornecedores',
    label: 'Fornecedores',
    descricao: 'Quem presta serviço à Bass Pago',
  },
  {
    chave: 'centros-custo',
    label: 'Centros de Custo',
    descricao: 'A área que consome ou gera o dinheiro',
  },
] as const

type Aba = typeof ABAS[number]['chave']

const PADRAO: Aba = 'categorias'

/** Interpreta `?aba=`. Valor desconhecido cai na primeira aba. */
function interpretar(valor: string | null): Aba {
  return ABAS.some((a) => a.chave === valor) ? (valor as Aba) : PADRAO
}

export default function CadastrosClient({
  podeGerenciarFinanceiro, podeGerenciarCentros,
}: {
  /** Alçada de Categorias e Fornecedores: `manage_financeiro`. */
  podeGerenciarFinanceiro: boolean
  /**
   * Alçada de Centros de Custo: `manage_financeiro` OU `manage_previsao`.
   *
   * É uma alçada DIFERENTE, não a mesma com outro nome: o centro de custo é
   * insumo do orçamento, então quem responde pelo planejamento precisa poder
   * criá-lo mesmo sem administrar o resto do Financeiro.
   */
  podeGerenciarCentros: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const aba = useMemo(() => interpretar(params.get('aba')), [params])

  const trocar = useCallback((proxima: Aba) => {
    const p = new URLSearchParams(params.toString())
    p.set('aba', proxima)
    router.replace(`${pathname}?${p}`, { scroll: false })
  }, [params, pathname, router])

  return (
    <div className="space-y-6">
      {/* AS ABAS. Mesma gramática visual do seletor de funis do Pipeline e do
          filtro de resultado: botão de fio, ativo marcado pelo accent. Não é
          um componente novo de design — é o padrão da casa. */}
      <div className="flex flex-wrap items-center gap-2" role="tablist"
        aria-label="Cadastros financeiros">
        {ABAS.map((a) => {
          const ativa = a.chave === aba
          return (
            <button
              key={a.chave}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => trocar(a.chave)}
              className={cn(
                'px-3.5 py-2 rounded-lg t-sm font-medium border text-left',
                'transition-colors duration-[180ms] ease-bp',
                ativa
                  ? 'border-accent/40 bg-accent/10 text-accent-soft'
                  : 'border-line text-muted hover:border-line-2 hover:text-fg',
              )}
            >
              {a.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">
        {aba === 'categorias' && (
          <CategoriasPanel podeGerenciar={podeGerenciarFinanceiro} />
        )}
        {aba === 'fornecedores' && (
          <FornecedoresPanel podeGerenciar={podeGerenciarFinanceiro} />
        )}
        {aba === 'centros-custo' && (
          <CentrosCustoPanel podeGerenciar={podeGerenciarCentros} />
        )}
      </div>
    </div>
  )
}
