export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import LancamentoBaasClient from './LancamentoBaasClient'

export default async function LancamentoBaasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.permissoes ?? null, 'view_receita', session.role)) {
    redirect('/dashboard')
  }
  return <LancamentoBaasClient />
}
