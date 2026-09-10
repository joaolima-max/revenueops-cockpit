export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import FormulariosClient from './FormulariosClient'

export default async function FormulariosPage() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'view_forms', session.role)) {
    redirect('/dashboard')
  }
  return (
    <FormulariosClient
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_forms', session.role)}
    />
  )
}
