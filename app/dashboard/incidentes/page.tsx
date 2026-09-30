export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeAdministrarIncidente, podeRegistrarIncidente } from '@/lib/incidentes'
import IncidentesClient from './IncidentesClient'

export default async function IncidentesPage() {
  const session = await getSession()
  const role = session?.role ?? ''

  const incidentes = await prisma.incidente.findMany({
    orderBy: { inicio: 'desc' },
    take: 50,
  })

  return (
    <IncidentesClient
      initial={JSON.parse(JSON.stringify(incidentes))}
      podeRegistrar={podeRegistrarIncidente(role)}
      podeAdministrar={podeAdministrarIncidente(role)}
    />
  )
}
