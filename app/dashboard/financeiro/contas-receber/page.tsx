export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import ContasReceberClient from './ContasReceberClient'

export default async function ContasReceberPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasPermission(session.permissoes ?? null, 'view_financeiro', session.role)) {
    redirect('/dashboard')
  }

  const clientes = await prisma.cliente.findMany({
    select: { id: true, nome: true, modeloOperacional: true, status: true },
    orderBy: { nome: 'asc' },
  })

  return (
    <ContasReceberClient
      clientes={clientes}
      podeGerenciar={hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)}
    />
  )
}
