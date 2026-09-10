/**
 * Regras de vigencia e consolidacao da volumetria minima por cliente.
 *
 * Sao testes de funcao pura, sem banco: a consulta ao Prisma fica isolada em
 * `minimoContratadoDoPeriodo`, e a decisao mora em `consolidarMinimo`.
 *
 *   npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  periodoValido, cobrePeriodo, statusContrato, vigenciasSobrepoem, consolidarMinimo,
  type LinhaMinimo,
} from '../lib/volumetria'

const REF = '2026-09'

const contrato = (
  clienteId: string | null, qtdMinima: number, periodo: string, vigenciaFim: string | null = null,
  ativo = true,
): LinhaMinimo => ({ clienteId, qtdMinima, periodo, vigenciaFim, ativo })

test('periodoValido rejeita mes fora de 01-12 e formatos errados', () => {
  assert.ok(periodoValido('2026-01'))
  assert.ok(periodoValido('2026-12'))
  assert.ok(!periodoValido('2026-00'))
  assert.ok(!periodoValido('2026-13'))
  assert.ok(!periodoValido('2026-1'))
  assert.ok(!periodoValido('setembro'))
  assert.ok(!periodoValido(null))
})

test('cobrePeriodo respeita inicio, fim inclusivo e inatividade', () => {
  const c = { periodo: '2026-03', vigenciaFim: '2026-09', ativo: true }
  assert.ok(!cobrePeriodo(c, '2026-02'))
  assert.ok(cobrePeriodo(c, '2026-03'))
  assert.ok(cobrePeriodo(c, '2026-09'), 'o mes de fim ainda conta')
  assert.ok(!cobrePeriodo(c, '2026-10'))
  assert.ok(!cobrePeriodo({ ...c, ativo: false }, '2026-05'), 'inativo nunca cobre')
  assert.ok(cobrePeriodo({ periodo: '2026-03', vigenciaFim: null, ativo: true }, '2099-01'))
})

test('statusContrato distingue os quatro estados', () => {
  assert.equal(statusContrato({ periodo: '2026-01', vigenciaFim: null, ativo: false }, REF), 'INATIVA')
  assert.equal(statusContrato({ periodo: '2026-12', vigenciaFim: null, ativo: true }, REF), 'PROGRAMADA')
  assert.equal(statusContrato({ periodo: '2026-01', vigenciaFim: '2026-08', ativo: true }, REF), 'ENCERRADA')
  assert.equal(statusContrato({ periodo: '2026-01', vigenciaFim: '2026-09', ativo: true }, REF), 'VIGENTE')
  assert.equal(statusContrato({ periodo: '2026-09', vigenciaFim: null, ativo: true }, REF), 'VIGENTE')
})

test('vigenciasSobrepoem detecta encaixe, borda e indeterminado', () => {
  const a = { periodo: '2026-01', vigenciaFim: '2026-06', ativo: true }
  assert.ok(vigenciasSobrepoem(a, { periodo: '2026-06', vigenciaFim: '2026-12', ativo: true }),
    'compartilhar o mes de borda ja e sobreposicao')
  assert.ok(!vigenciasSobrepoem(a, { periodo: '2026-07', vigenciaFim: '2026-12', ativo: true }),
    'contratos em sequencia limpa nao colidem')
  assert.ok(vigenciasSobrepoem(a, { periodo: '2026-03', vigenciaFim: null, ativo: true }))
  assert.ok(vigenciasSobrepoem(
    { periodo: '2026-01', vigenciaFim: null, ativo: true },
    { periodo: '2030-01', vigenciaFim: null, ativo: true },
  ), 'dois indeterminados sempre colidem')
})

test('consolidarMinimo soma os contratos de cliente vigentes', () => {
  const r = consolidarMinimo([
    contrato('c1', 100_000, '2026-01'),
    contrato('c2', 50_000, '2026-05', '2026-12'),
    contrato('c3', 999, '2026-11'),           // ainda nao comecou
    contrato('c4', 777, '2026-01', '2026-08'), // ja encerrou
  ], REF)
  assert.deepEqual(r, { qtdMinima: 150_000, clientes: 2, origem: 'CLIENTES' })
})

test('consolidarMinimo ignora contratos inativos', () => {
  const r = consolidarMinimo([
    contrato('c1', 100_000, '2026-01'),
    contrato('c2', 50_000, '2026-01', null, false),
  ], REF)
  assert.deepEqual(r, { qtdMinima: 100_000, clientes: 1, origem: 'CLIENTES' })
})

test('varios contratos do mesmo cliente contam uma vez na contagem de clientes', () => {
  const r = consolidarMinimo([
    contrato('c1', 10, '2026-01', '2026-09'),
    contrato('c1', 20, '2026-09', '2026-12'),
  ], REF)
  assert.equal(r?.clientes, 1)
  assert.equal(r?.qtdMinima, 30)
})

test('sem contrato de cliente, cai no geral legado do proprio mes', () => {
  assert.deepEqual(
    consolidarMinimo([contrato(null, 80_000, REF)], REF),
    { qtdMinima: 80_000, clientes: 0, origem: 'GERAL_LEGADO' },
  )
})

test('legado de outro mes nao vaza para o mes consultado', () => {
  assert.equal(consolidarMinimo([contrato(null, 80_000, '2025-01')], REF), null)
})

test('contrato de cliente tem precedencia sobre o legado do mesmo mes', () => {
  const r = consolidarMinimo([
    contrato(null, 80_000, REF),
    contrato('c1', 10_000, '2026-01'),
  ], REF)
  assert.equal(r?.origem, 'CLIENTES')
  assert.equal(r?.qtdMinima, 10_000)
})

test('ausencia de contrato e null, nunca zero', () => {
  assert.equal(consolidarMinimo([], REF), null)
})
