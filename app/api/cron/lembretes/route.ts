import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notificar, destinatariosPorDepartamento } from '@/lib/notificacoes'
import { ehTerminal, type Status } from '@/lib/compliance'
import { situacaoDoTitulo, situacaoDoRecebivel } from '@/lib/financeiro'
import {
  lembretesDeTarefas, lembretesDeFollowUp, lembretesDeCompliance,
  lembretesDeTitulos, lembreteDeLancamentoAusente, diaUtc, diaIso,
} from '@/lib/lembretes'
import { alertasDeSla } from '@/lib/sla'

/**
 * MOTOR DE LEMBRETES. Uma execução por dia, pelo cron da Vercel.
 *
 * Não é um ambiente de "Automações": é uma rota só, sem tela, sem
 * configuração e sem regras editáveis em banco. As regras são as deste
 * código, e as datas de disparo são calculadas por `lib/lembretes.ts`.
 *
 * SEGURANÇA: o cron da Vercel chega com `Authorization: Bearer $CRON_SECRET`.
 * Sem o segredo configurado a rota recusa tudo — abrir um endpoint que
 * escreve notificações para qualquer visitante seria pior que não ter cron.
 * Um ADMIN autenticado também pode disparar, para conseguir verificar o
 * comportamento sem esperar a madrugada.
 *
 * IDEMPOTENTE. Cada lembrete tem `chave` UNIQUE, e o insert usa
 * `skipDuplicates`: rodar duas vezes no mesmo dia não duplica nada. É o banco
 * que garante, não a ordem das chamadas.
 *
 * NUNCA DERRUBA TUDO POR UMA PARTE. Cada bloco é independente: se o
 * financeiro não tiver ninguém cadastrado, os lembretes de tarefa continuam
 * saindo.
 */
export const dynamic = 'force-dynamic'

/** A janela em que um prazo pode virar lembrete: 7 dias à frente, 1 atrás. */
const JANELA_FRENTE_DIAS = 8
const JANELA_TRAS_DIAS = 2

/**
 * O título ainda está em cobrança?
 *
 * Só A_VENCER e VENCIDA geram lembrete. Pago, baixado e cancelado saíram da
 * fila — cobrar um título já pago é o tipo de aviso que faz a central perder
 * credibilidade.
 */
function emCobranca(situacao: string): boolean {
  return situacao === 'A_VENCER' || situacao === 'VENCIDA'
}

function janela(hoje: Date) {
  return {
    de: new Date(diaUtc(hoje) - JANELA_TRAS_DIAS * 86400000),
    ate: new Date(diaUtc(hoje) + JANELA_FRENTE_DIAS * 86400000),
  }
}

async function autorizar(request: NextRequest): Promise<boolean> {
  const segredo = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (segredo && header === `Bearer ${segredo}`) return true

  // Disparo manual por ADMIN — para verificar sem esperar o cron.
  const { getSession } = await import('@/lib/auth')
  const session = await getSession()
  return session?.role === 'ADMIN'
}

export async function GET(request: NextRequest) {
  if (!(await autorizar(request))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const hoje = new Date()
  const { de, ate } = janela(hoje)

  const [financeiro, compliance] = await Promise.all([
    destinatariosPorDepartamento('FINANCEIRO'),
    destinatariosPorDepartamento('COMPLIANCE'),
  ])

  const resultado: Record<string, number> = {}

  /* ── TAREFAS — 7, 3, 1, no dia, 1 após ──────────────────────────────── */
  const tarefas = await prisma.tarefa.findMany({
    where: {
      status: { in: ['PENDENTE', 'EM_ANDAMENTO'] },
      dueDate: { gte: de, lt: ate },
    },
    select: { id: true, titulo: true, dueDate: true, status: true, responsavelId: true },
  })
  resultado.tarefas = await notificar(lembretesDeTarefas(tarefas, hoje))

  /* ── FOLLOW UP — no dia ─────────────────────────────────────────────── */
  const followUps = await prisma.followUp.findMany({
    where: { proximoContato: { gte: de, lt: ate }, responsavelId: { not: null } },
    select: {
      id: true, titulo: true, proximoContato: true, responsavelId: true,
      cliente: { select: { nome: true } },
    },
  })
  resultado.followUps = await notificar(
    lembretesDeFollowUp(
      followUps.map((f) => ({ ...f, clienteNome: f.cliente.nome })),
      hoje,
    ),
  )

  /* ── COMPLIANCE — 3 antes, no dia, 1 após ───────────────────────────── */
  const pendencias = await prisma.pendenciaCompliance.findMany({
    where: { prazo: { gte: de, lt: ate }, status: { notIn: ['RESOLVIDA', 'CANCELADA'] } },
    select: {
      id: true, prazo: true, status: true, responsavelId: true,
      cliente: { select: { nome: true } },
    },
  })
  resultado.compliance = await notificar(
    lembretesDeCompliance(
      pendencias.map((p) => ({ ...p, clienteNome: p.cliente.nome })),
      hoje,
      (s) => ehTerminal(s as Status),
    ),
  )

  /* ── CONTAS A PAGAR — lançamentos de DESPESA pelo vencimento ────────── */
  // Mesma base da tela: não existe segunda tabela de contas a pagar.
  const aPagar = await prisma.lancamentoFinanceiro.findMany({
    where: { tipo: 'DESPESA', dataVencimento: { gte: de, lt: ate } },
    select: { id: true, descricao: true, dataVencimento: true, status: true },
  })
  resultado.contasAPagar = await notificar(
    lembretesDeTitulos(
      aPagar.map((t) => ({
        id: t.id,
        descricao: t.descricao,
        vencimento: t.dataVencimento,
        // "Encerrado" pela MESMA regra da tela: pago e cancelado saem da fila.
        // Sem vencimento não há prazo a cobrar — `lembretesDeTitulos` já
        // descarta, e aqui evitamos passar null para a regra de situação.
        encerrado: t.dataVencimento === null || !emCobranca(
          situacaoDoTitulo(t.status, t.dataVencimento, hoje).situacao,
        ),
      })),
      financeiro, hoje, 'PAGAR',
    ),
  )

  /* ── CONTAS A RECEBER ───────────────────────────────────────────────── */
  const aReceber = await prisma.contaReceber.findMany({
    where: { dataVenc: { gte: de, lt: ate } },
    select: { id: true, descricao: true, dataVenc: true, status: true },
  })
  resultado.contasAReceber = await notificar(
    lembretesDeTitulos(
      aReceber.map((t) => ({
        id: t.id,
        descricao: t.descricao,
        vencimento: t.dataVenc,
        encerrado: t.dataVenc === null || !emCobranca(
          situacaoDoRecebivel(t.status, t.dataVenc, hoje).situacao,
        ),
      })),
      financeiro, hoje, 'RECEBER',
    ),
  )

  /* ── LANÇAMENTO DIÁRIO — ausência ───────────────────────────────────── */
  const dias = await prisma.lancamentoDiario.findMany({
    where: { data: { gte: de, lt: ate } },
    select: { data: true },
  })
  resultado.lancamentoDiario = await notificar(
    lembreteDeLancamentoAusente(
      new Set(dias.map((d) => diaIso(d.data))),
      financeiro, hoje,
    ),
  )

  /* ── SLA DO PIPELINE — card parado além do prazo da etapa ──────────── */
  /**
   * ── POR QUE O ALERTA DE SLA VIVE NO CRON, E NÃO NO MOVIMENTO DO CARD ──
   *
   * Porque o evento que importa é a PASSAGEM DO TEMPO, não uma ação. Um card
   * que vence o SLA vence porque ninguém o tocou — não há requisição nenhuma
   * no instante do vencimento para pendurar o aviso.
   *
   * ── SÓ CARDS QUE PODEM VENCER ────────────────────────────────────────
   *
   * EM_ANDAMENTO, não excluído, com etapa, com responsável e numa etapa que
   * tenha SLA. Cada filtro tira um falso positivo:
   *
   *   resultado != EM_ANDAMENTO  um card ganho ou perdido não tem prazo a
   *                              cumprir — o processo acabou;
   *   deletedAt != null          o card saiu do quadro;
   *   etapa sem SLA              não há prazo contra o que medir;
   *   sem responsável            não há a quem avisar, e mandar para "todo
   *                              mundo" transformaria o alerta em ruído para
   *                              quem não pode agir.
   *
   * O card sem dono continua visível no quadro com o indicador — é lá que essa
   * ausência aparece.
   *
   * IDEMPOTENTE pela `chave`: `sla:<card>:<etapa>:<marco>:<destinatário>`. Um
   * card vencido continua vencido todos os dias, e sem a chave o responsável
   * receberia o mesmo aviso toda manhã até mover o card — um aviso que chega
   * todo dia deixa de ser lido. Então sai UMA VEZ por etapa e por marco, e a
   * etapa entra na chave porque o SLA reinicia a cada etapa (um card que vence
   * em Proposta e vence de novo em Negociação recebe os dois avisos).
   */
  const cardsAbertos = await prisma.deal.findMany({
    where: {
      resultado: 'EM_ANDAMENTO',
      deletedAt: null,
      etapaId: { not: null },
      etapa: { slaDias: { not: null }, ativo: true },
    },
    select: {
      id: true, title: true, etapaEntradaEm: true, createdAt: true,
      owner: { select: { id: true, name: true } },
      lead: { select: { company: true, name: true } },
      cliente: { select: { nome: true } },
      etapa: { select: { id: true, nome: true, slaDias: true } },
      funil: { select: { nome: true } },
    },
  })

  const alertas = alertasDeSla(
    cardsAbertos.map((c) => ({
      id: c.id,
      titulo: c.title,
      // QUEM o alerta identifica, na ordem em que a pessoa reconhece: o
      // cliente da carteira, a empresa do lead, o nome do lead, e o título do
      // card como último recurso. "SLA vencido" sem dizer de quem obriga a
      // abrir o card para saber de qual card se trata.
      empresa: c.cliente?.nome ?? c.lead?.company ?? c.lead?.name ?? c.title,
      funil: c.funil?.nome ?? 'sem funil',
      etapa: c.etapa?.nome ?? 'sem etapa',
      // O ID, e não o nome, vai para a chave de idempotência: renomear
      // "Proposta" não deve reabrir avisos já enviados.
      etapaId: c.etapa?.id ?? '',
      responsavelId: c.owner.id,
      responsavelNome: c.owner.name,
      // Sem marco zero, cai no `createdAt` — é a única informação verdadeira
      // sobre um card anterior ao registro de movimentações.
      entradaEm: c.etapaEntradaEm ?? c.createdAt,
      slaDias: c.etapa?.slaDias ?? null,
    })),
    hoje,
  )

  resultado.slaPipeline = await notificar(alertas.map((a) => ({
    destinatarioId: a.destinatarioId,
    titulo: a.titulo,
    mensagem: a.mensagem,
    origem: 'PIPELINE' as const,
    entidade: 'Deal',
    entidadeId: a.cardId,
    href: '/dashboard/pipeline',
    chave: a.chave,
  })))

  return NextResponse.json({
    executadoEm: hoje.toISOString(),
    criadas: resultado,
    total: Object.values(resultado).reduce((a, b) => a + b, 0),
    // Departamento vazio não é erro, mas precisa aparecer: sem ninguém no
    // Financeiro, os lembretes financeiros não têm destinatário.
    destinatarios: { financeiro: financeiro.length, compliance: compliance.length },
  })
}
