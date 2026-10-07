'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * NAVEGAÇÃO PROFUNDA DA PREVISÃO.
 *
 * ── POR QUE SUB-ROTAS, E NÃO ABAS NUMA PÁGINA SÓ ────────────────────────
 *
 * Cadastros Financeiros usa abas com `?aba=` porque os três cadastros são
 * leves e se consultam alternando rápido. Aqui é o contrário: cada área da
 * Previsão é um painel com consultas próprias, gráficos próprios e, em três
 * delas, um formulário de lançamento.
 *
 * Rotas de verdade dão o que abas não dão:
 *
 *   - cada painel busca SÓ o que ele precisa, em vez de a tela carregar sete
 *     conjuntos de dados para mostrar um;
 *   - o Next trata cada uma como um componente de servidor próprio, com o seu
 *     `loading` e o seu `error` — um erro no forecast não derruba o orçamento;
 *   - o link de "Orçamento de novembro" é um endereço, não um estado.
 *
 * ── A ORDEM É A DA LEITURA ──────────────────────────────────────────────
 *
 *   Visão Geral      o retrato
 *   Orçamento        o teto que foi decidido
 *   Receitas         o que se espera entrar
 *   Despesas         o que se espera sair
 *   Fluxo de Caixa   o que sobra, mês a mês
 *   Centros de Custo quem está consumindo
 *   Forecast         para onde isso aponta
 *
 * Orçamento vem antes de receitas e despesas porque é o acordo; as duas são a
 * execução dele. Fluxo de caixa depois das duas, porque é a soma delas.
 * Forecast fecha: é a única que fala do futuro além do que foi cadastrado.
 */

export const AREAS_PREVISAO = [
  { href: '', label: 'Visão Geral' },
  { href: '/orcamento', label: 'Orçamento' },
  { href: '/receitas', label: 'Receitas Previstas' },
  { href: '/despesas', label: 'Despesas Futuras' },
  { href: '/fluxo-caixa', label: 'Fluxo de Caixa' },
  { href: '/centros-custo', label: 'Centros de Custo' },
  { href: '/forecast', label: 'Forecast' },
] as const

const RAIZ = '/dashboard/financeiro/previsao'

export default function PrevisaoNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Áreas da Previsão">
      {AREAS_PREVISAO.map((a) => {
        const rota = `${RAIZ}${a.href}`
        // A Visão Geral mora na RAIZ, então ela casa EXATAMENTE — sem isto ela
        // ficaria marcada como ativa em todas as sub-rotas, porque todas
        // começam com o seu caminho.
        const ativa = a.href === '' ? pathname === rota : pathname.startsWith(rota)
        return (
          <Link
            key={a.href || 'raiz'}
            href={rota}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'px-3.5 py-2 rounded-lg t-sm font-medium border',
              'transition-colors duration-[180ms] ease-bp',
              ativa
                ? 'border-accent/40 bg-accent/10 text-accent-soft'
                : 'border-line text-muted hover:border-line-2 hover:text-fg',
            )}
          >
            {a.label}
          </Link>
        )
      })}
    </nav>
  )
}
