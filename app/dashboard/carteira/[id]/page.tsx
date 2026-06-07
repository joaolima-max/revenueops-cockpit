export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import ClienteDetailClient from './ClienteDetailClient'

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      processamentos: { orderBy: { mesRef: 'desc' } },
      forecasts: { orderBy: { mesRef: 'desc' } },
    },
  })
  if (!cliente) notFound()
  return <ClienteDetailClient cliente={JSON.parse(JSON.stringify(cliente))} />
}
