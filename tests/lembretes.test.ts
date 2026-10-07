/**
 * LEMBRETES — quais avisos vencem hoje, e para quem.
 *
 * O que estes testes protegem:
 *
 *   1. O MARCO É O DIA, não o instante: uma tarefa que vence às 23h e outra às
 *      01h do mesmo dia estão ambas a 3 dias.
 *   2. IDEMPOTÊNCIA: a chave identifica o EVENTO, então reprocessar o dia não
 *      produz uma chave nova — é o UNIQUE do banco que recusa a duplicata.
 *   3. Atraso avisa UMA VEZ. Um aviso que chega todo dia deixa de ser lido.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  diasAte, marcoDe, rotuloMarco, chaveLembrete,
  MARCOS_TAREFA, MARCOS_COMPLIANCE, MARCOS_TITULO, MARCOS_FOLLOWUP,
  lembretesDeTarefas, lembretesDeFollowUp, lembretesDeCompliance,
  lembretesDeTitulos, lembreteDeLancamentoAusente, diaIso,
} from '../lib/lembretes'

const HOJE = new Date('2026-10-15T09:00:00Z')
const D = (iso: string) => new Date(`${iso}T00:00:00Z`)

/* ========================================================================= *
 * MARCOS — o dia, não o instante
 * ========================================================================= */

test('diasAte compara DIAS, ignorando a hora', () => {
  // Uma tarefa que vence as 23h e outra as 01h do mesmo dia estao ambas a 3
  // dias. Comparar timestamps faria uma delas pular o marco.
  const tarde = new Date('2026-10-18T23:30:00Z')
  const cedo = new Date('2026-10-18T00:30:00Z')
  assert.equal(diasAte(tarde, HOJE), 3)
  assert.equal(diasAte(cedo, HOJE), 3)
})

test('diasAte: positivo falta, zero hoje, negativo passou', () => {
  assert.equal(diasAte(D('2026-10-22'), HOJE), 7)
  assert.equal(diasAte(D('2026-10-15'), HOJE), 0)
  assert.equal(diasAte(D('2026-10-14'), HOJE), -1)
})

test('os marcos de cada tipo sao os da especificacao', () => {
  assert.deepEqual([...MARCOS_TAREFA], [7, 3, 1, 0, -1])
  assert.deepEqual([...MARCOS_COMPLIANCE], [3, 0, -1])
  assert.deepEqual([...MARCOS_TITULO], [3, 0, -1])
  assert.deepEqual([...MARCOS_FOLLOWUP], [0], 'Follow Up avisa so no dia')
})

test('dia que nao e marco nao gera aviso', () => {
  assert.equal(marcoDe(5, MARCOS_TAREFA), null)
  assert.equal(marcoDe(2, MARCOS_TAREFA), null)
  assert.equal(marcoDe(3, MARCOS_TAREFA), 3)
})

test('o atraso vence UMA VEZ, no primeiro dia — nao todo dia', () => {
  // Um aviso que chega todo dia deixa de ser lido. O atraso continua visivel
  // no proprio ambiente.
  assert.equal(marcoDe(-1, MARCOS_TAREFA), -1)
  assert.equal(marcoDe(-2, MARCOS_TAREFA), null)
  assert.equal(marcoDe(-30, MARCOS_TAREFA), null)
})

test('rotuloMarco fala do ponto de vista de quem le', () => {
  assert.equal(rotuloMarco(7), 'vence em 7 dias')
  assert.equal(rotuloMarco(1), 'vence amanhã')
  assert.equal(rotuloMarco(0), 'vence hoje')
  assert.equal(rotuloMarco(-1), 'está vencido')
})

/* ========================================================================= *
 * IDEMPOTÊNCIA
 * ========================================================================= */

test('a chave identifica o EVENTO — reprocessar o dia repete a MESMA chave', () => {
  const a = chaveLembrete('tarefa', 't1', 3, 'u1')
  const b = chaveLembrete('tarefa', 't1', 3, 'u1')
  assert.equal(a, b, 'chave diferente derrotaria o UNIQUE do banco')
})

test('cada marco tem a sua chave, e cada destinatario a sua', () => {
  const marcos = new Set(MARCOS_TAREFA.map((m) => chaveLembrete('tarefa', 't1', m, 'u1')))
  assert.equal(marcos.size, MARCOS_TAREFA.length, 'dois marcos colidiram na mesma chave')

  assert.notEqual(
    chaveLembrete('tarefa', 't1', 3, 'u1'),
    chaveLembrete('tarefa', 't1', 3, 'u2'),
    'marcar como lida e individual: a chave tem de separar destinatarios',
  )
})

test('a chave distingue o sinal do marco — D-1 nao colide com D+1', () => {
  assert.notEqual(
    chaveLembrete('tarefa', 't1', 1, 'u1'),
    chaveLembrete('tarefa', 't1', -1, 'u1'),
  )
})

/* ========================================================================= *
 * TAREFAS
 * ========================================================================= */

const tarefa = (p: Partial<Parameters<typeof lembretesDeTarefas>[0][0]> = {}) => ({
  id: 't1', titulo: 'Revisar contrato', dueDate: D('2026-10-18'),
  status: 'PENDENTE', responsavelId: 'u1', ...p,
})

test('tarefa a 3 dias gera um aviso para o responsavel', () => {
  const r = lembretesDeTarefas([tarefa()], HOJE)
  assert.equal(r.length, 1)
  assert.equal(r[0].destinatarioId, 'u1')
  assert.equal(r[0].origem, 'TAREFA')
  assert.equal(r[0].entidade, 'Tarefa')
  assert.equal(r[0].href, '/dashboard/tarefas')
  assert.ok(r[0].chave)
})

test('tarefa CONCLUIDA ou CANCELADA nao cobra ninguem', () => {
  assert.equal(lembretesDeTarefas([tarefa({ status: 'CONCLUIDA' })], HOJE).length, 0)
  assert.equal(lembretesDeTarefas([tarefa({ status: 'CANCELADA' })], HOJE).length, 0)
})

test('tarefa SEM prazo ou SEM responsavel nao gera lembrete', () => {
  assert.equal(lembretesDeTarefas([tarefa({ dueDate: null })], HOJE).length, 0)
  assert.equal(lembretesDeTarefas([tarefa({ responsavelId: null })], HOJE).length, 0)
})

test('tarefa em dia que nao e marco fica quieta', () => {
  assert.equal(lembretesDeTarefas([tarefa({ dueDate: D('2026-10-20') })], HOJE).length, 0)
})

test('tarefa vencida ha um dia avisa; ha dois, nao', () => {
  assert.equal(lembretesDeTarefas([tarefa({ dueDate: D('2026-10-14') })], HOJE).length, 1)
  assert.equal(lembretesDeTarefas([tarefa({ dueDate: D('2026-10-13') })], HOJE).length, 0)
})

/* ========================================================================= *
 * FOLLOW UP
 * ========================================================================= */

test('Follow Up avisa NO DIA, e so no dia', () => {
  const base = {
    id: 'f1', titulo: 'Ligar', responsavelId: 'u1', clienteNome: 'ACME',
  }
  assert.equal(
    lembretesDeFollowUp([{ ...base, proximoContato: D('2026-10-15') }], HOJE).length, 1,
  )
  assert.equal(
    lembretesDeFollowUp([{ ...base, proximoContato: D('2026-10-16') }], HOJE).length, 0,
  )
  assert.equal(
    lembretesDeFollowUp([{ ...base, proximoContato: D('2026-10-14') }], HOJE).length, 0,
  )
})

test('Follow Up sem responsavel ou sem data prevista nao avisa', () => {
  assert.equal(lembretesDeFollowUp([{
    id: 'f1', titulo: 'Ligar', responsavelId: null,
    proximoContato: D('2026-10-15'), clienteNome: 'ACME',
  }], HOJE).length, 0)

  assert.equal(lembretesDeFollowUp([{
    id: 'f1', titulo: 'Ligar', responsavelId: 'u1',
    proximoContato: null, clienteNome: 'ACME',
  }], HOJE).length, 0)
})

/* ========================================================================= *
 * COMPLIANCE
 * ========================================================================= */

const encerrado = (s: string) => s === 'RESOLVIDA' || s === 'CANCELADA'

test('compliance avisa a 3 dias, no dia e no primeiro dia de atraso', () => {
  const base = { id: 'p1', clienteNome: 'ACME', status: 'ABERTA', responsavelId: 'u1' }
  for (const [data, esperado] of [
    ['2026-10-18', 1], ['2026-10-15', 1], ['2026-10-14', 1],
    ['2026-10-17', 0], ['2026-10-13', 0], ['2026-10-22', 0],
  ] as const) {
    assert.equal(
      lembretesDeCompliance([{ ...base, prazo: D(data) }], HOJE, encerrado).length,
      esperado, `prazo ${data}`,
    )
  }
})

test('pendencia encerrada nao gera lembrete', () => {
  const base = { id: 'p1', clienteNome: 'ACME', prazo: D('2026-10-15'), responsavelId: 'u1' }
  assert.equal(lembretesDeCompliance([{ ...base, status: 'RESOLVIDA' }], HOJE, encerrado).length, 0)
  assert.equal(lembretesDeCompliance([{ ...base, status: 'CANCELADA' }], HOJE, encerrado).length, 0)
})

/* ========================================================================= *
 * TÍTULOS — o DEPARTAMENTO é o destinatário
 * ========================================================================= */

const titulo = { id: 'c1', descricao: 'Aluguel', vencimento: D('2026-10-18'), encerrado: false }

test('o aviso de titulo vai para CADA pessoa do Financeiro', () => {
  // Titulo nao tem dono individual: mandar para uma pessoa escolhida faria o
  // aviso sumir quando ela estivesse de ferias.
  const r = lembretesDeTitulos([titulo], ['u1', 'u2', 'u3'], HOJE, 'PAGAR')
  assert.equal(r.length, 3)
  assert.deepEqual(r.map((n) => n.destinatarioId).sort(), ['u1', 'u2', 'u3'])
  // Cada pessoa tem a SUA chave: marcar como lida e individual.
  assert.equal(new Set(r.map((n) => n.chave)).size, 3)
})

test('Financeiro vazio nao gera aviso nenhum — e nao estoura', () => {
  assert.deepEqual(lembretesDeTitulos([titulo], [], HOJE, 'PAGAR'), [])
})

test('titulo encerrado nao e cobrado', () => {
  const pago = { ...titulo, encerrado: true }
  assert.equal(lembretesDeTitulos([pago], ['u1'], HOJE, 'PAGAR').length, 0)
})

test('pagar e receber tem origem, rota e entidade proprias', () => {
  const [p] = lembretesDeTitulos([titulo], ['u1'], HOJE, 'PAGAR')
  const [r] = lembretesDeTitulos([titulo], ['u1'], HOJE, 'RECEBER')
  assert.equal(p.origem, 'CONTA_PAGAR')
  assert.equal(r.origem, 'CONTA_RECEBER')
  assert.equal(p.href, '/dashboard/financeiro/cp-cr')
  assert.equal(r.href, '/dashboard/financeiro/cp-cr/receber')
  assert.notEqual(p.chave, r.chave, 'mesmo id em tabelas diferentes nao pode colidir')
})

/* ========================================================================= *
 * LANÇAMENTO DIÁRIO — ausência
 * ========================================================================= */

test('cobra ANTEONTEM, nao ontem: o lancamento do dia e feito no dia seguinte', () => {
  // Cobrar em D+1 reclamaria do prazo normal.
  const r = lembreteDeLancamentoAusente(new Set(), ['u1'], HOJE)
  assert.equal(r.length, 1)
  assert.equal(r[0].entidadeId, '2026-10-13')
})

test('dia com lancamento nao gera cobranca', () => {
  const r = lembreteDeLancamentoAusente(new Set(['2026-10-13']), ['u1'], HOJE)
  assert.equal(r.length, 0)
})

test('UM aviso por dia ausente — a chave carrega a data, nao a execucao', () => {
  // Sem isto, um dia sem lancamento geraria aviso em todas as execucoes, para
  // sempre.
  const a = lembreteDeLancamentoAusente(new Set(), ['u1'], HOJE)
  const b = lembreteDeLancamentoAusente(new Set(), ['u1'], new Date('2026-10-15T23:00:00Z'))
  assert.equal(a[0].chave, b[0].chave)
})

test('cada pessoa do Financeiro recebe o aviso de ausencia', () => {
  const r = lembreteDeLancamentoAusente(new Set(), ['u1', 'u2'], HOJE)
  assert.equal(r.length, 2)
  assert.equal(new Set(r.map((n) => n.chave)).size, 2)
})

test('diaIso devolve a data em UTC, sem hora', () => {
  assert.equal(diaIso(new Date('2026-10-13T23:59:00Z')), '2026-10-13')
  assert.equal(diaIso(new Date('2026-10-13T00:01:00Z')), '2026-10-13')
})
