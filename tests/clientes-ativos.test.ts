/**
 * CLIENTES ATIVOS — a convenção de leitura do Lançamento Diário.
 *
 * O número é uma FOTOGRAFIA do dia, na mesma convenção de `saldoEmConta`, e
 * não um fluxo que se acumula como TPV ou transações. A diferença é o que
 * estes testes fixam: somar os dias inflaria o indicador proporcionalmente à
 * quantidade de dias lançados, o que faria "clientes ativos" crescer só porque
 * a operação lançou mais dias.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientesAtivosDoMes } from '../lib/kpi'

const D = (iso: string) => new Date(iso + 'T00:00:00Z')
const dia = (iso: string, clientesAtivos: number | null) => ({ data: D(iso), clientesAtivos })

test('vale o último dia do mês que informou o número', () => {
  assert.equal(
    clientesAtivosDoMes([
      dia('2026-09-01', 40),
      dia('2026-09-15', 44),
      dia('2026-09-30', 47),
    ]),
    47,
  )
})

test('não soma os dias — é estoque, não fluxo', () => {
  const dias = [dia('2026-09-01', 40), dia('2026-09-02', 40), dia('2026-09-03', 40)]
  assert.equal(clientesAtivosDoMes(dias), 40)
  assert.notEqual(clientesAtivosDoMes(dias), 120)
})

test('dias sem informação são pulados, não zeram o mês', () => {
  assert.equal(
    clientesAtivosDoMes([
      dia('2026-09-01', 40),
      dia('2026-09-20', 45),
      dia('2026-09-30', null),
    ]),
    45,
  )
})

test('ausência total é null, nunca zero', () => {
  assert.equal(clientesAtivosDoMes([]), null)
  assert.equal(clientesAtivosDoMes([dia('2026-09-01', null), dia('2026-09-02', null)]), null)
})

test('zero informado é zero de verdade, e não se confunde com ausência', () => {
  assert.equal(clientesAtivosDoMes([dia('2026-09-10', 12), dia('2026-09-20', 0)]), 0)
})

test('a ordem em que os dias chegam não altera o resultado', () => {
  const desordenados = [
    dia('2026-09-30', 47),
    dia('2026-09-01', 40),
    dia('2026-09-15', 44),
  ]
  assert.equal(clientesAtivosDoMes(desordenados), 47)
})

test('um único dia informado responde por todo o mês', () => {
  assert.equal(clientesAtivosDoMes([dia('2026-09-08', 33)]), 33)
})

test('queda no fim do mês é refletida, não suavizada', () => {
  // Se o mês fecha com menos clientes, é isso que o indicador reporta.
  assert.equal(
    clientesAtivosDoMes([dia('2026-09-01', 50), dia('2026-09-28', 41)]),
    41,
  )
})
