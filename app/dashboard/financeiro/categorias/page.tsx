export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CategoriasClient from './CategoriasClient'

export default async function CategoriasPage() {
  const session = await getSession()
  const podeGerenciar = !!session &&
    hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)

  return <CategoriasClient podeGerenciar={podeGerenciar} />
}
