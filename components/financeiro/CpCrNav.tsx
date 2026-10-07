import SubNav from '@/components/ui/SubNav'

/**
 * NAVEGAÇÃO PROFUNDA DE CP / CR.
 *
 * ── TRÊS VISTAS DE UMA BASE SÓ ──────────────────────────────────────────
 *
 * Contas a Pagar, Contas a Receber e Lançamentos eram três menus do
 * Financeiro para o MESMO `LancamentoFinanceiro`. O que muda entre elas é a
 * pergunta, não a tabela:
 *
 *   Contas a Pagar     as despesas pelo VENCIMENTO — o que sai e quando
 *   Contas a Receber   as receitas pelo VENCIMENTO — o que entra e quando
 *   Lançamentos        o registro pela COMPETÊNCIA — o que foi lançado
 *
 * Três itens no sidebar faziam o usuário escolher a aba antes de saber qual
 * delas responde à sua pergunta, e obrigavam a sair do módulo para conferir
 * o lançamento que originou um título. Agora é um item e três abas.
 *
 * ── A ORDEM ─────────────────────────────────────────────────────────────
 *
 * Pagar primeiro porque é a vista cobrada todo dia — é ela que tem prazo. O
 * registro vem por último: é a base, e se consulta quando se quer o detalhe
 * de uma das duas vistas acima.
 */

export const AREAS_CP_CR = [
  { href: '', label: 'Contas a Pagar' },
  { href: '/receber', label: 'Contas a Receber' },
  { href: '/lancamentos', label: 'Lançamentos' },
] as const

export const RAIZ_CP_CR = '/dashboard/financeiro/cp-cr'

export default function CpCrNav() {
  return <SubNav raiz={RAIZ_CP_CR} areas={AREAS_CP_CR} rotulo="Áreas de CP / CR" />
}
