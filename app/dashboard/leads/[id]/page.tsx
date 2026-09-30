import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import LeadDetailClient from './LeadDetailClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      // O card do pipeline nao tem valor: o que interessa aqui e ONDE ele esta
      // (etapa) e COMO terminou (resultado).
      deals: {
        select: {
          id: true, title: true, resultado: true,
          etapa: { select: { nome: true } },
          funil: { select: { nome: true } },
          owner: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!lead) notFound()

  return <LeadDetailClient lead={lead} role={session!.role} />
}
