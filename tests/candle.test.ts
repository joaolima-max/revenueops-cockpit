/**
 * VELAS — agregação OHLC.
 *
 * O que estes testes protegem: a vela é AGREGAÇÃO, não simulação. Todo número
 * devolvido tem de ser um valor efetivamente observado em algum dia da janela.
 * Nada de interpolar, nada de inventar máxima.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  velas, velaDegenerada, variacaoDaVela,
  type Observacao,
} from '../lib/candle'

const O = (iso: string, valor: number | null): Observacao => ({
  data: new Date(`${iso}T12:00:00Z`), valor,
})

test('o OHLC sai da ORDEM DAS DATAS, nao da ordem do array', () => {
  // Abertura e o primeiro DIA, fechamento o ultimo — mesmo que o array venha
  // desordenado, como vem de qualquer consulta sem orderBy garantido.
  const [v] = velas([
    O('2026-10-20', 300),
    O('2026-10-01', 100),
    O('2026-10-10', 500),
    O('2026-10-31', 200),
  ])
  assert.equal(v.open, 100, 'abertura e o primeiro dia')
  assert.equal(v.close, 200, 'fechamento e o ultimo dia')
  assert.equal(v.high, 500)
  assert.equal(v.low, 100)
})

test('todo valor do OHLC foi OBSERVADO — nada e interpolado', () => {
  const obs = [O('2026-10-01', 7), O('2026-10-02', 19), O('2026-10-03', 3)]
  const [v] = velas(obs)
  const observados = new Set(obs.map((o) => o.valor))
  for (const n of [v.open, v.high, v.low, v.close]) {
    assert.ok(observados.has(n), `${n} nao foi observado em nenhum dia`)
  }
})

test('dia sem lancamento e DESCARTADO, nunca lido como zero', () => {
  // Zero puxaria a minima e inventaria uma queda que nao houve.
  const [v] = velas([O('2026-10-01', 100), O('2026-10-02', null), O('2026-10-03', 120)])
  assert.equal(v.low, 100)
  assert.equal(v.observacoes, 2)
})

test('janela sem nenhuma observacao nao produz vela', () => {
  assert.deepEqual(velas([]), [])
  assert.deepEqual(velas([O('2026-10-01', null)]), [])
})

test('as velas saem em ordem cronologica', () => {
  const vs = velas([
    O('2026-12-01', 1), O('2026-10-01', 2), O('2026-11-01', 3),
  ])
  assert.deepEqual(vs.map((v) => v.janela), ['2026-10', '2026-11', '2026-12'])
})

test('alta e close >= open; baixa e o contrario', () => {
  const [sobe] = velas([O('2026-10-01', 10), O('2026-10-02', 20)])
  const [cai] = velas([O('2026-11-01', 20), O('2026-11-02', 10)])
  const [igual] = velas([O('2026-12-01', 10), O('2026-12-02', 10)])
  assert.equal(sobe.alta, true)
  assert.equal(cai.alta, false)
  assert.equal(igual.alta, true, 'sem movimento conta como alta, nao como queda')
})

test('granularidade SEMANA agrupa por semana ISO', () => {
  const vs = velas(
    [O('2026-10-05', 1), O('2026-10-07', 2), O('2026-10-14', 3)],
    'SEMANA',
  )
  assert.equal(vs.length, 2)
  assert.equal(vs[0].observacoes, 2)
  assert.ok(vs[0].janela.includes('-W'))
})

test('a semana ISO nao racha a virada do ano em dois anos diferentes', () => {
  // 29/12/2025 e 01/01/2026 caem na MESMA semana ISO. Sem a correcao da
  // quinta-feira, elas iriam para janelas de anos diferentes.
  const vs = velas([O('2025-12-29', 1), O('2026-01-01', 2)], 'SEMANA')
  assert.equal(vs.length, 1, `rachou em ${vs.map((v) => v.janela).join(', ')}`)
})

test('de e ate declaram o periodo REAL observado, nao o mes inteiro', () => {
  const [v] = velas([O('2026-10-07', 1), O('2026-10-22', 2)])
  assert.equal(v.de.getUTCDate(), 7)
  assert.equal(v.ate.getUTCDate(), 22)
})

test('vela degenerada: uma observacao so, ou sem dispersao', () => {
  // A tela precisa saber: uma janela com um dia so nao tem maxima nem minima,
  // e desenha-la como vela sugere dispersao que nao foi medida.
  const [uma] = velas([O('2026-10-01', 10)])
  assert.equal(velaDegenerada(uma), true)

  const [plana] = velas([O('2026-11-01', 10), O('2026-11-02', 10)])
  assert.equal(velaDegenerada(plana), true)

  const [normal] = velas([O('2026-12-01', 10), O('2026-12-02', 20)])
  assert.equal(velaDegenerada(normal), false)
})

test('variacao da vela e null quando a abertura e zero', () => {
  const [v] = velas([O('2026-10-01', 0), O('2026-10-02', 50)])
  assert.equal(variacaoDaVela(v), null)
})

test('variacao da vela usa o modulo da abertura', () => {
  const [v] = velas([O('2026-10-01', 100), O('2026-10-02', 150)])
  assert.equal(variacaoDaVela(v), 50)
})

test('duas observacoes no MESMO dia, horas diferentes, formam uma vela', () => {
  // O grao e o dia, nao o instante. Nada aqui precisa olhar a hora.
  const vs = velas([
    { data: new Date('2026-10-01T01:00:00Z'), valor: 10 },
    { data: new Date('2026-10-01T23:59:00Z'), valor: 20 },
  ])
  assert.equal(vs.length, 1)
  assert.equal(vs[0].observacoes, 2)
  assert.equal(vs[0].open, 10)
  assert.equal(vs[0].close, 20)
})

test('valor nao finito e descartado como ausencia', () => {
  const vs = velas([O('2026-10-01', NaN), O('2026-10-02', 10)])
  assert.equal(vs[0].observacoes, 1)
  assert.equal(vs[0].open, 10)
})
