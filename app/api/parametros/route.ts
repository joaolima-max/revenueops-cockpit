import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const parametros = await prisma.parametro.findMany({ orderBy: [{ grupo: 'asc' }, { label: 'asc' }] })
  return NextResponse.json({ parametros })
}
