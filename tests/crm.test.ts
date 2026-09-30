/** Analitica derivada de PipelineMovimentacao. Nenhuma base paralela. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  tempoMedioPorEtapa, conversaoPorEtapa, conversaoPorResponsavel,
  conversaoEntreFunis, cicloMedioDias, gargalos, evolucaoMensal,
  distribuicaoPorResultado,
  type MovimentoBruto, type CardBruto, type ResultadoCard,
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

/**
 * O card NAO tem valor, e ganho/perda vem do RESULTADO — nao da etapa. Um card
 * perdido continua morando na etapa em que o processo parou.
 */
const card = (
  id: string, ownerId: string, etapaId: string | null,
  resultado: ResultadoCard = 'EM_ANDAMENTO',
  fechadoEm: Date | null = null,
  criadoEm: Date = D(1),
): CardBruto => ({
  id, ownerId, ownerNome: ownerId.toUpperCase(), funilId: 'f1', etapaId,
  resultado, criadoEm, fechadoEm,
})

test('ganho e perda vem do resultado, nao da etapa em que o card esta', () => {
  // Os tres cards estao na MESMA etapa (Negociacao). O desfecho e outro eixo.
  const r = conversaoPorResponsavel([
    card('c1', 'ana', 'negociacao', 'GANHO', D(9)),
    card('c2', 'ana', 'negociacao', 'PERDIDO', D(9)),
    card('c3', 'ana', 'negociacao', 'EM_ANDAMENTO'),
  ])
  const ana = r.find((x) => x.ownerId === 'ana')!
  assert.equal(ana.total, 3)
  assert.equal(ana.ganhos, 1)
  assert.equal(ana.perdas, 1)
  assert.equal(ana.abertos, 1)
  assert.equal(ana.taxa, 50, 'o card em aberto nao pune quem tem pipeline cheio')
})

test('responsavel sem card decidido tem taxa nula', () => {
  const r = conversaoPorResponsavel([card('c1', 'bia', 'e1')])
  assert.equal(r[0].taxa, null)
})

test('distribuicao por resultado devolve os tres estados, sempre na mesma ordem', () => {
  const d = distribuicaoPorResultado([
    card('c1', 'ana', 'e1', 'GANHO', D(5)),
    card('c2', 'ana', 'e1', 'GANHO', D(5)),
    card('c3', 'ana', 'e1'),
  ])
  assert.deepEqual(d.map((x) => x.resultado), ['EM_ANDAMENTO', 'GANHO', 'PERDIDO'])
  assert.deepEqual(d.map((x) => x.total), [1, 2, 0])
})

/* ── Evolucao mensal ─────────────────────────────────────────────────────── */

test('criacao conta pelo mes de criacao; desfecho, pelo mes do desfecho', () => {
  const e = evolucaoMensal(
    [
      // Criado em janeiro, ganho em marco: cada evento no seu mes.
      card('c1', 'ana', 'e1', 'GANHO', new Date('2026-03-04T00:00:00Z'), new Date('2026-01-10T00:00:00Z')),
      card('c2', 'ana', 'e1', 'PERDIDO', new Date('2026-03-20T00:00:00Z'), new Date('2026-02-02T00:00:00Z')),
      card('c3', 'ana', 'e1', 'EM_ANDAMENTO', null, new Date('2026-03-01T00:00:00Z')),
    ],
    ['2026-01', '2026-02', '2026-03'],
  )
  assert.deepEqual(e.map((x) => x.criados), [1, 1, 1])
  assert.deepEqual(e.map((x) => x.ganhos), [0, 0, 1])
  assert.deepEqual(e.map((x) => x.perdidos), [0, 0, 1])
})

test('evolucao devolve um ponto por periodo pedido, mesmo sem card nenhum', () => {
  const e = evolucaoMensal([], ['2026-01', '2026-02'])
  assert.equal(e.length, 2)
  assert.deepEqual(e.map((x) => x.criados), [0, 0])
})

test('card decidido sem data de desfecho nao entra em nenhum mes', () => {
  const e = evolucaoMensal(
    [card('c1', 'ana', 'e1', 'GANHO', null, new Date('2026-01-10T00:00:00Z'))],
    ['2026-01'],
  )
  assert.equal(e[0].criados, 1)
  assert.equal(e[0].ganhos, 0, 'sem data do desfecho nao da para dizer em que mes ele aconteceu')
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

test('ciclo medio olha so os cards ja decididos', () => {
  assert.equal(cicloMedioDias([card('c1', 'ana', 'e1', 'GANHO', D(11))]), 10)
  assert.equal(cicloMedioDias([card('c1', 'ana', 'e1')]), null, 'sem card decidido, sem ciclo')
  assert.equal(
    cicloMedioDias([card('c1', 'ana', 'e1', 'EM_ANDAMENTO', D(11))]), null,
    'data de fechamento sem desfecho nao conta — o card foi reaberto',
  )
})

test('mudanca de resultado nao conta como passagem de etapa', () => {
  // Sem este recorte, marcar "Ganho" zeraria o tempo de permanencia da etapa,
  // porque o evento entraria como uma nova entrada na mesma coluna.
  const t = tempoMedioPorEtapa([
    mov('d1', 'e1', 1),
    mov('d1', 'e1', 5, { tipo: 'MUDANCA_RESULTADO' }),
  ], AGORA)
  assert.equal(t.get('e1')?.amostras, 1)
  assert.equal(t.get('e1')?.dias, 20, 'de 1 ate 21 — o card nunca saiu de e1')
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
