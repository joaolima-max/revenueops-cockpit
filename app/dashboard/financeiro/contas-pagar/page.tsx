export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import ContasPagarClient from './ContasPagarClient'

export default async function ContasPagarPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.permissoes ?? null, 'view_financeiro', session.role)) {
    redirect('/dashboard')
  }

  return (
    <ContasPagarClient
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)}
    />
  )
}
