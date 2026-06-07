export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import DealsClient from './DealsClient'

async function getDeals(role: string, userId: string) {
  const where: Record<string, unknown> = {}
  if (role === 'COMERCIAL') where.ownerId = userId

  return prisma.deal.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export default async function DealsPage() {
  const session = await getSession()
  const deals = await getDeals(session!.role, session!.userId)
  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, company: true },
    orderBy: { name: 'asc' },
  })

  return <DealsClient deals={deals} leads={leads} role={session!.role} />
}
