export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CondicoesBaasNav from '@/components/financeiro/CondicoesBaasNav'
import CondicoesClient from './CondicoesClient'

export default async function CondicoesBaasPage() {
  const session = await getSession()
  const podeGerenciar = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)

  return (
    <div className="space-y-8">
      <CondicoesBaasNav
        podeVerLancamentos={!!session &&
          hasPermission(session.permissoes ?? null, 'view_receita', session.role)}
      />
      <CondicoesClient podeGerenciar={podeGerenciar} />
    </div>
  )
}
