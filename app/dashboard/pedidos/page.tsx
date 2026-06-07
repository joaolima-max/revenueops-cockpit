export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import PedidosClient from './PedidosClient'

export default async function PedidosPage() {
  await getSession()

  const [pedidos, clientes] = await Promise.all([
    prisma.pedidoCobravel.findMany({
      include: { cliente: { select: { id: true, nome: true } } },
      orderBy: [{ mesRef: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    prisma.cliente.findMany({
      where: { status: { in: ['ATIVO', 'PROSPECCAO'] } },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  return (
    <PedidosClient
      initial={JSON.parse(JSON.stringify(pedidos))}
      clientes={clientes}
    />
  )
}
