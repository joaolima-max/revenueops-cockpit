import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { periodoAtual, metasDoPeriodo } from '@/lib/kpi'
import {
  META_TIPOS, META_DIRECOES, META_UNIDADES, PADRAO_POR_TIPO, validarValorMeta,
  type MetaTipo, type MetaDirecao, type MetaUnidade,
} from '@/lib/metas'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const periodo = request.nextUrl.searchParams.get('periodo') || periodoAtual()
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }
  // metasDoPeriodo devolve o alvo, o realizado derivado e a avaliacao, mas nao
  // o id nem o periodo — e o client precisa deles para editar e excluir. Une as
  // duas fontes sem alterar metasDoPeriodo, que e compartilhada com o Cockpit.
  const [registros, calculadas] = await Promise.all([
    prisma.meta.findMany({ where: { periodo }, orderBy: { tipo: 'asc' } }),
    metasDoPeriodo(periodo),
  ])
  const derivado = new Map(calculadas.map((m) => [m.tipo, m]))
  const metas = registros.map((r) => {
    const d = derivado.get(r.tipo)
    return {
      id: r.id,
      tipo: r.tipo,
      valor: r.valor,
      periodo: r.periodo,
      direcao: r.direcao,
      unidade: r.unidade,
      realizado: d?.realizado ?? null,
      atingimento: d?.atingimento ?? null,
      situacao: d?.situacao ?? 'SEM_REALIZADO',
      positivo: d?.positivo ?? false,
      diferenca: d?.diferenca ?? null,
    }
  })
  return NextResponse.json({ periodo, metas })
}

/**
 * Define ou atualiza a meta de um indicador.
 *
 * SÓ O ALVO. O realizado nunca entra por aqui: vem do Lançamento Diário, e um
 * campo de realizado na meta criaria uma segunda verdade sobre o mesmo número.
 *
 * DIREÇÃO é obrigatória no modelo e tem padrão por tipo: uma meta de MED em 2%
 * nasce como MENOR_MELHOR, e o usuário pode mudar. Sem isso o sistema teria que
 * adivinhar se 1,5% contra uma meta de 2% é bom ou ruim.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const { tipo, periodo, valor, direcao, unidade } = await request.json()
  if (!META_TIPOS.includes(tipo as MetaTipo)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${META_TIPOS.join(', ')}` }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}$/.test(String(periodo))) {
    return NextResponse.json({ error: 'Período inválido. Use YYYY-MM.' }, { status: 400 })
  }

  const padrao = PADRAO_POR_TIPO[tipo as MetaTipo]
  const dir: MetaDirecao = META_DIRECOES.includes(direcao) ? direcao : padrao.direcao
  const uni: MetaUnidade = META_UNIDADES.includes(unidade) ? unidade : padrao.unidade

  const n = Number(valor)
  const problema = validarValorMeta(n, uni)
  if (problema) return NextResponse.json({ error: problema }, { status: 400 })

  const meta = await prisma.meta.upsert({
    where: { tipo_periodo: { tipo: tipo as MetaTipo, periodo } },
    create: { tipo: tipo as MetaTipo, periodo, valor: n, direcao: dir, unidade: uni },
    update: { valor: n, direcao: dir, unidade: uni },
  })

  await prisma.auditoria.create({
    data: {
      acao: 'DEFINIR_META', entidade: 'Meta', entidadeId: meta.id,
      detalhes: `${tipo} em ${periodo}: ${n} (${uni}, ${dir})`, userId: session.userId,
    },
  })

  return NextResponse.json({ meta })
}
