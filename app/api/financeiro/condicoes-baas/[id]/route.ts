import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

const TIPOS = ['BAAS', 'WHITE_LABEL'] as const

/** Campos versionados. Alterar qualquer um grava histórico antes de gravar. */
const CAMPOS_HISTORICO = [
  'pix', 'kyc', 'sustentacao', 'apiMensal', 'overpricePercent', 'tipo', 'ativo',
] as const
type CampoHistorico = (typeof CAMPOS_HISTORICO)[number]

const ROTULO: Record<CampoHistorico, string> = {
  pix: 'PIX', kyc: 'KYC', sustentacao: 'Sustentação', apiMensal: 'API mensal',
  overpricePercent: 'Overprice (%)', tipo: 'Tipo', ativo: 'Ativo',
}

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

function taxa(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Texto para o histórico. null vira "—" para a leitura não ficar ambígua. */
function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v)
}

/** GET — condições atuais + histórico completo de alterações. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const condicao = await prisma.condicaoComercial.findUnique({
    where: { id },
    include: {
      historico: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!condicao) return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 })

  return NextResponse.json({ condicao })
}

/**
 * PUT — altera as condições.
 *
 * REGRA (§18/§19): nenhuma taxa é sobrescrita em silêncio. Cada campo que muda
 * gera uma linha de histórico com valor anterior, valor novo, data e usuário
 * responsável, na MESMA transação da alteração — ou os dois acontecem, ou
 * nenhum, e nunca existe uma taxa nova sem o registro de que ela mudou.
 *
 * O MRR passa a usar o valor novo a partir de agora. O histórico não é usado
 * para recalcular o passado: o que já foi reportado continua como foi.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.condicaoComercial.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 })

  const body = await request.json()

  const nomeFantasia = body.nomeFantasia === undefined ? undefined : String(body.nomeFantasia).trim()
  if (nomeFantasia !== undefined && !nomeFantasia) {
    return NextResponse.json({ error: 'Informe o nome fantasia.' }, { status: 400 })
  }

  const identificacao = body.identificacao === undefined ? undefined : String(body.identificacao).trim()
  if (identificacao !== undefined && !identificacao) {
    return NextResponse.json({ error: 'Informe o número da conta / identificação.' }, { status: 400 })
  }
  if (identificacao && identificacao !== atual.identificacao) {
    const conflito = await prisma.condicaoComercial.findUnique({ where: { identificacao } })
    if (conflito) {
      return NextResponse.json({ error: `A identificação ${identificacao} já está em uso.` }, { status: 409 })
    }
  }

  if (body.tipo !== undefined && !TIPOS.includes(body.tipo)) {
    return NextResponse.json({ error: 'Tipo inválido. Use BaaS ou White Label.' }, { status: 400 })
  }

  const novos: Record<string, unknown> = {
    ...(nomeFantasia ? { nomeFantasia } : {}),
    ...(identificacao ? { identificacao } : {}),
    ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
    ...(body.pix !== undefined ? { pix: taxa(body.pix) } : {}),
    ...(body.kyc !== undefined ? { kyc: taxa(body.kyc) } : {}),
    ...(body.sustentacao !== undefined ? { sustentacao: taxa(body.sustentacao) } : {}),
    ...(body.apiMensal !== undefined ? { apiMensal: taxa(body.apiMensal) } : {}),
    ...(body.overpricePercent !== undefined ? { overpricePercent: taxa(body.overpricePercent) } : {}),
    ...(typeof body.ativo === 'boolean' ? { ativo: body.ativo } : {}),
    ...(body.observacao !== undefined
      ? { observacao: body.observacao ? String(body.observacao).slice(0, 1000) : null }
      : {}),
  }

  const mudancas = CAMPOS_HISTORICO.filter(
    (campo) => campo in novos && novos[campo] !== (atual as Record<string, unknown>)[campo],
  ).map((campo) => ({
    campo,
    valorAnterior: comoTexto((atual as Record<string, unknown>)[campo]),
    valorNovo: comoTexto(novos[campo]),
  }))

  const condicao = await prisma.$transaction(async (tx) => {
    if (mudancas.length > 0) {
      await tx.condicaoComercialHistorico.createMany({
        data: mudancas.map((m) => ({
          condicaoId: id,
          campo: m.campo,
          valorAnterior: m.valorAnterior,
          valorNovo: m.valorNovo,
          userId: session.userId,
        })),
      })
    }
    return tx.condicaoComercial.update({ where: { id }, data: novos })
  })

  await logAudit(
    session.userId, 'EDITOU_CONDICAO_COMERCIAL', 'CondicaoComercial', id,
    mudancas.length > 0
      ? `${condicao.nomeFantasia}: ${mudancas.map((m) => `${ROTULO[m.campo]} ${m.valorAnterior} → ${m.valorNovo}`).join('; ')}`
      : `${condicao.nomeFantasia}: dados cadastrais atualizados`,
  )

  return NextResponse.json({ condicao, alteracoes: mudancas.length })
}

/**
 * Nunca exclui de verdade: inativa.
 *
 * Um BaaS que saiu tem histórico de taxas que sustenta MRR já reportado, e
 * apagar a linha levaria o histórico junto (cascade). Inativo sai do MRR e das
 * contagens de ativos, e continua auditável.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.condicaoComercial.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 })
  if (!atual.ativo) return NextResponse.json({ condicao: atual })

  const condicao = await prisma.$transaction(async (tx) => {
    await tx.condicaoComercialHistorico.create({
      data: {
        condicaoId: id, campo: 'ativo', valorAnterior: 'Sim', valorNovo: 'Não',
        userId: session.userId,
      },
    })
    return tx.condicaoComercial.update({ where: { id }, data: { ativo: false } })
  })

  await logAudit(
    session.userId, 'INATIVOU_CONDICAO_COMERCIAL', 'CondicaoComercial', id,
    `${atual.nomeFantasia} (${atual.identificacao})`,
  )

  return NextResponse.json({ condicao })
}
