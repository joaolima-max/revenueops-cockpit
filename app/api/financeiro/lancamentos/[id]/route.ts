import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, type TokenPayload } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { hasPermission } from '@/lib/permissions'
import { removerArquivo } from '@/lib/storage'

const STATUS = ['PENDENTE', 'PAGO', 'CANCELADO'] as const
type Status = (typeof STATUS)[number]

function podeGerenciar(session: TokenPayload): boolean {
  return hasPermission(session.permissoes ?? null, 'manage_financeiro', session.role)
}

function parseData(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(iso + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Edita UMA linha. Parcelas e recorrências existem como linhas independentes:
 * corrigir o valor de uma parcela não reescreve as outras, que é o que se
 * espera de um lançamento já materializado.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.lancamentoFinanceiro.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  const { descricao, categoriaId, valor, data, status, observacao } = await request.json()

  const desc = descricao === undefined ? undefined : String(descricao).trim()
  if (desc !== undefined && !desc) {
    return NextResponse.json({ error: 'Informe a descrição.' }, { status: 400 })
  }

  let n: number | undefined
  if (valor !== undefined) {
    n = Number(valor)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'O valor deve ser maior que zero.' }, { status: 400 })
    }
  }

  let dt: Date | undefined
  if (data !== undefined) {
    const p = parseData(String(data))
    if (!p) return NextResponse.json({ error: 'Data inválida. Use YYYY-MM-DD.' }, { status: 400 })
    dt = p
  }

  if (categoriaId !== undefined) {
    const categoria = await prisma.categoriaFinanceira.findUnique({ where: { id: String(categoriaId) } })
    if (!categoria) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    if (categoria.tipo !== atual.tipo) {
      return NextResponse.json({
        error: `A categoria ${categoria.nome} não é do mesmo tipo do lançamento.`,
      }, { status: 400 })
    }
  }

  const lancamento = await prisma.lancamentoFinanceiro.update({
    where: { id },
    data: {
      ...(desc ? { descricao: desc } : {}),
      ...(categoriaId !== undefined ? { categoriaId: String(categoriaId) } : {}),
      ...(n !== undefined ? { valor: n } : {}),
      ...(dt !== undefined ? { data: dt } : {}),
      ...(STATUS.includes(status) ? { status: status as Status } : {}),
      ...(observacao !== undefined
        ? { observacao: observacao ? String(observacao).slice(0, 1000) : null }
        : {}),
    },
    include: { categoria: { select: { id: true, nome: true, tipo: true } } },
  })

  await logAudit(session.userId, 'EDITOU_LANCAMENTO_FINANCEIRO', 'LancamentoFinanceiro', id, lancamento.descricao)
  return NextResponse.json({ lancamento })
}

/**
 * Exclui a linha — ou o grupo inteiro com `?grupo=1`, para quem cadastrou em
 * 12x e quer desfazer o cadastro, não apagar parcela por parcela.
 *
 * Os anexos saem junto: o vínculo é em cascata no banco, e os bytes no bucket
 * são removidos aqui porque o Storage não participa da transação.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGerenciar(session)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { id } = await params
  const atual = await prisma.lancamentoFinanceiro.findUnique({ where: { id } })
  if (!atual) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })

  const grupoInteiro = request.nextUrl.searchParams.get('grupo') === '1' && !!atual.grupoId
  const alvo = grupoInteiro ? { grupoId: atual.grupoId! } : { id }

  const docs = await prisma.documento.findMany({
    where: { anexoLancamento: { lancamento: alvo } },
    select: { id: true, storageKey: true },
  })

  const removidos = await prisma.lancamentoFinanceiro.deleteMany({ where: alvo })
  if (docs.length > 0) {
    await prisma.documento.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } })
    await Promise.all(docs.map((d) => removerArquivo(d.storageKey).catch(() => {})))
  }

  await logAudit(
    session.userId, 'EXCLUIU_LANCAMENTO_FINANCEIRO', 'LancamentoFinanceiro', id,
    `${atual.descricao} · ${removidos.count} linha${removidos.count === 1 ? '' : 's'}`,
  )

  return NextResponse.json({ ok: true, removidos: removidos.count })
}
