/** Maquina de estados da pendencia e prazo. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transicaoValida, ehTerminal, estaVencida, diasParaPrazo } from '../lib/compliance'

const AGORA = new Date('2026-09-09T12:00:00Z')

test('transicoes normais sao permitidas', () => {
  assert.ok(transicaoValida('ABERTA', 'EM_ANALISE'))
  assert.ok(transicaoValida('EM_ANALISE', 'AGUARDANDO_CLIENTE'))
  assert.ok(transicaoValida('AGUARDANDO_CLIENTE', 'RESOLVIDA'))
})

test('nao ha transicao para o mesmo status', () => {
  assert.ok(!transicaoValida('ABERTA', 'ABERTA'))
})

test('status terminal so volta reabrindo', () => {
  assert.ok(ehTerminal('RESOLVIDA'))
  assert.ok(ehTerminal('CANCELADA'))
  assert.ok(transicaoValida('RESOLVIDA', 'ABERTA'), 'reabrir e permitido')
  assert.ok(!transicaoValida('RESOLVIDA', 'EM_ANALISE'), 'resolvida nao volta direto para analise')
  assert.ok(!transicaoValida('CANCELADA', 'RESOLVIDA'))
})

test('pendencia vencida e a que passou do prazo sem encerrar', () => {
  assert.ok(estaVencida('2026-09-01', 'ABERTA', AGORA))
  assert.ok(!estaVencida('2026-09-30', 'ABERTA', AGORA))
  assert.ok(!estaVencida('2026-09-01', 'RESOLVIDA', AGORA), 'resolvida nao vence')
  assert.ok(!estaVencida(null, 'ABERTA', AGORA), 'sem prazo nao vence')
})

test('diasParaPrazo conta para frente e para tras', () => {
  assert.equal(diasParaPrazo('2026-09-19T12:00:00Z', AGORA), 10)
  assert.equal(diasParaPrazo('2026-08-30T12:00:00Z', AGORA), -10)
  assert.equal(diasParaPrazo(null, AGORA), null)
})
