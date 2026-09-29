export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import FornecedoresClient from './FornecedoresClient'

export default async function FornecedoresPage() {
  const session = await getSession()
  const podeGerenciar = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)

  return <FornecedoresClient podeGerenciar={podeGerenciar} />
}
