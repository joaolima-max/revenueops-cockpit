import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const {
    status, dataPago, dataFatura, descricao, tipo, valor, dataVenc,
    parcela, totalParcel, clienteId, notas,
  } = body

  const atual = await prisma.contaReceber.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Título não encontrado.' }, { status: 404 })

  if (clienteId && clienteId !== atual.clienteId) {
    const existe = await prisma.cliente.count({ where: { id: String(clienteId) } })
    if (!existe) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}
  if (status) updateData.status = status
  if (status === 'PAGO') updateData.dataPago = dataPago ? new Date(dataPago) : new Date()
  if (status === 'FATURADO') updateData.dataFatura = dataFatura ? new Date(dataFatura) : new Date()
  // Reabrir limpa a baixa: manter a data de pagamento num título que voltou a
  // ficar em aberto faria o relatório de recebidos contar algo que não entrou.
  if (status === 'PENDENTE' || status === 'INADIMPLENTE') updateData.dataPago = null

  if (descricao) updateData.descricao = descricao
  if (tipo) updateData.tipo = tipo
  if (clienteId) updateData.clienteId = String(clienteId)
  if (valor !== undefined) updateData.valor = parseFloat(valor)
  if (dataVenc) updateData.dataVenc = new Date(dataVenc)
  if (parcela !== undefined) updateData.parcela = parcela ? parseInt(String(parcela), 10) : null
  if (totalParcel !== undefined) updateData.totalParcel = totalParcel ? parseInt(String(totalParcel), 10) : null
  if (notas !== undefined) updateData.notas = notas || null

  const conta = await prisma.contaReceber.update({
    where: { id },
    data: updateData,
    include: { cliente: { select: { id: true, nome: true, modeloOperacional: true } } },
  })

  return NextResponse.json({ conta })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  await prisma.contaReceber.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
