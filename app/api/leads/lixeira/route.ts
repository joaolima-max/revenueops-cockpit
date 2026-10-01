import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { diretor } from '@/lib/autorizacao'
import { logAudit } from '@/lib/audit'

/**
 * LIXEIRA DE LEADS — consulta do que foi descartado.
 *
 * Acesso por HIERARQUIA DIRETOR, não por perfil: um Diretor Colaborador vê a
 * lixeira, e um Admin Operador não. Quem responde pela área é quem precisa
 * poder auditar o que foi jogado fora — ser administrador do sistema é outra
 * coisa.
 *
 * Nada aqui apaga. O lead descartado continua no banco com o histórico
 * inteiro: cards, movimentações e comentários seguem apontando para ele.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // DIRETOR, conferido no BANCO. O token vive 7 dias: se a hierarquia viesse
  // dele, rebaixar alguém só valeria no próximo login.
  if (!(await diretor(session))) {
    return NextResponse.json(
      { error: 'A Lixeira de Leads é restrita a usuários com hierarquia Diretor.' },
      { status: 403 },
    )
  }

  const busca = request.nextUrl.searchParams.get('busca')?.trim() ?? ''

  const leads = await prisma.lead.findMany({
    where: {
      // Só os DESCARTADOS. É o inverso exato do filtro das telas normais.
      deletedAt: { not: null },
      ...(busca
        ? {
            OR: [
              { company: { contains: busca, mode: 'insensitive' as const } },
              { name: { contains: busca, mode: 'insensitive' as const } },
              { cnpj: { contains: busca, mode: 'insensitive' as const } },
              { email: { contains: busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true, name: true, company: true, cnpj: true, email: true, phone: true,
      status: true, segmento: true, canal: true, notes: true,
      createdAt: true, deletedAt: true,
      owner: { select: { id: true, name: true } },
      deletedBy: { select: { id: true, name: true } },
      segmentoComercial: { select: { id: true, nome: true, slug: true } },
      // A prova de que o histórico ficou: o lead descartado continua ligado
      // aos cards por onde passou.
      _count: { select: { deals: true, comentarios: true, activities: true } },
    },
    orderBy: { deletedAt: 'desc' },
    take: 300,
  })

  await logAudit(
    session.userId, 'CONSULTOU_LIXEIRA_LEADS', 'Lead', undefined,
    busca ? `Busca: "${busca}" · ${leads.length} resultado(s)` : `${leads.length} lead(s) na lixeira`,
  )

  return NextResponse.json({ leads })
}

/**
 * RESTAURAR — tira o lead da lixeira.
 *
 * Existe porque descartar por engano é comum e a alternativa seria recadastrar
 * o lead, criando um segundo registro para a mesma empresa e perdendo o
 * vínculo com os cards antigos.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await diretor(session))) {
    return NextResponse.json(
      { error: 'A Lixeira de Leads é restrita a usuários com hierarquia Diretor.' },
      { status: 403 },
    )
  }

  const { id } = await request.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Informe o lead.' }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, name: true, company: true, deletedAt: true },
  })
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 })
  if (!lead.deletedAt) {
    return NextResponse.json({ error: 'Este lead não está na lixeira.' }, { status: 409 })
  }

  await prisma.lead.update({
    where: { id },
    data: { deletedAt: null, deletedById: null },
  })

  await logAudit(
    session.userId, 'RESTAUROU_LEAD_DA_LIXEIRA', 'Lead', id,
    `${lead.company ?? '—'} · ${lead.name}`,
  )

  return NextResponse.json({ success: true })
}
