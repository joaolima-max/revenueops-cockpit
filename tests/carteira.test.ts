/** Indicador operacional diario. Sem TPV, sem valor — so o booleano. */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ultimosDias, estadoDoDia, serieDoCliente, SIMBOLO_DIA } from '../lib/carteira'

const HOJE = new Date('2026-09-09T15:00:00Z')

test('ultimosDias devolve N dias em UTC, do mais antigo ao mais novo', () => {
  assert.deepEqual(ultimosDias(5, HOJE), ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'])
  assert.equal(ultimosDias(1, HOJE)[0], '2026-09-09')
})

test('ultimosDias atravessa a virada de mes', () => {
  assert.deepEqual(
    ultimosDias(3, new Date('2026-03-02T00:00:00Z')),
    ['2026-02-28', '2026-03-01', '2026-03-02'],
  )
})

test('ausencia de registro NAO e um "nao"', () => {
  assert.equal(estadoDoDia(undefined), 'SEM_REGISTRO')
  assert.equal(estadoDoDia({ movimentou: false }), 'NAO')
  assert.equal(estadoDoDia({ movimentou: true }), 'SIM')
  assert.notEqual(SIMBOLO_DIA.SEM_REGISTRO, SIMBOLO_DIA.NAO)
})

test('serie do cliente ignora registros de outros clientes', () => {
  const dias = ultimosDias(3, HOJE)
  const registros = [
    { clienteId: 'c1', data: '2026-09-07', movimentou: true },
    { clienteId: 'c1', data: '2026-09-09', movimentou: false },
    { clienteId: 'c2', data: '2026-09-08', movimentou: true },
  ]
  assert.deepEqual(serieDoCliente('c1', registros, dias), [
    { data: '2026-09-07', estado: 'SIM' },
    { data: '2026-09-08', estado: 'SEM_REGISTRO' },
    { data: '2026-09-09', estado: 'NAO' },
  ])
})
