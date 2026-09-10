export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import ConstrutorClient from './ConstrutorClient'

export default async function FormularioPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !hasPermission(session.permissoes ?? null, 'view_forms', session.role)) {
    redirect('/dashboard')
  }
  const { id } = await params
  return (
    <ConstrutorClient
      formularioId={id}
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_forms', session.role)}
    />
  )
}
