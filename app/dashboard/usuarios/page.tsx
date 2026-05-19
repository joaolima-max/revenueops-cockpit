import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { formatDate, ROLE_LABELS } from '@/lib/utils'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const session = await getSession()
  if (session?.role !== 'ADMIN') redirect('/dashboard')

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  return <UsersClient users={users} />
}
