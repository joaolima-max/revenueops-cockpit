import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { gerarToken } from '@/lib/formularios'

/**
 * Gera um link público. O token é aleatório e NUNCA o id interno: id em URL
 * pública vaza a existência e a ordem dos registros.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_forms', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { clienteId, expiraEm, usosMax } = await request.json()

  const versao = await prisma.formularioVersao.findUnique({
    where: { id }, include: { formulario: { select: { nome: true, ativo: true } } },
  })
  if (!versao) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })
  if (!versao.publicadaEm) {
    return NextResponse.json({ error: 'Publique a versão antes de gerar um link.' }, { status: 409 })
  }
  if (!versao.formulario.ativo) {
    return NextResponse.json({ error: 'Este formulário está inativo.' }, { status: 409 })
  }

  const link = await prisma.formularioLink.create({
    data: {
      versaoId: id,
      token: gerarToken(),
      clienteId: clienteId || null,
      expiraEm: expiraEm ? new Date(expiraEm) : null,
      usosMax: usosMax ? Math.max(1, Math.round(Number(usosMax))) : null,
    },
  })

  await logAudit(
    session.userId, 'GEROU_LINK_FORMULARIO', 'FormularioLink', link.id,
    `${versao.formulario.nome} v${versao.versao}`,
  )

  return NextResponse.json({ link, url: `/f/${link.token}` }, { status: 201 })
}
