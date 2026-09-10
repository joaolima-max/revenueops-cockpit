import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'

/** Detalhe da versão com os 50 certificados. Sem nenhuma senha no payload. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const versao = await prisma.certificadoVersao.findUnique({
    where: { id },
    include: {
      criadoPor: { select: { name: true } },
      documento: { select: { id: true, nome: true } },
      envios: {
        include: { cliente: { select: { id: true, nome: true } }, enviadoPor: { select: { name: true } } },
        orderBy: { enviadoEm: 'desc' },
      },
    },
  })
  if (!versao) return NextResponse.json({ error: 'Versão não encontrada' }, { status: 404 })

  const certificados = await prisma.certificado.findMany({
    where: { versaoId: id },
    // senhaCifrada fora do select, deliberadamente.
    select: {
      id: true, numero: true, status: true, envioId: true,
      envio: { select: { id: true, cliente: { select: { nome: true } } } },
    },
    orderBy: { numero: 'asc' },
  })

  return NextResponse.json({ versao, certificados })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { status, descricao } = await request.json()
  const STATUS = ['ATIVA', 'ESGOTADA', 'SUBSTITUIDA', 'CANCELADA']
  if (status && !STATUS.includes(status)) {
    return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
  }

  const versao = await prisma.certificadoVersao.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(descricao !== undefined ? { descricao: descricao ? String(descricao).slice(0, 500) : null } : {}),
    },
  })

  await logAudit(session.userId, 'EDITOU_VERSAO_CERTIFICADO', 'CertificadoVersao', id, `Versão ${versao.identificacao}`)
  return NextResponse.json({ versao })
}
