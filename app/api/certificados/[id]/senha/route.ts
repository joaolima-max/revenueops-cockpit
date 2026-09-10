import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { decifrar, chaveConfigurada } from '@/lib/crypto-certificado'
import { rotuloIntervalo } from '@/lib/certificados'

/**
 * ÚNICO ponto do sistema que devolve uma senha de certificado em claro.
 *
 * POST, não GET, de propósito: revelar é uma ação com efeito — deixa rastro na
 * auditoria — e não deve ser disparável por prefetch, histórico ou um link
 * colado em qualquer lugar.
 *
 * A senha vai só no corpo da resposta. Nunca em log, nunca em URL, nunca em
 * listagem, e a interface a copia para a área de transferência em vez de
 * mantê-la na tela.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  if (!hasPermission(session.permissoes ?? null, 'reveal_certificate_password', session.role)) {
    // A tentativa negada também fica registrada: quem tentou ver o que não pode
    // é informação de segurança.
    await logAudit(
      session.userId, 'NEGOU_REVELACAO_SENHA', 'Certificado', (await params).id,
      'Tentativa sem permissão',
    )
    return NextResponse.json({ error: 'Você não tem permissão para revelar senhas.' }, { status: 403 })
  }

  if (!chaveConfigurada()) {
    return NextResponse.json({ error: 'CERTIFICADO_ENCRYPTION_KEY não configurada.' }, { status: 503 })
  }

  const { id } = await params
  const certificado = await prisma.certificado.findUnique({
    where: { id },
    include: {
      versao: { select: { identificacao: true } },
      envio: { select: { cliente: { select: { nome: true } } } },
    },
  })
  if (!certificado) return NextResponse.json({ error: 'Certificado não encontrado' }, { status: 404 })

  let senha: string
  try {
    senha = decifrar(certificado.senhaCifrada)
  } catch {
    return NextResponse.json({
      error: 'Não foi possível decifrar a senha. A chave de criptografia pode ter mudado.',
    }, { status: 500 })
  }

  // Auditoria ANTES de devolver: se a gravação falhar, a senha não sai.
  await prisma.auditoria.create({
    data: {
      acao: 'REVELOU_SENHA_CERTIFICADO',
      entidade: 'Certificado',
      entidadeId: id,
      detalhes: `${rotuloIntervalo(certificado.versao.identificacao, certificado.numero, certificado.numero)}`
        + (certificado.envio ? ` · cliente ${certificado.envio.cliente.nome}` : ' · em estoque'),
      userId: session.userId,
    },
  })

  return NextResponse.json({
    senha,
    referencia: rotuloIntervalo(certificado.versao.identificacao, certificado.numero, certificado.numero),
  })
}
