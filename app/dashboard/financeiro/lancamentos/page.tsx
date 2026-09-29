export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import LancamentosClient from './LancamentosClient'

export default async function LancamentosPage() {
  const session = await getSession()
  const podeGerenciar = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)

  return <LancamentosClient podeGerenciar={podeGerenciar} />
}
