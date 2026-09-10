export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import ComplianceClient from './ComplianceClient'

export default async function CompliancePage() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'view_compliance', session.role)) {
    redirect('/dashboard')
  }
  return (
    <ComplianceClient
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_compliance', session.role)}
    />
  )
}
