export const dynamic = 'force-dynamic'
import FollowUpClient from './FollowUpClient'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FollowUpPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [clientes, usuarios] = await Promise.all([
    prisma.cliente.findMany({
      where: { status: { in: ['ATIVO', 'PROSPECCAO'] } },
      select: { id: true, nome: true, segmento: true, modeloOperacional: true },
      orderBy: { nome: 'asc' },
    }),
    // Só usuários ATIVOS podem ser responsáveis: designar um inativo criaria
    // um follow-up que nunca vai ser acompanhado nem notificado.
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return <FollowUpClient clientes={clientes} usuarios={usuarios} userId={session.userId} />
}
