export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { diretor } from '@/lib/autorizacao'
import LeadsClient from './LeadsClient'

async function getLeads(role: string, userId: string) {
  // `deletedAt: null` PRIMEIRO. Lead na lixeira não aparece na lista nem na
  // busca — quem o encontra é a Lixeira, que é dos Diretores.
  const where: Record<string, unknown> = { deletedAt: null }
  if (role === 'COMERCIAL') where.ownerId = userId

  return prisma.lead.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      segmentoComercial: { select: { id: true, nome: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export default async function LeadsPage() {
  const session = await getSession()
  const [leads, ehDiretor] = await Promise.all([
    getLeads(session!.role, session!.userId),
    // A entrada para a Lixeira só aparece para quem pode abri-la. Mostrar o
    // link e depois barrar na página seria oferecer uma porta fechada.
    diretor(session),
  ])

  return <LeadsClient leads={leads} ehDiretor={ehDiretor} />
}
