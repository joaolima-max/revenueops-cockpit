import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { notificar } from '@/lib/notificacoes'
import {
  validarEnvio, quantidadeDoTipo, parseIntervalo, rotuloIntervalo,
  CERTIFICADOS_POR_VERSAO, type EnvioTipo,
} from '@/lib/certificados'

const TIPOS: EnvioTipo[] = ['UNICO', 'LOTE']

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const envios = await prisma.certificadoEnvio.findMany({
    where: {
      ...(sp.get('clienteId') ? { clienteId: sp.get('clienteId')! } : {}),
      ...(sp.get('versaoId') ? { versaoId: sp.get('versaoId')! } : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      versao: { select: { id: true, identificacao: true } },
      enviadoPor: { select: { name: true } },
    },
    orderBy: { enviadoEm: 'desc' },
    take: 300,
  })

  return NextResponse.json({
    envios: envios.map((e) => ({
      ...e,
      referencia: rotuloIntervalo(e.versao.identificacao, e.numeroInicial, e.numeroFinal),
    })),
  })
}

/**
 * Registra a distribuição de 1 (único) ou 10 (lote) certificados a um cliente.
 *
 * O intervalo é sempre relativo à versão: 1–10 existe em toda versão, então a
 * referência devolvida cita as duas coisas.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_certificates', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { clienteId, versaoId, tipo, intervalo, observacao } = await request.json()

  if (!clienteId) return NextResponse.json({ error: 'Selecione o cliente.' }, { status: 400 })
  if (!versaoId) return NextResponse.json({ error: 'Selecione a versão.' }, { status: 400 })
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo de envio inválido.' }, { status: 400 })

  const faixa = parseIntervalo(String(intervalo ?? ''))
  if (!faixa) {
    return NextResponse.json({
      error: 'Informe o número ou intervalo. Exemplos: "11" para único, "1 - 10" para lote.',
    }, { status: 400 })
  }

  const [cliente, versao] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nome: true, ownerId: true, gestorId: true } }),
    prisma.certificadoVersao.findUnique({ where: { id: versaoId }, select: { id: true, identificacao: true, status: true } }),
  ])
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  if (!versao) return NextResponse.json({ error: 'Versão não encontrada.' }, { status: 404 })
  if (versao.status === 'CANCELADA') {
    return NextResponse.json({ error: 'Esta versão está cancelada.' }, { status: 409 })
  }

  const emEstoque = await prisma.certificado.findMany({
    where: { versaoId, status: 'DISPONIVEL', envioId: null },
    select: { id: true, numero: true },
    orderBy: { numero: 'asc' },
  })

  const problema = validarEnvio({
    tipo,
    inicial: faixa.inicial,
    final: faixa.final,
    disponiveis: emEstoque.map((c) => c.numero),
  })
  if (problema) return NextResponse.json({ error: problema }, { status: 409 })

  const escolhidos = emEstoque.filter((c) => c.numero >= faixa.inicial && c.numero <= faixa.final)

  const envio = await prisma.$transaction(async (tx) => {
    const e = await tx.certificadoEnvio.create({
      data: {
        clienteId,
        versaoId,
        tipo,
        quantidade: quantidadeDoTipo(tipo),
        numeroInicial: faixa.inicial,
        numeroFinal: faixa.final,
        observacao: observacao ? String(observacao).slice(0, 500) : null,
        enviadoPorId: session.userId,
      },
    })

    await tx.certificado.updateMany({
      where: { id: { in: escolhidos.map((c) => c.id) } },
      data: { envioId: e.id, status: 'ENVIADO' },
    })

    // Versão sem nenhum certificado sobrando passa a ESGOTADA sozinha.
    const restantes = await tx.certificado.count({ where: { versaoId, status: 'DISPONIVEL' } })
    if (restantes === 0) {
      await tx.certificadoVersao.update({ where: { id: versaoId }, data: { status: 'ESGOTADA' } })
    }
    return e
  })

  const referencia = rotuloIntervalo(versao.identificacao, faixa.inicial, faixa.final)

  await logAudit(
    session.userId, 'ENVIOU_CERTIFICADOS', 'CertificadoEnvio', envio.id,
    `${cliente.nome} · ${referencia}`,
  )

  // Quem cuida da carteira precisa saber que o cliente recebeu certificados.
  const avisar = [...new Set([cliente.gestorId, cliente.ownerId].filter((u): u is string => !!u))]
    .filter((u) => u !== session.userId)

  await notificar(avisar.map((destinatarioId) => ({
    destinatarioId,
    titulo: 'Certificados enviados',
    mensagem: `${cliente.nome} recebeu ${quantidadeDoTipo(tipo)} certificado(s). ${referencia}.`,
    origem: 'CERTIFICADO' as const,
    entidade: 'CertificadoEnvio',
    entidadeId: envio.id,
    href: '/dashboard/certificados',
  })))

  return NextResponse.json({ envio, referencia, restantes: CERTIFICADOS_POR_VERSAO }, { status: 201 })
}
