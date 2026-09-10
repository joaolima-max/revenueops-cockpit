/** Analitica derivada de PipelineMovimentacao. Nenhuma base paralela. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  tempoMedioPorEtapa, conversaoPorEtapa, conversaoPorResponsavel,
  conversaoEntreFunis, cicloMedioDias, gargalos,
  type MovimentoBruto, type CardBruto,
} from '../lib/crm'

const D = (dia: number) => new Date(`2026-09-${String(dia).padStart(2, '0')}T00:00:00Z`)
const AGORA = D(21)

const mov = (
  dealId: string, etapaDestinoId: string, dia: number,
  extra: Partial<MovimentoBruto> = {},
): MovimentoBruto => ({
  dealId, tipo: 'MOVIMENTO_ETAPA',
  funilOrigemId: 'f1', etapaOrigemId: null,
  funilDestinoId: 'f1', etapaDestinoId, createdAt: D(dia), ...extra,
})

test('tempo em etapa e o intervalo ate a proxima movimentacao do mesmo card', () => {
  const t = tempoMedioPorEtapa([mov('d1', 'e1', 1), mov('d1', 'e2', 5), mov('d1', 'e3', 11)], AGORA)
  assert.equal(t.get('e1')?.dias, 4)
  assert.equal(t.get('e2')?.dias, 6)
})

test('a etapa atual conta ate agora — senao onde tudo empaca pareceria a mais rapida', () => {
  const t = tempoMedioPorEtapa([mov('d1', 'e1', 1), mov('d1', 'e2', 11)], AGORA)
  assert.equal(t.get('e2')?.dias, 10, 'de 11 ate 21')
})

test('cards diferentes nao se misturam no calculo de tempo', () => {
  const t = tempoMedioPorEtapa([
    mov('d1', 'e1', 1), mov('d1', 'e2', 3),
    mov('d2', 'e1', 10), mov('d2', 'e2', 16),
  ], AGORA)
  assert.equal(t.get('e1')?.amostras, 2)
  assert.equal(t.get('e1')?.dias, 4, 'media de 2 e 6 dias')
})

test('conversao por etapa mede quem avancou para uma etapa posterior', () => {
  const ordem = ['e1', 'e2', 'e3']
  const c = conversaoPorEtapa([
    mov('d1', 'e1', 1), mov('d1', 'e2', 2), mov('d1', 'e3', 3),
    mov('d2', 'e1', 1), mov('d2', 'e2', 2),
    mov('d3', 'e1', 1),
    mov('d4', 'e1', 1),
  ], ordem)

  assert.equal(c.get('e1')?.entraram, 4)
  assert.equal(c.get('e1')?.avancaram, 2)
  assert.equal(c.get('e1')?.taxa, 50)
  assert.equal(c.get('e2')?.entraram, 2)
  assert.equal(c.get('e2')?.avancaram, 1)
  assert.equal(c.get('e3')?.taxa, 0, 'ultima etapa nao tem para onde avancar')
})

test('etapa sem entrada tem taxa nula, nunca zero', () => {
  const c = conversaoPorEtapa([], ['e1'])
  assert.equal(c.get('e1')?.entraram, 0)
  assert.equal(c.get('e1')?.taxa, null)
})

const card = (
  id: string, ownerId: string, etapaId: string | null, valor = 100,
  fechadoEm: Date | null = null,
): CardBruto => ({
  id, ownerId, ownerNome: ownerId.toUpperCase(), funilId: 'f1', etapaId,
  valor, criadoEm: D(1), fechadoEm,
})

test('taxa por responsavel considera so os cards decididos', () => {
  const r = conversaoPorResponsavel(
    [card('c1', 'ana', 'ganho'), card('c2', 'ana', 'perda'), card('c3', 'ana', 'e1', 500)],
    new Set(['ganho']), new Set(['perda']),
  )
  const ana = r.find((x) => x.ownerId === 'ana')!
  assert.equal(ana.total, 3)
  assert.equal(ana.ganhos, 1)
  assert.equal(ana.perdas, 1)
  assert.equal(ana.abertos, 1)
  assert.equal(ana.valorAberto, 500)
  assert.equal(ana.taxa, 50, 'o card em aberto nao pune quem tem pipeline cheio')
})

test('responsavel sem card decidido tem taxa nula', () => {
  const r = conversaoPorResponsavel([card('c1', 'bia', 'e1')], new Set(['ganho']), new Set(['perda']))
  assert.equal(r[0].taxa, null)
})

test('conversao entre funis agrega so as transferencias', () => {
  const t = conversaoEntreFunis([
    mov('d1', 'k', 5, { tipo: 'TRANSFERENCIA_FUNIL', funilOrigemId: 'f1', funilDestinoId: 'f2' }),
    mov('d2', 'k', 6, { tipo: 'TRANSFERENCIA_FUNIL', funilOrigemId: 'f1', funilDestinoId: 'f2' }),
    mov('d3', 'k', 7, { tipo: 'TRANSFERENCIA_FUNIL', funilOrigemId: 'f2', funilDestinoId: 'f3' }),
    mov('d4', 'e2', 8),
  ])
  assert.equal(t.length, 2)
  assert.deepEqual(t[0], { origemId: 'f1', destinoId: 'f2', total: 2 })
})

test('ciclo medio olha so os cards ja fechados', () => {
  assert.equal(cicloMedioDias([card('c1', 'ana', 'ganho', 100, D(11))]), 10)
  assert.equal(cicloMedioDias([card('c1', 'ana', 'e1')]), null, 'sem card fechado, sem ciclo')
})

test('gargalo e a etapa acima do dobro da mediana e com card parado', () => {
  const tempos = new Map([
    ['e1', { dias: 2, amostras: 5 }],
    ['e2', { dias: 3, amostras: 5 }],
    ['e3', { dias: 30, amostras: 5 }],
    ['e4', { dias: 4, amostras: 5 }],
  ])
  const volume = new Map([['e1', 3], ['e2', 2], ['e3', 7], ['e4', 1]])

  const g = gargalos(tempos, volume)
  assert.equal(g.length, 1)
  assert.equal(g[0].etapaId, 'e3')
  assert.equal(g[0].cards, 7)

  assert.deepEqual(gargalos(tempos, new Map([['e3', 0]])), [], 'etapa lenta e vazia nao e gargalo')
  assert.deepEqual(gargalos(new Map([['e1', { dias: 1, amostras: 1 }]]), volume), [],
    'poucas etapas nao permitem falar em mediana')
})
