import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import {
  enviarArquivo, removerArquivo, storageConfigurado,
  validarArquivo, chaveLancamento,
} from '@/lib/storage'

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

/**
 * Anexos do lançamento: nota fiscal, comprovante de pagamento, print, e o que
 * mais sustente o lançamento.
 *
 * O arquivo usa o MESMO bucket privado do resto do sistema e continua sendo
 * representado por um `Documento` — o ambiente "Documentos" saiu do produto,
 * o modelo não. O anexo pertence ao lançamento: sai com ele.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const anexos = await prisma.lancamentoAnexo.findMany({
    where: { lancamentoId: id },
    include: {
      documento: { select: { id: true, nome: true, mime: true, tamanho: true, createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ anexos })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  if (!storageConfigurado()) {
    return NextResponse.json({ error: 'Storage não configurado no servidor.' }, { status: 503 })
  }

  const { id } = await params
  const lancamento = await prisma.lancamentoFinanceiro.findUnique({
    where: { id }, select: { id: true, descricao: true },
  })
  if (!lancamento) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  const form = await request.formData()
  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo no campo "arquivo".' }, { status: 400 })
  }

  const problema = validarArquivo(arquivo.name, arquivo.type, arquivo.size)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const descricao = form.get('descricao')

  // Documento primeiro para ter o id na chave do bucket; o upload vem depois e,
  // se falhar, o registro é desfeito — nunca fica metadado sem arquivo.
  const documento = await prisma.documento.create({
    data: {
      clienteId: null,
      nome: arquivo.name,
      categoria: 'FINANCEIRO',
      origem: 'LANCAMENTO_FINANCEIRO',
      mime: arquivo.type || 'application/octet-stream',
      tamanho: arquivo.size,
      storageKey: `pendente/${crypto.randomUUID()}`,
      descricao: typeof descricao === 'string' && descricao ? descricao.slice(0, 500) : null,
      enviadoPorId: session.userId,
    },
  })

  const chave = chaveLancamento(lancamento.id, documento.id, arquivo.name)

  try {
    await enviarArquivo(chave, await arquivo.arrayBuffer(), arquivo.type || 'application/octet-stream')
  } catch (e) {
    await prisma.documento.delete({ where: { id: documento.id } })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falha ao enviar o arquivo.' },
      { status: 502 },
    )
  }

  try {
    await prisma.documento.update({ where: { id: documento.id }, data: { storageKey: chave } })
    const anexo = await prisma.lancamentoAnexo.create({
      data: { lancamentoId: lancamento.id, documentoId: documento.id },
      include: { documento: { select: { id: true, nome: true, mime: true, tamanho: true } } },
    })

    await logAudit(
      session.userId, 'ANEXOU_ARQUIVO_LANCAMENTO', 'LancamentoFinanceiro', lancamento.id,
      `${lancamento.descricao}: ${arquivo.name}`,
    )

    return NextResponse.json({ anexo }, { status: 201 })
  } catch (e) {
    await removerArquivo(chave).catch(() => {})
    await prisma.documento.delete({ where: { id: documento.id } }).catch(() => {})
    throw e
  }
}
