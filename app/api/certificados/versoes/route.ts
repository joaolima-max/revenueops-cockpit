import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { cifrar, gerarSenha, chaveConfigurada } from '@/lib/crypto-certificado'
import { CERTIFICADOS_POR_VERSAO, numerosDaVersao } from '@/lib/certificados'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const incluirCancel = request.nextUrl.searchParams.get('incluirCanceladas') === '1'

  const versoes = await prisma.certificadoVersao.findMany({
    where: incluirCancel ? {} : { status: { not: 'CANCELADA' } },
    include: {
      criadoPor: { select: { name: true } },
      documento: { select: { id: true, nome: true } },
      _count: { select: { certificados: true, envios: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Estoque disponível por versão. `senhaCifrada` fica FORA do select: senha
  // nunca sai em listagem.
  const disponiveis = await prisma.certificado.groupBy({
    by: ['versaoId'],
    where: { status: 'DISPONIVEL' },
    _count: true,
  })
  const porVersao = new Map(disponiveis.map((d) => [d.versaoId, d._count]))

  return NextResponse.json({
    versoes: versoes.map((v) => ({ ...v, disponiveis: porVersao.get(v.id) ?? 0 })),
    criptografiaPronta: chaveConfigurada(),
  })
}

/**
 * Cria uma versão com os 50 certificados de uma vez. Cada um nasce com senha
 * própria, gerada e cifrada aqui — a senha em claro nunca é persistida nem
 * devolvida na resposta.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (!chaveConfigurada()) {
    return NextResponse.json({
      error: 'CERTIFICADO_ENCRYPTION_KEY não configurada. Sem ela as senhas não podem ser cifradas.',
    }, { status: 503 })
  }

  const { identificacao, descricao, documentoId, substituiId, senhas } = await request.json()
  const ident = String(identificacao ?? '').trim()
  if (!ident) return NextResponse.json({ error: 'Informe a identificação da versão (ex.: 002).' }, { status: 400 })

  const jaExiste = await prisma.certificadoVersao.findUnique({ where: { identificacao: ident } })
  if (jaExiste) return NextResponse.json({ error: `Já existe a versão ${ident}.` }, { status: 409 })

  // Senhas podem vir do ZIP (uma por certificado, na ordem 1..50) ou serem
  // geradas. As informadas nunca são logadas nem devolvidas.
  const informadas: string[] | null = Array.isArray(senhas) ? senhas.map(String) : null
  if (informadas && informadas.length !== CERTIFICADOS_POR_VERSAO) {
    return NextResponse.json({
      error: `Informe exatamente ${CERTIFICADOS_POR_VERSAO} senhas, na ordem dos certificados 1 a ${CERTIFICADOS_POR_VERSAO}.`,
    }, { status: 400 })
  }

  const versao = await prisma.$transaction(async (tx) => {
    const v = await tx.certificadoVersao.create({
      data: {
        identificacao: ident,
        descricao: descricao ? String(descricao).slice(0, 500) : null,
        documentoId: documentoId || null,
        substituiId: substituiId || null,
        quantidade: CERTIFICADOS_POR_VERSAO,
        criadoPorId: session.userId,
      },
    })

    await tx.certificado.createMany({
      data: numerosDaVersao().map((numero) => ({
        versaoId: v.id,
        numero,
        senhaCifrada: cifrar(informadas ? informadas[numero - 1] : gerarSenha()),
      })),
    })

    if (substituiId) {
      await tx.certificadoVersao.update({ where: { id: substituiId }, data: { status: 'SUBSTITUIDA' } })
    }
    return v
  })

  await logAudit(
    session.userId, 'CRIOU_VERSAO_CERTIFICADO', 'CertificadoVersao', versao.id,
    `Versão ${ident} com ${CERTIFICADOS_POR_VERSAO} certificados`,
  )

  return NextResponse.json({ versao }, { status: 201 })
}
