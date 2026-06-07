export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import IncidentesClient from './IncidentesClient'

export default async function IncidentesPage() {
  const session = await getSession()

  const [incidentes, clientes] = await Promise.all([
    prisma.incidente.findMany({
      include: {
        clientesAfetados: {
          include: { cliente: { select: { id: true, nome: true } } },
        },
      },
      orderBy: { inicio: 'desc' },
      take: 50,
    }),
    prisma.cliente.findMany({
      where: { status: 'ATIVO' },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  return (
    <IncidentesClient
      initial={JSON.parse(JSON.stringify(incidentes))}
      clientes={clientes}
      canEdit={session?.role !== 'COMERCIAL'}
    />
  )
}
