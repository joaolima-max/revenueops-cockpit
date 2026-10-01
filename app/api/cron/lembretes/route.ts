import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notificar, destinatariosPorDepartamento } from '@/lib/notificacoes'
import { ehTerminal, type Status } from '@/lib/compliance'
import { situacaoDoTitulo, situacaoDoRecebivel } from '@/lib/financeiro'
import {
  lembretesDeTarefas, lembretesDeFollowUp, lembretesDeCompliance,
  lembretesDeTitulos, lembreteDeLancamentoAusente, diaUtc, diaIso,
} from '@/lib/lembretes'

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

  return NextResponse.json({
    executadoEm: hoje.toISOString(),
    criadas: resultado,
    total: Object.values(resultado).reduce((a, b) => a + b, 0),
    // Departamento vazio não é erro, mas precisa aparecer: sem ninguém no
    // Financeiro, os lembretes financeiros não têm destinatário.
    destinatarios: { financeiro: financeiro.length, compliance: compliance.length },
  })
}
