export const dynamic = 'force-dynamic'
import FollowUpClient from './FollowUpClient'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FollowUpPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const clientes = await prisma.cliente.findMany({
    where: { status: { in: ['ATIVO', 'PROSPECCAO'] } },
    select: { id: true, nome: true, segmento: true, modeloOperacional: true },
    orderBy: { nome: 'asc' },
  })

  return <FollowUpClient clientes={clientes} />
}
