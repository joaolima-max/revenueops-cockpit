export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatCurrency, formatDate, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/lib/utils'
import LeadsClient from './LeadsClient'

async function getLeads(role: string, userId: string) {
  const where: Record<string, unknown> = {}
  if (role === 'COMERCIAL') where.ownerId = userId

  return prisma.lead.findMany({
    where,
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export default async function LeadsPage() {
  const session = await getSession()
  const leads = await getLeads(session!.role, session!.userId)

  return (
    <LeadsClient
      leads={leads}
      role={session!.role}
      userId={session!.userId}
    />
  )
}
