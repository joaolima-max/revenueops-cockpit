export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import ParametrosClient from './ParametrosClient'

export default async function ParametrosPage() {
  const session = await getSession()
  const parametros = await prisma.parametro.findMany({
    orderBy: [{ grupo: 'asc' }, { label: 'asc' }],
  })
  return (
    <ParametrosClient
      parametros={JSON.parse(JSON.stringify(parametros))}
      isAdmin={session?.role === 'ADMIN'}
    />
  )
}
