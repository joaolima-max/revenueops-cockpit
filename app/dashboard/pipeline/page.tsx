export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import PipelineClient from './PipelineClient'

const STAGES = ['PROSPECCAO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'FECHAMENTO']

export default async function PipelinePage() {
  const session = await getSession()
  const where: Record<string, unknown> = { stage: { in: STAGES } }
  if (session!.role === 'COMERCIAL') where.ownerId = session!.userId

  const [deals, leads] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        lead: { select: { name: true, company: true } },
      },
      orderBy: { value: 'desc' },
    }),
    prisma.lead.findMany({
      select: { id: true, name: true, company: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <PipelineClient
      deals={JSON.parse(JSON.stringify(deals))}
      leads={leads}
      userId={session!.userId}
      role={session!.role}
    />
  )
}
