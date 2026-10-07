import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  podeVerCentrosCusto, podeGerenciarCentrosCustoDoBanco,
} from '@/lib/previsao-acesso'

/**
 * CENTROS DE CUSTO — a área que consome ou gera o dinheiro.
 *
 * Estrutura PLANA: sem pai, sem árvore, sem rateio. Centro de custo
 * hierárquico obriga a decidir, em cada tela, se o número de um nó inclui os
 * filhos — e essa decisão volta a ser tomada a cada consulta. A taxonomia de
 * Categorias nesta mesma base é plana pelo mesmo motivo.
 *
 * Mora em Cadastros Financeiros porque é cadastro, e é usado em DOIS lugares:
 * nos lançamentos (para que o realizado possa ser atribuído a uma área) e no
 * orçamento. Ver `lib/previsao-acesso.ts` para a alçada.
 */
export const dynamic = 'force-dynamic'

/** Nome e código normalizados, ou o erro que impede gravar. */
function validar(body: Record<string, unknown>): { nome: string; codigo: string | null; descricao: string | null } | string {
  const nome = String(body.nome ?? '').trim()
  if (!nome) return 'Informe o nome do centro de custo.'
  if (nome.length > 80) return 'O nome do centro de custo deve ter no máximo 80 caracteres.'

  // O código é OPCIONAL e apenas descritivo — quem identifica a linha é o id.
  // Em maiúsculas por convenção de cadastro ("COM", "TEC"), e curto: ele
  // aparece ao lado do nome em listas apertadas.
  const codigoBruto = String(body.codigo ?? '').trim()
  if (codigoBruto.length > 12) return 'O código deve ter no máximo 12 caracteres.'

  const descricao = String(body.descricao ?? '').trim()
  if (descricao.length > 500) return 'A descrição deve ter no máximo 500 caracteres.'

  return {
    nome,
    codigo: codigoBruto ? codigoBruto.toUpperCase() : null,
    descricao: descricao || null,
  }
}

/**
 * GET — a lista.
 *
 * `incluirInativos=1` serve a tela de cadastro, que precisa poder reativar.
 * Os formulários de lançamento e de orçamento pedem a lista SEM o parâmetro:
 * oferecer um centro inativo para classificação é oferecer uma área que a
 * empresa já desativou.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeVerCentrosCusto(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const incluirInativos = request.nextUrl.searchParams.get('incluirInativos') === '1'

  const centros = await prisma.centroCusto.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
  })

  return NextResponse.json({
    centros,
    podeGerenciar: await podeGerenciarCentrosCustoDoBanco(session),
  })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await podeGerenciarCentrosCustoDoBanco(session))) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const dados = validar(await request.json())
  if (typeof dados === 'string') return NextResponse.json({ error: dados }, { status: 400 })

  // O nome é UNIQUE no banco. A conferência aqui existe para a mensagem ser
  // legível em vez de um erro de constraint — o banco continua sendo a
  // garantia, porque duas requisições simultâneas passariam por esta checagem.
  const jaExiste = await prisma.centroCusto.findFirst({ where: { nome: dados.nome } })
  if (jaExiste) {
    return NextResponse.json(
      { error: `Já existe um centro de custo chamado ${dados.nome}.` },
      { status: 409 },
    )
  }

  try {
    const centro = await prisma.centroCusto.create({ data: dados })
    await logAudit(
      session.userId, 'CRIOU_CENTRO_CUSTO', 'CentroCusto', centro.id,
      `${centro.nome}${centro.codigo ? ` (${centro.codigo})` : ''}`,
    )
    return NextResponse.json({ centro }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      return NextResponse.json(
        { error: `Já existe um centro de custo chamado ${dados.nome}.` },
        { status: 409 },
      )
    }
    throw e
  }
}
