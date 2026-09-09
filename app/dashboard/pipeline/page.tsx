export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeAdministrarPipeline } from '@/lib/pipeline'
import PipelineClient from './PipelineClient'

export default async function PipelinePage() {
  const session = await getSession()
  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, company: true },
    orderBy: { name: 'asc' },
  })

  return (
    <PipelineClient
      leads={leads}
      podeAdministrar={!!session && podeAdministrarPipeline(session)}
    />
  )
}
