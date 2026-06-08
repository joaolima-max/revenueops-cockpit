export const dynamic = 'force-dynamic'
import FinanceiroClient from './FinanceiroClient'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FinanceiroPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const clientes = await prisma.cliente.findMany({
    select: { id: true, nome: true, modeloOperacional: true, status: true },
    orderBy: { nome: 'asc' },
  })

  return <FinanceiroClient clientes={clientes} />
}
