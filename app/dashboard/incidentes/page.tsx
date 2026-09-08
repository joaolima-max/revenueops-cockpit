export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import IncidentesClient from './IncidentesClient'

export default async function IncidentesPage() {
  const session = await getSession()

  const incidentes = await prisma.incidente.findMany({
    orderBy: { inicio: 'desc' },
    take: 50,
  })

  return (
    <IncidentesClient
      initial={JSON.parse(JSON.stringify(incidentes))}
      canEdit={session?.role !== 'COMERCIAL'}
    />
  )
}
