import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { rotuloIntervalo } from '@/lib/certificados'

/**
 * Cancela um envio e devolve os certificados ao estoque. Nada é apagado: o
 * envio permanece com status CANCELADO, porque o histórico de que ele existiu
 * é o que a auditoria precisa.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { status } = await request.json()
  if (status !== 'CANCELADO') {
    return NextResponse.json({ error: 'Só é possível cancelar um envio.' }, { status: 400 })
  }

  const envio = await prisma.certificadoEnvio.findUnique({
    where: { id },
    include: { cliente: { select: { nome: true } }, versao: { select: { id: true, identificacao: true } } },
  })
  if (!envio) return NextResponse.json({ error: 'Envio não encontrado' }, { status: 404 })
  if (envio.status === 'CANCELADO') {
    return NextResponse.json({ error: 'Este envio já está cancelado.' }, { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.certificadoEnvio.update({
      where: { id }, data: { status: 'CANCELADO', canceladoEm: new Date() },
    })
    await tx.certificado.updateMany({
      where: { envioId: id }, data: { envioId: null, status: 'DISPONIVEL' },
    })
    // A versão volta a ter estoque, então deixa de estar esgotada.
    await tx.certificadoVersao.updateMany({
      where: { id: envio.versao.id, status: 'ESGOTADA' }, data: { status: 'ATIVA' },
    })
  })

  await logAudit(
    session.userId, 'CANCELOU_ENVIO_CERTIFICADOS', 'CertificadoEnvio', id,
    `${envio.cliente.nome} · ${rotuloIntervalo(envio.versao.identificacao, envio.numeroInicial, envio.numeroFinal)}`,
  )

  return NextResponse.json({ ok: true })
}
