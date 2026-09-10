export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import AutomacoesClient from './AutomacoesClient'

export default async function AutomacoesPage() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'manage_automations', session.role)) {
    redirect('/dashboard')
  }
  return <AutomacoesClient />
}
