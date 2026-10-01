import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { validarLead } from '@/lib/leads'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const canal = searchParams.get('canal')
  const segmento = searchParams.get('segmento')

  /**
   * A LIXEIRA É INVISÍVEL AQUI.
   *
   * `deletedAt: null` é o primeiro filtro de toda consulta normal de lead: um
   * lead na lixeira não aparece na lista, não aparece na busca e não pode ser
   * escolhido para um card novo. Quem o encontra é a Lixeira, que é dos
   * Diretores.
   */
  const where: Record<string, unknown> = { deletedAt: null }
  if (status) where.status = status
  if (canal) where.canal = canal
  if (segmento) where.segmento = segmento
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      { cnpj: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (session.role === 'COMERCIAL') {
    where.ownerId = session.userId
  }

  const leads = await prisma.lead.findMany({
    where,
    include: { owner: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(leads)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const data = await request.json()

  // Empresa e executivo são obrigatórios — conferidos AQUI, não só na tela:
  // o formulário pode marcar os campos, mas quem garante é quem grava.
  const erros = validarLead(data)
  if (erros.length > 0) {
    return NextResponse.json({ error: erros[0].mensagem, erros }, { status: 400 })
  }

  const lead = await prisma.lead.create({
    data: {
      name: String(data.name).trim(),
      email: data.email,
      phone: data.phone,
      company: String(data.company).trim(),
      position: data.position,
      source: data.source,
      notes: data.notes,
      // Cadastro revisado do CRM.
      cnpj: data.cnpj || null,
      canal: data.canal || null,
      segmento: data.segmento || null,
      ownerId: data.ownerId || session.userId,
    },
    include: { owner: { select: { id: true, name: true } } },
  })

  return NextResponse.json(lead, { status: 201 })
}
