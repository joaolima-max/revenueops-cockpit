import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { conflitoDeVigencia, periodoValido } from '@/lib/volumetria'

function podeGerenciar(role: string): boolean {
  return role !== 'COMERCIAL'
}

/** Edita quantidade, vigência e notas. O cliente do contrato é imutável. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.volumetriaMinima.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 })
  if (atual.clienteId === null) {
    return NextResponse.json({
      error: 'Contrato geral legado é somente leitura. Crie uma configuração vinculada a um cliente.',
    }, { status: 409 })
  }

  const body = await request.json()
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

  const conflito = await conflitoDeVigencia(
    atual.clienteId, { periodo: inicio, vigenciaFim: fim, ativo: atual.ativo }, id,
  )
  if (conflito) {
    return NextResponse.json({
      error: `A vigência informada se sobrepõe a outra configuração ativa do mesmo cliente (a partir de ${conflito.vigenciaInicio}).`,
    }, { status: 409 })
  }

  const contrato = await prisma.volumetriaMinima.update({
    where: { id },
    data: {
      periodo: inicio,
      vigenciaFim: fim,
      qtdMinima: n,
      ...(body.notas !== undefined ? { notas: body.notas ? String(body.notas).slice(0, 500) : null } : {}),
    },
  })

  await logAudit(
    session.userId, 'EDITOU_VOLUMETRIA', 'VolumetriaMinima', id,
    `${atual.cliente?.nome ?? '—'}: mínimo ${atual.qtdMinima} → ${n}, vigência ${inicio}${fim ? ` até ${fim}` : ' (indeterminada)'}`,
  )

  return NextResponse.json({ contrato })
}

/**
 * Inativa ou reativa. Não existe exclusão: o histórico do cliente é
 * preservado inteiro, e um contrato inativo simplesmente para de somar no
 * mínimo consolidado.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const { ativo } = await request.json()
  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'Informe ativo: true ou false.' }, { status: 400 })
  }

  const atual = await prisma.volumetriaMinima.findUnique({
    where: { id }, include: { cliente: { select: { nome: true } } },
  })
  if (!atual) return NextResponse.json({ error: 'Configuração não encontrada.' }, { status: 404 })
  if (atual.clienteId === null) {
    return NextResponse.json({ error: 'Contrato geral legado é somente leitura.' }, { status: 409 })
  }

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
    `${atual.cliente?.nome ?? '—'}: vigência a partir de ${atual.periodo}`,
  )

  return NextResponse.json({ contrato })
}
