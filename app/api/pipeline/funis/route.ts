import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { podeAdministrarPipeline } from '@/lib/pipeline'
import { funisVisiveis, auditarPipeline } from '@/lib/pipeline-db'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const incluirInativos = request.nextUrl.searchParams.get('incluirInativos') === '1'
  const funis = await funisVisiveis(session, incluirInativos)
  return NextResponse.json({ funis, podeAdministrar: podeAdministrarPipeline(session) })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  // Verificado aqui, no backend. Desde que Funis ganhou rota propria
  // (/dashboard/pipeline/funis) o proxy tambem consegue separar os dois ambientes, mas
  // a checagem permanece: autorizacao de escrita nao depende de rota.
  if (!podeAdministrarPipeline(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { nome, descricao, area, exigeCliente } = await request.json()
  const n = String(nome ?? '').trim()
  if (!n) return NextResponse.json({ error: 'Informe o nome do funil.' }, { status: 400 })

  const jaExiste = await prisma.pipelineFunil.findUnique({ where: { nome: n } })
  if (jaExiste) return NextResponse.json({ error: `Já existe um funil chamado ${n}.` }, { status: 409 })

  const ultimo = await prisma.pipelineFunil.findFirst({ orderBy: { ordem: 'desc' }, select: { ordem: true } })

  const funil = await prisma.pipelineFunil.create({
    data: {
      nome: n,
      descricao: descricao ? String(descricao).slice(0, 500) : null,
      area: area ? String(area).slice(0, 120) : null,
      exigeCliente: Boolean(exigeCliente),
      ordem: (ultimo?.ordem ?? 0) + 1,
    },
  })

  await auditarPipeline(session.userId, 'CRIOU_FUNIL', 'PipelineFunil', funil.id, `Funil: ${funil.nome}`)
  return NextResponse.json({ funil }, { status: 201 })
}
