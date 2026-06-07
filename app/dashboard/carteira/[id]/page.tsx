export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import ClienteDetailClient from './ClienteDetailClient'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()

  const [cliente, users] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        processamentos: { orderBy: { mesRef: 'desc' } },
        forecasts: { orderBy: { mesRef: 'desc' } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!cliente) notFound()

  return (
    <ClienteDetailClient
      cliente={JSON.parse(JSON.stringify(cliente))}
      users={users}
      role={session?.role || 'OPERACIONAL'}
    />
  )
}
