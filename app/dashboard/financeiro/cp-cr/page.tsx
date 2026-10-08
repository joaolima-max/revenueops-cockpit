export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CpCrNav from '@/components/financeiro/CpCrNav'
import ContasPagarClient from './ContasPagarClient'

/**
 * CP / CR — a tela de entrada é CONTAS A PAGAR.
 *
 * É a vista com prazo: um título a pagar vencido tem consequência imediata,
 * e é por isso que ela abre o módulo. A alçada é a mesma das três abas
 * (`view_financeiro` para ler, `manage_financeiro` para lançar) — ela não
 * mudou ao consolidar os menus.
 */
export default async function CpCrPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.permissoes ?? null, 'view_financeiro', session.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-8">
      <CpCrNav />
      <ContasPagarClient
        podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)}
      />
    </div>
  )
}
