import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import {
  validarArquivo, chaveDocumento, enviarArquivo, removerArquivo,
  storageConfigurado, EXTENSOES_ACEITAS, TAMANHO_MAX,
} from '@/lib/storage'
import { randomUUID } from 'node:crypto'

const CATEGORIAS = ['CONTRATO', 'KYC_KYB', 'CERTIFICADO', 'COMPROVANTE', 'COMERCIAL', 'FINANCEIRO', 'OUTROS'] as const
type Categoria = (typeof CATEGORIAS)[number]

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'view_documents', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const categoria = sp.get('categoria')

  const documentos = await prisma.documento.findMany({
    where: {
      ...(sp.get('clienteId') ? { clienteId: sp.get('clienteId')! } : {}),
      ...(CATEGORIAS.includes(categoria as Categoria) ? { categoria: categoria as Categoria } : {}),
      ...(sp.get('incluirInativos') === '1' ? {} : { ativo: true }),
      ...(sp.get('busca') ? { nome: { contains: sp.get('busca')!, mode: 'insensitive' } } : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      enviadoPor: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  return NextResponse.json({
    documentos,
    limites: { extensoes: EXTENSOES_ACEITAS, tamanhoMax: TAMANHO_MAX },
    storagePronto: storageConfigurado(),
  })
}

/**
 * Upload. O arquivo passa inteiro pelo servidor de propósito: é o único jeito
 * de validar extensão, MIME, tamanho e autorização antes de qualquer byte
 * chegar ao bucket — e a service role key nunca sai daqui.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_documents', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (!storageConfigurado()) {
    return NextResponse.json({
      error: 'Storage não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    }, { status: 503 })
  }

  const form = await request.formData()
  const arquivo = form.get('arquivo')
  const clienteId = String(form.get('clienteId') ?? '')
  const categoriaBruta = String(form.get('categoria') ?? 'OUTROS')
  const descricao = String(form.get('descricao') ?? '').slice(0, 500) || null

  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
  }
  if (!clienteId) return NextResponse.json({ error: 'Selecione o cliente.' }, { status: 400 })

  const problema = validarArquivo(arquivo.name, arquivo.type, arquivo.size)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nome: true } })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  const categoria: Categoria = CATEGORIAS.includes(categoriaBruta as Categoria)
    ? (categoriaBruta as Categoria) : 'OUTROS'

  const documentoId = randomUUID()
  const chave = chaveDocumento(clienteId, documentoId, arquivo.name)

  await enviarArquivo(chave, await arquivo.arrayBuffer(), arquivo.type)

  try {
    const documento = await prisma.documento.create({
      data: {
        id: documentoId,
        clienteId,
        nome: arquivo.name.slice(0, 200),
        categoria,
        mime: arquivo.type || 'application/octet-stream',
        tamanho: arquivo.size,
        storageKey: chave,
        descricao,
        enviadoPorId: session.userId,
      },
      include: { cliente: { select: { id: true, nome: true } }, enviadoPor: { select: { name: true } } },
    })

    await logAudit(
      session.userId, 'ENVIOU_DOCUMENTO', 'Documento', documento.id,
      `${cliente.nome} · ${documento.nome} (${categoria})`,
    )
    return NextResponse.json({ documento }, { status: 201 })
  } catch (e) {
    // O arquivo já subiu mas o registro falhou: desfaz para não deixar órfão.
    await removerArquivo(chave).catch(() => {})
    throw e
  }
}
