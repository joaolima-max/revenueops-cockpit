import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, signToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
  })

  return NextResponse.json({ user })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json()
  const { name, avatar, currentPassword, newPassword } = body

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (name) updateData.name = name
  if (avatar !== undefined) updateData.avatar = avatar

  if (newPassword) {
    if (!currentPassword) return NextResponse.json({ error: 'Senha atual obrigatória' }, { status: 400 })
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })
    updateData.password = await bcrypt.hash(newPassword, 10)
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, avatar: true },
  })

  // Re-issue cookie if name changed
  if (name) {
    const token = signToken({ userId: updated.id, email: updated.email, role: updated.role, name: updated.name })
    const cookieStore = await cookies()
    cookieStore.set('auth-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7, path: '/' })
  }

  return NextResponse.json({ user: updated })
}
