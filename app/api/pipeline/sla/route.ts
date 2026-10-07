import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { podeAdministrarPipeline } from '@/lib/pipeline'
import { funisVisiveis } from '@/lib/pipeline-db'
import { validarSla, SLA_MAX_DIAS } from '@/lib/sla'

/**
 * SLA POR FUNIL + ETAPA — ler e configurar.
 *
 * ── A CONFIGURAÇÃO MORA NA ETAPA ────────────────────────────────────────
 *
 * `PipelineEtapa.slaDias`. A etapa JÁ pertence a exatamente um funil, então a
 * configuração "por funil + etapa" é a própria linha — uma tabela à parte
 * precisaria de um UNIQUE para impedir duas configurações para a mesma etapa,
 * que é o que a coluna dá de graça.
 *
 * ── A ALÇADA É A DE ADMINISTRAR FUNIS ───────────────────────────────────
 *
 * Definir o SLA de uma etapa é configurar o funil, não operar o quadro: quem
 * move cards não decide o prazo que será cobrado dele. Por isso a mesma alçada
 * de `/api/pipeline/funis` e `/api/pipeline/etapas` — e por isso esta rota
 * entra no registro de módulos ao lado delas, sob `comercial.funis`.
 *
 * ── GET DEVOLVE OS FUNIS QUE O USUÁRIO ENXERGA ──────────────────────────
 *
 * Inclusive para quem não pode editar: a tela mostra o SLA configurado em modo
 * leitura, porque saber o prazo da própria etapa é informação de quem opera o
 * card. O que `administrar` governa é a escrita.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Os funis que a alçada do usuário deixa ver — a mesma função do quadro.
  // `incluirInativos`: a tela de configuração precisa poder ajustar o SLA de um
  // funil desativado antes de reativá-lo.
  const funis = await funisVisiveis(session, true)
  if (funis.length === 0) {
    return NextResponse.json({ funis: [], podeGerenciar: false, slaMax: SLA_MAX_DIAS })
  }

  const etapas = await prisma.pipelineEtapa.findMany({
    where: { funilId: { in: funis.map((f) => f.id) } },
    select: {
      id: true, funilId: true, nome: true, ordem: true, ativo: true,
      tipo: true, slaDias: true,
    },
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
  })

  return NextResponse.json({
    funis: funis.map((f) => ({
      id: f.id,
      nome: f.nome,
      area: f.area,
      ativo: f.ativo,
      etapas: etapas.filter((e) => e.funilId === f.id),
    })),
    podeGerenciar: podeAdministrarPipeline(session),
    slaMax: SLA_MAX_DIAS,
  })
}

/**
 * PUT — grava o SLA de uma ou mais etapas, de uma vez.
 *
 * ── POR QUE EM LOTE ─────────────────────────────────────────────────────
 *
 * Configurar SLA é uma tarefa de funil inteiro: define-se Prospecção 3,
 * Qualificação 5, Proposta 7, Negociação 5 e Fechamento 3 numa sentada. Uma
 * requisição por etapa faria cinco idas ao servidor e deixaria a tela em estado
 * parcial se a terceira falhasse.
 *
 * TUDO OU NADA, numa transação: um funil com três etapas configuradas e duas
 * não é pior que um funil sem configuração nenhuma, porque parece configurado.
 */
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeAdministrarPipeline(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await request.json()
  const entradas = body?.slas
  if (!Array.isArray(entradas) || entradas.length === 0) {
    return NextResponse.json(
      { error: 'Informe as etapas e os SLAs a gravar.' },
      { status: 400 },
    )
  }
  if (entradas.length > 200) {
    return NextResponse.json(
      { error: 'Grave no máximo 200 etapas por vez.' },
      { status: 400 },
    )
  }

  /**
   * VALIDA TUDO ANTES DE GRAVAR QUALQUER COISA.
   *
   * Validar dentro do laço de escrita deixaria as primeiras etapas gravadas e
   * as seguintes recusadas — e a transação desfaria tudo, mas a mensagem de
   * erro apontaria para a última etapa em vez da errada.
   */
  const normalizadas: Array<{ etapaId: string; slaDias: number | null }> = []
  for (const e of entradas) {
    const etapaId = String((e as Record<string, unknown>)?.etapaId ?? '').trim()
    if (!etapaId) {
      return NextResponse.json({ error: 'Etapa sem identificador.' }, { status: 400 })
    }
    const valor = validarSla((e as Record<string, unknown>)?.slaDias)
    if (typeof valor === 'string') {
      return NextResponse.json({ error: valor }, { status: 400 })
    }
    normalizadas.push({ etapaId, slaDias: valor })
  }

  // As etapas existem E pertencem a funis que o usuário enxerga? Sem esta
  // conferência, um id de etapa de outro funil gravaria SLA num funil que o
  // usuário não deveria nem listar.
  const visiveis = await funisVisiveis(session, true)
  const etapas = await prisma.pipelineEtapa.findMany({
    where: {
      id: { in: normalizadas.map((n) => n.etapaId) },
      funilId: { in: visiveis.map((f) => f.id) },
    },
    select: { id: true, nome: true, slaDias: true, funil: { select: { nome: true } } },
  })

  if (etapas.length !== normalizadas.length) {
    return NextResponse.json(
      {
        error: 'Uma ou mais etapas não foram encontradas, ou pertencem a um funil '
          + 'ao qual você não tem acesso.',
      },
      { status: 404 },
    )
  }

  const antes = new Map(etapas.map((e) => [e.id, e]))

  await prisma.$transaction(
    normalizadas.map((n) => prisma.pipelineEtapa.update({
      where: { id: n.etapaId },
      data: { slaDias: n.slaDias },
    })),
  )

  /**
   * A AUDITORIA REGISTRA SÓ O QUE MUDOU.
   *
   * A tela manda o funil inteiro a cada salvamento, e registrar as cinco etapas
   * toda vez encheria a trilha de linhas que dizem "continua 5 dias". O que
   * interessa auditar é a alteração.
   */
  const mudancas = normalizadas
    .filter((n) => (antes.get(n.etapaId)?.slaDias ?? null) !== n.slaDias)
    .map((n) => {
      const e = antes.get(n.etapaId)!
      const de = e.slaDias === null ? 'sem SLA' : `${e.slaDias}d`
      const para = n.slaDias === null ? 'sem SLA' : `${n.slaDias}d`
      return `${e.funil.nome} › ${e.nome}: ${de} → ${para}`
    })

  if (mudancas.length > 0) {
    await logAudit(
      session.userId, 'CONFIGUROU_SLA_PIPELINE', 'PipelineEtapa',
      normalizadas[0].etapaId, mudancas.join(' · '),
    )
  }

  return NextResponse.json({ ok: true, alteradas: mudancas.length })
}
