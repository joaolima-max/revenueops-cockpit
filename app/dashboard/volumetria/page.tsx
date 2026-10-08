import { redirect } from 'next/navigation'

/**
 * ROTA ANTIGA — virou a aba "Volumetria" de Clientes.
 *
 * Mesma razão de `financeiro/contas-pagar/page.tsx`: a rota esteve em
 * produção e continua existindo como redirecionamento.
 */
export default async function VolumetriaRedirect() {
  redirect('/dashboard/carteira/volumetria')
}
