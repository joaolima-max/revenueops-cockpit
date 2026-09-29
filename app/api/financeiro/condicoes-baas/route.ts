import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { calcularMrr, contagensParceiros } from '@/lib/financeiro'

const TIPOS = ['BAAS', 'WHITE_LABEL'] as const
type TipoParceiro = (typeof TIPOS)[number]

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

/** Número opcional não negativo. Vazio vira null, não zero. */
function taxa(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * GET — as condições ATUAIS, mais MRR e contagens derivadas delas.
 *
 * É a mesma função de MRR que o Cockpit e o Conselho usam. A tela não recalcula
 * nada por conta própria.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const incluirInativos = request.nextUrl.searchParams.get('incluirInativos') === '1'

  const [condicoes, mrr, parceiros] = await Promise.all([
    prisma.condicaoComercial.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ tipo: 'asc' }, { nomeFantasia: 'asc' }],
    }),
    calcularMrr(),
    contagensParceiros(),
  ])

  return NextResponse.json({ condicoes, mrr, parceiros })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const body = await request.json()
  const nomeFantasia = String(body.nomeFantasia ?? '').trim()
  const identificacao = String(body.identificacao ?? '').trim()

  if (!nomeFantasia) return NextResponse.json({ error: 'Informe o nome fantasia.' }, { status: 400 })
  if (!identificacao) {
    return NextResponse.json({ error: 'Informe o número da conta / identificação.' }, { status: 400 })
  }
  if (!TIPOS.includes(body.tipo)) {
    return NextResponse.json({ error: 'Escolha o tipo: BaaS ou White Label.' }, { status: 400 })
  }

  const jaExiste = await prisma.condicaoComercial.findUnique({ where: { identificacao } })
  if (jaExiste) {
    return NextResponse.json(
      { error: `Já existe um cadastro com a identificação ${identificacao} (${jaExiste.nomeFantasia}).` },
      { status: 409 },
    )
  }

  const condicao = await prisma.condicaoComercial.create({
    data: {
      nomeFantasia,
      identificacao,
      tipo: body.tipo as TipoParceiro,
      pix: taxa(body.pix),
      kyc: taxa(body.kyc),
      sustentacao: taxa(body.sustentacao),
      apiMensal: taxa(body.apiMensal),
      overpricePercent: taxa(body.overpricePercent),
      observacao: body.observacao ? String(body.observacao).slice(0, 1000) : null,
    },
  })

  await logAudit(
    session.userId, 'CRIOU_CONDICAO_COMERCIAL', 'CondicaoComercial', condicao.id,
    `${nomeFantasia} (${identificacao}) · ${body.tipo}`,
  )

  return NextResponse.json({ condicao }, { status: 201 })
}
