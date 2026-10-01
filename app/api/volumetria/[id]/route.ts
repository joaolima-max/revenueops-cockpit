import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { conflitoDeVigencia, periodoValido, podeAdministrarVolumetria } from '@/lib/volumetria'

const NEGADO = 'Apenas administradores podem editar ou excluir volumetria.'

/**
 * CONTRATO GERAL LEGADO (clienteId nulo) — por que ele deixou de ser bloqueado.
 *
 * Até esta rodada, PUT, PATCH e DELETE recusavam qualquer linha com
 * `clienteId` nulo com a mensagem "contrato geral legado é somente leitura".
 * A intenção era proteger os alertas de meses já fechados, que foram apurados
 * com base nessas linhas.
 *
 * O efeito prático foi outro: a ÚNICA volumetria existente em Production é
 * justamente uma linha legada (criada pelo seed, sem cliente), e ela ficou
 * impossível de editar ou excluir — a UI escondia os botões e a API devolvia
 * 409 mesmo para ADMIN. O produto prometia um CRUD que não existia.
 *
 * A proteção correta não é impedir a edição: é o próprio ADMIN ser a alçada,
 * a confirmação explícita na tela e a trilha de Auditoria. Agora o legado é
 * editável como qualquer outro contrato — e informar um cliente ADOTA a linha
 * no modelo atual, que é a forma natural de ela deixar de ser legado.
 */

/** Edita quantidade, vigência, notas e — no legado — o cliente do contrato. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeAdministrarVolumetria(session.role)) return NextResponse.json({ error: NEGADO }, { status: 403 })

  const { id } = await params
  const atual = await prisma.volumetriaMinima.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 })

  const body = await request.json()

  /**
   * CLIENTE. Num contrato já vinculado o cliente é imutável: trocá-lo moveria
   * uma exigência contratual de uma empresa para outra, o que não é edição, é
   * outro contrato. No contrato geral legado, informar um cliente é o caminho
   * de ADOÇÃO — e é por isso que só esse caso aceita a mudança.
   */
  let clienteId: string | null = atual.clienteId
  if (body.clienteId !== undefined) {
    const informado = body.clienteId ? String(body.clienteId) : null

    if (atual.clienteId !== null && informado !== atual.clienteId) {
      return NextResponse.json({
        error: 'O cliente de um contrato já vinculado não pode ser trocado. '
          + 'Encerre este contrato e crie um novo para o outro cliente.',
      }, { status: 409 })
    }

    if (informado && informado !== atual.clienteId) {
      const existe = await prisma.cliente.count({ where: { id: informado } })
      if (!existe) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
    }
    clienteId = informado
  }

  const inicio = body.vigenciaInicio !== undefined ? String(body.vigenciaInicio) : atual.periodo
  const fim = body.vigenciaFim !== undefined ? (body.vigenciaFim ? String(body.vigenciaFim) : null) : atual.vigenciaFim

  if (!periodoValido(inicio)) {
    return NextResponse.json({ error: 'Início da vigência inválido. Use YYYY-MM.' }, { status: 400 })
  }
  if (fim !== null && !periodoValido(fim)) {
    return NextResponse.json({ error: 'Fim da vigência inválido. Use YYYY-MM.' }, { status: 400 })
  }
  if (fim !== null && fim < inicio) {
    return NextResponse.json({ error: 'O fim da vigência não pode ser anterior ao início.' }, { status: 400 })
  }

  const n = body.qtdMinima !== undefined ? Math.round(Number(body.qtdMinima)) : atual.qtdMinima
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: 'A quantidade mínima deve ser um número maior que zero.' }, { status: 400 })
  }

  // Conflito é POR CLIENTE. Sem cliente não há sobreposição a verificar.
  const conflito = await conflitoDeVigencia(
    clienteId, { periodo: inicio, vigenciaFim: fim, ativo: atual.ativo }, id,
  )
  if (conflito) {
    return NextResponse.json({
      error: `A vigência informada se sobrepõe a outra configuração ativa do mesmo cliente (a partir de ${conflito.vigenciaInicio}).`,
    }, { status: 409 })
  }

  const contrato = await prisma.volumetriaMinima.update({
    where: { id },
    data: {
      clienteId,
      periodo: inicio,
      vigenciaFim: fim,
      qtdMinima: n,
      ...(body.notas !== undefined ? { notas: body.notas ? String(body.notas).slice(0, 500) : null } : {}),
    },
    include: { cliente: { select: { nome: true } } },
  })

  const adotou = atual.clienteId === null && clienteId !== null
  await logAudit(
    session.userId, 'EDITOU_VOLUMETRIA', 'VolumetriaMinima', id,
    `${contrato.cliente?.nome ?? 'contrato geral'}: mínimo ${atual.qtdMinima} → ${n}, `
      + `vigência ${inicio}${fim ? ` até ${fim}` : ' (indeterminada)'}`
      + (adotou ? ' · contrato geral legado adotado por cliente' : ''),
  )

  return NextResponse.json({ contrato })
}

/**
 * Inativa ou reativa. Preserva o histórico inteiro: um contrato inativo
 * simplesmente para de somar no mínimo consolidado.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeAdministrarVolumetria(session.role)) return NextResponse.json({ error: NEGADO }, { status: 403 })

  const { id } = await params
  const { ativo } = await request.json()
  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'Informe ativo: true ou false.' }, { status: 400 })
  }

  const atual = await prisma.volumetriaMinima.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 })

  // Reativar pode recriar uma sobreposição que a inativação tinha resolvido.
  if (ativo && !atual.ativo) {
    const conflito = await conflitoDeVigencia(
      atual.clienteId, { periodo: atual.periodo, vigenciaFim: atual.vigenciaFim, ativo: true }, id,
    )
    if (conflito) {
      return NextResponse.json({
        error: `Não é possível reativar: a vigência se sobrepõe a outra configuração ativa do cliente (a partir de ${conflito.vigenciaInicio}).`,
      }, { status: 409 })
    }
  }

  const contrato = await prisma.volumetriaMinima.update({ where: { id }, data: { ativo } })

  await logAudit(
    session.userId, ativo ? 'REATIVOU_VOLUMETRIA' : 'INATIVOU_VOLUMETRIA', 'VolumetriaMinima', id,
    `${atual.cliente?.nome ?? 'contrato geral'}: vigência a partir de ${atual.periodo}`,
  )

  return NextResponse.json({ contrato })
}

/**
 * Exclui o contrato de volumetria.
 *
 * DEPENDÊNCIAS: `VolumetriaMinima` não tem filhos — nenhum modelo do schema
 * aponta para ela. Excluir não arrasta histórico de nenhuma outra tabela, e é
 * por isso que a exclusão física é segura aqui (diferente de etapa de funil,
 * que o histórico de movimentação referencia).
 *
 * O que a exclusão MUDA é o mínimo consolidado dos meses que a vigência
 * cobria, inclusive os já fechados. Por isso a interface confirma nomeando
 * esse efeito e oferece Inativar como alternativa, que preserva o passado.
 *
 * A checagem de dependência é feita de fato, e não assumida: se um dia algum
 * modelo passar a referenciar VolumetriaMinima, a exclusão é bloqueada com
 * explicação em vez de estourar violação de FK.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeAdministrarVolumetria(session.role)) return NextResponse.json({ error: NEGADO }, { status: 403 })

  const { id } = await params
  const atual = await prisma.volumetriaMinima.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 })

  try {
    await prisma.volumetriaMinima.delete({ where: { id } })
  } catch {
    return NextResponse.json({
      error: 'Não foi possível excluir: há registros vinculados a esta volumetria. '
        + 'Use Inativar, que preserva o histórico.',
    }, { status: 409 })
  }

  await logAudit(
    session.userId, 'EXCLUIU_VOLUMETRIA', 'VolumetriaMinima', id,
    `${atual.cliente?.nome ?? 'contrato geral'}: mínimo ${atual.qtdMinima} a partir de ${atual.periodo}`
      + `${atual.vigenciaFim ? ` até ${atual.vigenciaFim}` : ''}`,
  )

  return NextResponse.json({ ok: true })
}
