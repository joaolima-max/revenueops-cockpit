export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import CertificadosClient from './CertificadosClient'

export default async function CertificadosPage() {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'view_certificates', session.role)) {
    redirect('/dashboard')
  }

  return (
    <CertificadosClient
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_certificates', session.role)}
      podeRevelar={hasPermission(session.permissoes ?? null, 'reveal_certificate_password', session.role)}
    />
  )
}
