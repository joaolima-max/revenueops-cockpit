import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { slugDeSegmento } from '@/lib/segmentos'

/**
 * SEGMENTOS — entidade, não enum fechado no frontend.
 *
 * O enum `Segmento` continua existindo e continua gravado nas colunas antigas
 * de Cliente, Lead e Deal: um enum não se apaga sem reescrever os dados que o
 * usam. A migration semeou a tabela com os mesmos valores e casou os
 * registros pelo slug, então nada mudou de significado — o que mudou é que
 * agora dá para criar segmento novo sem migration.
 */
export const dynamic = 'force-dynamic'

function podeGerenciar(s: { permissoes?: string[]; role: string }): boolean {
  // Segmento é cadastro da carteira: quem gerencia cliente gerencia segmento.
  return hasPermission(s.permissoes ?? null, 'manage_carteira', s.role)
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // `todos=1` traz os inativos — a tela de gestão precisa deles; os
  // seletores, não.
  const todos = request.nextUrl.searchParams.get('todos') === '1'

  const segmentos = await prisma.segmentoComercial.findMany({
    where: todos ? {} : { ativo: true },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    include: {
      _count: { select: { clientes: true, leads: true, deals: true } },
    },
  })

  return NextResponse.json({ segmentos, podeGerenciar: podeGerenciar(session) })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { nome, ordem } = await request.json()
  const rotulo = typeof nome === 'string' ? nome.trim() : ''
  if (!rotulo) return NextResponse.json({ error: 'O nome do segmento é obrigatório.' }, { status: 400 })

  try {
    const segmento = await prisma.segmentoComercial.create({
      data: {
        nome: rotulo,
        slug: slugDeSegmento(rotulo),
        ordem: Number.isFinite(Number(ordem)) ? Number(ordem) : 500,
      },
    })

    await logAudit(session.userId, 'CRIOU_SEGMENTO', 'SegmentoComercial', segmento.id, rotulo)
    return NextResponse.json({ segmento }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: `Já existe um segmento "${rotulo}".` }, { status: 409 })
    }
    throw e
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id, nome, ativo, ordem } = await request.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Informe o segmento.' }, { status: 400 })
  }

  const atual = await prisma.segmentoComercial.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Segmento não encontrado.' }, { status: 404 })

  const dados: Record<string, unknown> = {}
  if (typeof nome === 'string' && nome.trim()) dados.nome = nome.trim()
  if (typeof ativo === 'boolean') dados.ativo = ativo
  if (ordem !== undefined && Number.isFinite(Number(ordem))) dados.ordem = Number(ordem)

  // O SLUG NÃO MUDA ao renomear. Ele é a chave que casa os registros legados
  // gravados com o valor do enum — reescrevê-lo desfaria esse vínculo.
  try {
    const segmento = await prisma.segmentoComercial.update({ where: { id }, data: dados })
    await logAudit(
      session.userId, 'EDITOU_SEGMENTO', 'SegmentoComercial', id,
      `${atual.nome} → ${segmento.nome}${segmento.ativo ? '' : ' (inativado)'}`,
    )
    return NextResponse.json({ segmento })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um segmento com esse nome.' }, { status: 409 })
    }
    throw e
  }
}

/**
 * EXCLUSÃO — só de segmento SEM USO.
 *
 * Com cliente, lead ou card vinculado, a exclusão é recusada e a tela oferece
 * INATIVAR: o vínculo histórico vale mais que a lista limpa. Apagar deixaria
 * registros apontando para um segmento que não existe mais — ou, pior, com o
 * vínculo zerado pelo `ON DELETE SET NULL`, perdendo a informação de que
 * aquele cliente era daquele segmento.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Informe o segmento.' }, { status: 400 })

  const atual = await prisma.segmentoComercial.findUnique({
    where: { id },
    include: { _count: { select: { clientes: true, leads: true, deals: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Segmento não encontrado.' }, { status: 404 })

  const usos = atual._count.clientes + atual._count.leads + atual._count.deals
  if (usos > 0) {
    const partes = [
      atual._count.clientes > 0 && `${atual._count.clientes} cliente${atual._count.clientes === 1 ? '' : 's'}`,
      atual._count.leads > 0 && `${atual._count.leads} lead${atual._count.leads === 1 ? '' : 's'}`,
      atual._count.deals > 0 && `${atual._count.deals} card${atual._count.deals === 1 ? '' : 's'}`,
    ].filter(Boolean).join(', ')

    return NextResponse.json(
      {
        error: `"${atual.nome}" está em uso por ${partes}. Excluí-lo apagaria o `
          + 'segmento desses registros. Inative-o: ele sai dos seletores e o '
          + 'histórico fica preservado.',
        usos,
      },
      { status: 409 },
    )
  }

  await prisma.segmentoComercial.delete({ where: { id } })
  await logAudit(session.userId, 'EXCLUIU_SEGMENTO', 'SegmentoComercial', id, atual.nome)

  return NextResponse.json({ success: true })
}
