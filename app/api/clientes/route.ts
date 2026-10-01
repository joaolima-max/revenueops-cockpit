import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search')?.trim() || ''
  const status = searchParams.get('status') || ''
  const modelo = searchParams.get('modelo') || ''
  const segmentoId = searchParams.get('segmentoId') || ''
  const gestorId = searchParams.get('gestorId') || ''

  const clientes = await prisma.cliente.findMany({
    where: {
      // A BUSCA cobre nome, CNPJ e NÚMERO DA CONTA: são as três formas de
      // chegar a um cliente, e a conta é a que o Lançamento BaaS usa.
      ...(search
        ? {
            OR: [
              { nome: { contains: search, mode: 'insensitive' as const } },
              { cnpj: { contains: search, mode: 'insensitive' as const } },
              { numeroConta: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(status ? { status: status as 'ATIVO' | 'INATIVO' } : {}),
      ...(modelo ? { modeloOperacional: modelo as 'API' | 'WHITE_LABEL' | 'BAAS' } : {}),
      // Segmento pela ENTIDADE. O enum antigo continua na coluna `segmento`,
      // mas o filtro usa o vínculo — que é o que a tela de Segmentos governa.
      ...(segmentoId ? { segmentoComercialId: segmentoId } : {}),
      ...(gestorId ? { gestorId } : {}),
    },
    include: {
      owner: { select: { name: true } },
      gestor: { select: { id: true, name: true } },
      segmentoComercial: { select: { id: true, nome: true, slug: true } },
    },
    /**
     * ATIVOS primeiro e alfabéticos; INATIVOS depois e alfabéticos.
     *
     * A ordenação é do BANCO, não da tela: ordenar em memória quebraria no dia
     * em que a listagem for paginada — cada página viria ordenada só dentro de
     * si mesma.
     *
     * `status: 'asc'` dá a ordem certa porque ATIVO e INATIVO são os dois
     * primeiros valores do enum, nessa ordem. Os legados (PROSPECCAO,
     * ENCERRADO, STANDBY) vêm depois, que é onde devem ficar.
     */
    orderBy: [{ status: 'asc' }, { nome: 'asc' }],
  })

  return NextResponse.json({ clientes })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // CADASTRO COMERCIAL ENXUTO: nome, CNPJ, modelo operacional, e-mail,
  // telefone, segmento, data de fechamento e mensalidade de API. Campos de
  // expectativa financeira (TPV esperado, receita prevista, desconto,
  // overprice, setup, sustentação) e Score de Risco saíram do produto — as
  // condições de BaaS/White Label moram em CondicaoComercial e o realizado em
  // LancamentoDiario. Nada aqui entra no lugar deles.
  const body = await request.json()
  const {
    nome, cnpj, email, telefone, modeloOperacional,
    segmento, segmentoComercialId, mensalidadeApi, dataFechamento, notas,
    gestorId, numeroConta, status,
  } = body

  if (!nome || !modeloOperacional) {
    return NextResponse.json({ error: 'Nome e modelo operacional são obrigatórios' }, { status: 400 })
  }

  const cliente = await prisma.cliente.create({
    data: {
      nome, cnpj: cnpj || null, email: email || null, telefone: telefone || null,
      modeloOperacional,
      segmento: segmento || null,
      segmentoComercialId: segmentoComercialId || null,
      // NÚMERO DA CONTA é opcional e NUNCA gerado: inventar um número criaria
      // um identificador que não existe em lugar nenhum. É a chave que o
      // Lançamento BaaS usa para achar o cliente de um título.
      numeroConta: typeof numeroConta === 'string' && numeroConta.trim()
        ? numeroConta.trim() : null,
      ...(status === 'ATIVO' || status === 'INATIVO' ? { status } : {}),
      mensalidadeApi: mensalidadeApi ?? null,
      dataFechamento: dataFechamento ? new Date(dataFechamento) : null,
      notas: notas || null,
      gestorId: gestorId || null,
      ownerId: session.userId,
    },
  })

  await logAudit(session.userId, 'CRIOU_CLIENTE', 'Cliente', cliente.id, `Nome: ${cliente.nome}`)

  return NextResponse.json({ cliente }, { status: 201 })
}
