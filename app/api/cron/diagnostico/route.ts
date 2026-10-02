import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  calcularMrr, resultadoDoPeriodo, inadimplenciaDoPeriodo, gastoPorCategoria,
  receitaPorParceiro, receitaPorNatureza, evolucaoFinanceira, contasAPagar,
} from '@/lib/financeiro'
import { periodoAtual, ultimosPeriodos } from '@/lib/periodo'
import { podeVerConselho, estadoDoUsuario } from '@/lib/autorizacao'
import { checkAccess } from '@/lib/modules'

/**
 * DIAGNÓSTICO TEMPORÁRIO — **REMOVER** depois de usar.
 *
 * Existe porque duas falhas só aparecem em PRODUÇÃO e os testes locais não as
 * reproduzem: a tela Financeiro › Visão Geral estoura, e o Conselho não abre.
 * Sem `DATABASE_URL` no ambiente local, nenhuma query real roda aqui — então
 * a única forma de saber QUAL consulta falha é perguntar ao ambiente que tem
 * o banco.
 *
 * Roda cada consulta da Visão Geral ISOLADAMENTE e devolve qual estourou e
 * com que mensagem, em vez de um erro único que o boundary engole.
 *
 * SEGURANÇA:
 *   - vive sob `/api/cron`, o único prefixo público do proxy, e por isso
 *     precisa do próprio segredo: sem ele, 401;
 *   - NÃO devolve dado de negócio — só contagens, nomes de consulta e
 *     mensagens de erro;
 *   - para o Conselho, devolve o veredito do portão e os booleanos que o
 *     compõem. Nenhuma senha, nenhum token, nenhum e-mail além do consultado.
 */
export const dynamic = 'force-dynamic'

async function medir(nome: string, fn: () => Promise<unknown>) {
  const t0 = Date.now()
  try {
    const r = await fn()
    return {
      consulta: nome, ok: true, ms: Date.now() - t0,
      // Só a FORMA do resultado, nunca o conteúdo.
      forma: Array.isArray(r) ? `array(${r.length})` : typeof r === 'object' && r
        ? `objeto{${Object.keys(r).join(',')}}` : typeof r,
    }
  } catch (e) {
    return {
      consulta: nome, ok: false, ms: Date.now() - t0,
      erro: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 1200) : String(e).slice(0, 600),
    }
  }
}

export async function GET(request: NextRequest) {
  const esperado = process.env.DIAGNOSTICO_SECRET
  const enviado = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!esperado || enviado !== esperado) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const p = periodoAtual()
  const serie = ultimosPeriodos(12)

  /* ── FINANCEIRO: cada consulta da Visão Geral, isolada ─────────────── */
  const financeiro = []
  financeiro.push(await medir('calcularMrr', () => calcularMrr(p)))
  financeiro.push(await medir('resultadoDoPeriodo', () => resultadoDoPeriodo(p)))
  financeiro.push(await medir('inadimplenciaDoPeriodo', () => inadimplenciaDoPeriodo(p)))
  financeiro.push(await medir('gastoPorCategoria', () => gastoPorCategoria(p)))
  financeiro.push(await medir('receitaPorParceiro', () => receitaPorParceiro(p)))
  financeiro.push(await medir('receitaPorNatureza', () => receitaPorNatureza(p)))
  financeiro.push(await medir('evolucaoFinanceira', () => evolucaoFinanceira(serie)))
  financeiro.push(await medir('contasAPagar', () => contasAPagar({ periodo: p })))

  /* ── O construto suspeito, nu: filtro de RELAÇÃO numa agregação ────── */
  const relacao = []
  relacao.push(await medir('groupBy + relacao null', () =>
    prisma.lancamentoFinanceiro.groupBy({
      by: ['tipo'], where: { baasContaPagar: null }, _sum: { valor: true },
    })))
  relacao.push(await medir('groupBy + relacao is:null', () =>
    prisma.lancamentoFinanceiro.groupBy({
      by: ['tipo'], where: { baasContaPagar: { is: null } }, _sum: { valor: true },
    })))
  relacao.push(await medir('aggregate + relacao isNot:null', () =>
    prisma.lancamentoFinanceiro.aggregate({
      where: { tipo: 'DESPESA', baasContaPagar: { isNot: null } }, _sum: { valor: true },
    })))
  relacao.push(await medir('groupBy SEM relacao (controle)', () =>
    prisma.lancamentoFinanceiro.groupBy({ by: ['tipo'], _sum: { valor: true } })))

  /* ── CONSELHO: o portão, para os dois sócios ───────────────────────── */
  const conselho = []
  for (const email of ['joaolima@basspago.com', 'ma@basspago.com']) {
    try {
      const u = await prisma.user.findFirst({
        where: { email }, select: { id: true, name: true, role: true, active: true },
      })
      if (!u) { conselho.push({ email, achado: false }); continue }
      const estado = await estadoDoUsuario(u.id)
      const sessaoFalsa = { userId: u.id, role: u.role, email, name: u.name }
      conselho.push({
        email,
        achado: true,
        ativo: u.active,
        isPartner: estado?.isPartner ?? null,
        temViewConselho: estado?.permissoes.includes('view_conselho') ?? null,
        nChaves: estado?.permissoes.length ?? null,
        // O portão REAL da página.
        portao: await podeVerConselho(sessaoFalsa as never),
        // O veredito do PROXY, com a lista do banco e sem ela — é a diferença
        // entre o token recém-emitido e o token de 7 dias atrás.
        proxyComChave: checkAccess('/dashboard/conselho', u.role, estado?.permissoes ?? null),
        proxySemChave: checkAccess('/dashboard/conselho', u.role, ['view_auditoria']),
      })
    } catch (e) {
      conselho.push({ email, erro: e instanceof Error ? e.message.slice(0, 400) : String(e) })
    }
  }

  /* ── AS PÁGINAS, EXECUTADAS ─────────────────────────────────────────
   *
   * Um server component é uma função async: chamá-la roda o corpo inteiro —
   * as consultas, os cálculos e a construção do JSX. É o mais perto que se
   * chega do que o servidor faz, e um throw no corpo aparece aqui em vez de
   * virar o boundary genérico.
   *
   * `redirect()` do Next é implementado LANÇANDO uma exceção com digest
   * `NEXT_REDIRECT`. Sem sessão, as páginas protegidas redirecionam para o
   * login — então esse caso é reconhecido e reportado como redirecionamento,
   * não como falha. */
  const paginas = []
  const ehRedirect = (e: unknown) =>
    !!e && typeof e === 'object' && 'digest' in e
    && String((e as { digest?: unknown }).digest).startsWith('NEXT_REDIRECT')

  const alvos: Array<[string, () => Promise<unknown>]> = [
    ['financeiro', async () => {
      const m = await import('@/app/dashboard/financeiro/page')
      return m.default({ searchParams: Promise.resolve({}) })
    }],
    ['financeiro?periodo', async () => {
      const m = await import('@/app/dashboard/financeiro/page')
      return m.default({ searchParams: Promise.resolve({ periodo: p }) })
    }],
    ['metas', async () => {
      const m = await import('@/app/dashboard/metas/page')
      return m.default()
    }],
  ]

  for (const [nome, fn] of alvos) {
    const t0 = Date.now()
    try {
      await fn()
      paginas.push({ pagina: nome, ok: true, ms: Date.now() - t0 })
    } catch (e) {
      paginas.push({
        pagina: nome,
        ok: ehRedirect(e),
        redirect: ehRedirect(e),
        ms: Date.now() - t0,
        erro: e instanceof Error
          ? `${e.name}: ${e.message}`.slice(0, 1500)
          : String(e).slice(0, 600),
        stack: e instanceof Error ? (e.stack ?? '').split('\n').slice(1, 6).join(' | ').slice(0, 1200) : undefined,
      })
    }
  }

  return NextResponse.json({
    periodo: p,
    financeiro,
    relacao,
    conselho,
    paginas,
    falhas: [...financeiro, ...relacao, ...paginas.map((x) => ({ ...x, consulta: x.pagina }))]
      .filter((x) => !x.ok)
      .map((x) => ('consulta' in x ? x.consulta : 'desconhecido')),
  })
}
