'use client'

import SubNav from '@/components/ui/SubNav'

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
 *
 * ── A APARÊNCIA MORA EM `SubNav` ────────────────────────────────────────
 *
 * Quatro módulos têm navegação profunda hoje (Previsão, CP / CR, Condições
 * BaaS e Clientes). O markup e a regra de "qual aba está ativa" são de
 * `components/ui/SubNav`; aqui ficam só a raiz e a lista de áreas.
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
  return <SubNav raiz={RAIZ} areas={AREAS_PREVISAO} rotulo="Áreas da Previsão" />
}
