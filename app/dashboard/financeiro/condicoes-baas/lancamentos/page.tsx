export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CondicoesBaasNav from '@/components/financeiro/CondicoesBaasNav'
import LancamentoBaasClient from './LancamentoBaasClient'

/**
 * LANÇAMENTOS — a apuração mensal do parceiro BaaS / White Label.
 *
 * A alçada é `view_receita`, exatamente a que a tela exigia como menu próprio
 * (`/dashboard/lancamento-baas`). Ela não mudou ao virar aba: a apuração é
 * dado de receita, e quem não pode ver receita não a abre.
 */
export default async function LancamentoBaasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.permissoes ?? null, 'view_receita', session.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="space-y-8">
      <CondicoesBaasNav podeVerLancamentos />
      <LancamentoBaasClient />
    </div>
  )
}
