import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  linkUtilizavel, validarResposta, prepararAnexos, MOTIVO_LINK_MENSAGEM,
  type DefinicaoFormulario,
} from '@/lib/formularios'
import { validarArquivo, chaveDocumento } from '@/lib/arquivos'
import { enviarArquivo, removerArquivo, storageConfigurado } from '@/lib/storage'
import { dispararAutomacoes } from '@/lib/automacoes-db'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'

/**
 * Rota PÚBLICA — sem sessão. É a única do sistema assim, e por isso:
 *   * localiza pelo token aleatório, nunca por id;
 *   * devolve só a definição e a aparência, jamais respostas de terceiros;
 *   * revalida o link a cada acesso (revogado, expirado, esgotado).
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const link = await prisma.formularioLink.findUnique({
    where: { token },
    include: {
      versao: { include: { formulario: { select: { nome: true, ativo: true } } } },
      cliente: { select: { id: true, nome: true } },
    },
  })
  if (!link) return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })

  const invalido = linkUtilizavel(link)
  if (invalido) return NextResponse.json({ error: MOTIVO_LINK_MENSAGEM[invalido] }, { status: 410 })
  if (!link.versao.publicadaEm || !link.versao.formulario.ativo) {
    return NextResponse.json({ error: 'Este formulário não está disponível.' }, { status: 410 })
  }

  return NextResponse.json({
    nome: link.versao.formulario.nome,
    definicao: link.versao.definicao,
    cliente: link.cliente ? { nome: link.cliente.nome } : null,
  })
}

/**
 * Recebe a resposta pública. A validação que vale é esta, não a do navegador.
 *
 * Aceita JSON (resposta sem anexo) ou multipart (com anexos). Os arquivos
 * sobem pelo servidor, como no módulo de Documentos: é o que permite validar
 * extensão, MIME e tamanho antes de qualquer byte chegar ao bucket, e mantém a
 * service role key fora do navegador.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data')
  let valores: unknown
  let assinatura: unknown
  let aceite: unknown
  const arquivosPorCampo: Record<string, File[]> = {}

  if (multipart) {
    const form = await request.formData()
    try {
      const dados = JSON.parse(String(form.get('dados') ?? '{}'))
      valores = dados.valores
      assinatura = dados.assinatura
      aceite = dados.aceite
    } catch {
      return NextResponse.json({ error: 'Dados da resposta em formato inválido.' }, { status: 400 })
    }
    // Cada arquivo chega com o nome `anexo:<campoId>`.
    for (const [chave, valor] of form.entries()) {
      if (!chave.startsWith('anexo:') || !(valor instanceof File)) continue
      const campoId = chave.slice('anexo:'.length)
      ;(arquivosPorCampo[campoId] ??= []).push(valor)
    }
  } else {
    const corpo = await request.json()
    valores = corpo.valores
    assinatura = corpo.assinatura
    aceite = corpo.aceite
  }

  const link = await prisma.formularioLink.findUnique({
    where: { token },
    include: { versao: { include: { formulario: { select: { nome: true, ativo: true, criadoPorId: true } } } } },
  })
  if (!link) return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })

  const invalido = linkUtilizavel(link)
  if (invalido) return NextResponse.json({ error: MOTIVO_LINK_MENSAGEM[invalido] }, { status: 410 })
  if (!link.versao.publicadaEm || !link.versao.formulario.ativo) {
    return NextResponse.json({ error: 'Este formulário não está disponível.' }, { status: 410 })
  }

  const definicao = link.versao.definicao as unknown as DefinicaoFormulario
  const erros = validarResposta(definicao, (valores ?? {}) as Record<string, unknown>)

  const preparo = prepararAnexos(definicao, arquivosPorCampo, link.clienteId, validarArquivo)
  const todosErros = { ...erros, ...preparo.errosPorCampo }

  if (preparo.erro && Object.keys(preparo.errosPorCampo).length === 0) {
    return NextResponse.json({ error: preparo.erro }, { status: 400 })
  }
  if (Object.keys(todosErros).length > 0) {
    return NextResponse.json({ error: 'Confira os campos destacados.', erros: todosErros }, { status: 400 })
  }
  if (preparo.anexos.length > 0 && !storageConfigurado()) {
    return NextResponse.json({ error: 'Envio de arquivos indisponível no momento.' }, { status: 503 })
  }

  // Os bytes sobem ANTES da transação: storage não participa de transação de
  // banco. Se a gravação falhar depois, desfazemos o que subiu.
  const enviados: Array<{ campoId: string; documentoId: string; chave: string; arquivo: File }> = []
  try {
    for (const { campoId, arquivo } of preparo.anexos) {
      const file = arquivo as File
      const documentoId = randomUUID()
      const chave = chaveDocumento(link.clienteId!, documentoId, file.name)
      await enviarArquivo(chave, await file.arrayBuffer(), file.type)
      enviados.push({ campoId, documentoId, chave, arquivo: file })
    }
  } catch {
    await Promise.all(enviados.map((e) => removerArquivo(e.chave).catch(() => {})))
    return NextResponse.json({ error: 'Falha ao enviar os arquivos. Tente novamente.' }, { status: 502 })
  }

  let resposta
  try {
    resposta = await prisma.$transaction(async (tx) => {
      const r = await tx.formularioResposta.create({
        data: {
          versaoId: link.versaoId,
          linkId: link.id,
          clienteId: link.clienteId,
          valores: (valores ?? {}) as Prisma.InputJsonValue,
          assinatura: assinatura ? String(assinatura).slice(0, 400) : null,
          aceiteEm: aceite ? new Date() : null,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        },
      })

      for (const e of enviados) {
        const documento = await tx.documento.create({
          data: {
            id: e.documentoId,
            clienteId: link.clienteId!,
            nome: e.arquivo.name.slice(0, 200),
            categoria: 'OUTROS',
            origem: 'FORMULARIO',
            mime: e.arquivo.type || 'application/octet-stream',
            tamanho: e.arquivo.size,
            storageKey: e.chave,
            descricao: `Anexo de ${link.versao.formulario.nome}`,
            // Resposta pública não tem sessão: o autor do registro é quem criou o link.
            enviadoPorId: link.versao.formulario.criadoPorId,
          },
        })
        await tx.formularioAnexo.create({
          data: { respostaId: r.id, documentoId: documento.id, campo: e.campoId },
        })
      }

      await tx.formularioLink.update({ where: { id: link.id }, data: { usos: { increment: 1 } } })
      return r
    })
  } catch {
    await Promise.all(enviados.map((e) => removerArquivo(e.chave).catch(() => {})))
    return NextResponse.json({ error: 'Não foi possível registrar a resposta.' }, { status: 500 })
  }

  // Depois do commit, como todo gatilho.
  await dispararAutomacoes({
    gatilho: 'FORMULARIO_ENVIADO',
    // Resposta pública não tem sessão: a automação age em nome de quem gerou o link.
    userId: (await primeiroAdmin()) ?? '',
    funilId: null,
    etapaId: null,
    respostaId: resposta.id,
    clienteId: link.clienteId,
    titulo: link.versao.formulario.nome,
  })

  const aparencia = (definicao.aparencia ?? {}) as { mensagemFinal?: string }
  return NextResponse.json({
    ok: true,
    mensagem: aparencia.mensagemFinal ?? 'Recebemos sua resposta. Obrigado!',
  }, { status: 201 })
}

/** Ator das automações disparadas por resposta pública, que não tem sessão. */
async function primeiroAdmin(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', active: true }, select: { id: true }, orderBy: { createdAt: 'asc' },
  })
  return admin?.id ?? null
}
