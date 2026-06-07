import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status, dataPago, dataFatura, descricao, valor, dataVenc, notas } = body

  const updateData: Record<string, unknown> = {}
  if (status) updateData.status = status
  if (status === 'PAGO') updateData.dataPago = dataPago ? new Date(dataPago) : new Date()
  if (status === 'FATURADO') updateData.dataFatura = dataFatura ? new Date(dataFatura) : new Date()
  if (descricao) updateData.descricao = descricao
  if (valor !== undefined) updateData.valor = parseFloat(valor)
  if (dataVenc) updateData.dataVenc = new Date(dataVenc)
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

  const { id } = await params
  await prisma.contaReceber.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
