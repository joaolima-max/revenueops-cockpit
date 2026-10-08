import { redirect } from 'next/navigation'

/**
 * ROTA ANTIGA — virou a aba "Lançamentos" de Condições BaaS.
 *
 * Mesma razão de `financeiro/contas-pagar/page.tsx`: a rota esteve em
 * produção e continua existindo como redirecionamento.
 */
export default async function LancamentoBaasRedirect() {
  redirect('/dashboard/financeiro/condicoes-baas/lancamentos')
}
