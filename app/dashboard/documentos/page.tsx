export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import DocumentosClient from './DocumentosClient'

export default async function DocumentosPage() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'view_documents', session.role)) {
    redirect('/dashboard')
  }

  return (
    <DocumentosClient
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_documents', session.role)}
      podeBaixar={hasPermission(session.permissoes ?? null, 'download_documents', session.role)}
    />
  )
}
