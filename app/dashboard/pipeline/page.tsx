import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import PipelineClient from './PipelineClient'

const STAGES = ['PROSPECCAO', 'QUALIFICACAO', 'PROPOSTA', 'NEGOCIACAO', 'FECHAMENTO']

export default async function PipelinePage() {
  const session = await getSession()
  const where: Record<string, unknown> = { stage: { in: STAGES } }
  if (session!.role === 'COMERCIAL') where.ownerId = session!.userId

  const deals = await prisma.deal.findMany({
    where,
    include: {
      owner: { select: { name: true } },
      lead: { select: { name: true, company: true } },
    },
    orderBy: { value: 'desc' },
  })

  return <PipelineClient deals={deals} />
}
