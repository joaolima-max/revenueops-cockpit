import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const { permissoes } = await request.json()

  const user = await prisma.user.update({
    where: { id },
    data: { permissoes: JSON.stringify(permissoes) },
    select: { id: true, name: true, email: true, role: true, active: true, permissoes: true },
  })

  return NextResponse.json(user)
}
