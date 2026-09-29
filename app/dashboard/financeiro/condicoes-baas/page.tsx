export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CondicoesClient from './CondicoesClient'

export default async function CondicoesBaasPage() {
  const session = await getSession()
  const podeGerenciar = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)

  return <CondicoesClient podeGerenciar={podeGerenciar} />
}
