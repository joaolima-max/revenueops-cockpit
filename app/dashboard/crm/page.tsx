export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CrmClient from './CrmClient'

export default async function CrmPage() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'view_crm', session.role)) {
    redirect('/dashboard')
  }
  return <CrmClient />
}
